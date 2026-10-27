// @vitest-environment node
import type { AddressInfo } from "node:net";
import { createAdaptorServer } from "@hono/node-server";
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHealthHandler, GENERIC_ERROR_MESSAGE, onError, redactPath, requestContext } from "./observability";
import { applyAssetMiddleware } from "./staticAssets";

const buildApp = () => {
  const app = new Hono();
  app.use("*", requestContext);
  app.onError(onError);
  applyAssetMiddleware(app);
  return app;
};

const logged = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SLOW_REQUEST_MS;
});

describe("onError + requestContext", () => {
  it("turns a thrown error into a generic Spanish 500 with the request id and logs it once", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = buildApp();
    app.get("/_api/boom", () => {
      throw new Error('duplicate key value violates unique constraint "secret_idx"');
    });
    const res = await app.request("/_api/boom?email=a@b.com");
    const text = await res.text();
    const reqId = res.headers.get("X-Request-Id");
    expect(res.status).toBe(500);
    expect(reqId).toMatch(/^[0-9a-f-]{36}$/);
    expect(text).toContain(GENERIC_ERROR_MESSAGE);
    expect(text).toContain(reqId as string);
    expect(text).not.toContain("duplicate key");
    const lines = logged(errorSpy);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "error", reqId, method: "GET", path: "/_api/boom", message: expect.stringContaining("duplicate key") });
    expect(JSON.stringify(lines[0])).not.toContain("a@b.com");
  });

  it("does not log user input embedded in Postgres error messages", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = buildApp();
    app.get("/_api/pg", () => {
      throw Object.assign(new Error('invalid input syntax for type uuid: "x@y.com"'), { code: "22P02", severity: "ERROR", table_name: "leads", column_name: "id" });
    });
    app.get("/_api/long", () => {
      throw new Error("z".repeat(500));
    });
    await app.request("/_api/pg");
    await app.request("/_api/long");
    const [pg, long] = logged(errorSpy);
    expect(JSON.stringify(pg)).not.toContain("x@y.com");
    expect(pg).toMatchObject({ code: "22P02", table_name: "leads", column_name: "id" });
    expect(pg.stack).toContain("at ");
    expect((long.message as string).length).toBe(200);
  });

  it("keeps non-API errors generic and ignores a client-supplied request id", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = buildApp();
    app.get("/page", () => {
      throw new Error("internal detail");
    });
    const res = await app.request("/page", { headers: { "X-Request-Id": "attacker" } });
    expect(res.status).toBe(500);
    expect(await res.text()).toBe(GENERIC_ERROR_MESSAGE);
    expect(res.headers.get("X-Request-Id")).not.toBe("attacker");
  });

  it("logs a returned 5xx response once, without query string, body or cookies", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = buildApp();
    app.post("/_api/fail", () => new Response("{}", { status: 503 }));
    await app.request("/_api/fail?email=a@b.com", { method: "POST", headers: { Cookie: "session=tok" }, body: "password=hunter2" });
    const lines = logged(errorSpy);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "error", method: "POST", path: "/_api/fail", status: 503 });
    expect(JSON.stringify(lines[0])).not.toMatch(/a@b\.com|tok|hunter2/);
  });

  it("logs slow requests and stays silent for fast ones", async () => {
    process.env.SLOW_REQUEST_MS = "20";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = buildApp();
    app.get("/_api/slow", async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return new Response("ok");
    });
    app.get("/_api/fast", () => new Response("ok"));
    await app.request("/_api/fast");
    expect(warnSpy).not.toHaveBeenCalled();
    const res = await app.request("/_api/slow");
    const lines = logged(warnSpy);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "warn", reqId: res.headers.get("X-Request-Id"), path: "/_api/slow", status: 200, slow: true });
    expect(lines[0].ms as number).toBeGreaterThanOrEqual(20);
  });

  it("adds the request id to responses with immutable headers", async () => {
    const app = buildApp();
    app.get("/go", () => Response.redirect("http://localhost/elsewhere", 302));
    const res = await app.request("/go");
    expect(res.status).toBe(302);
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });
});

describe("createHealthHandler", () => {
  const run = (opts: Parameters<typeof createHealthHandler>[0]) => {
    const app = new Hono();
    app.get("/h", createHealthHandler(opts));
    return app.request("/h");
  };

  it("answers ok when the database responds", async () => {
    const res = await run({ ping: async () => 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "hospeda-leads", db: "ok" });
  });

  it("answers 503 without details when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await run({ ping: async () => { throw new Error("connect ECONNREFUSED 10.0.0.5:5432"); } });
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ ok: false, service: "hospeda-leads", db: "error" });
    expect(text).not.toContain("ECONNREFUSED");
  });

  it("answers 503 when the database hangs past the timeout", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await run({ ping: () => new Promise(() => {}), timeoutMs: 30 });
    expect(res.status).toBe(503);
  });

  it("liveness (no ping, used by /_api/health) never touches the database", async () => {
    const res = await run({});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "hospeda-leads" });
  });
});

// Regression guard for the @hono/node-server lightweight Response: X-Request-Id AND Set-Cookie must both survive.
describe("requestContext behind @hono/node-server", () => {
  const app = buildApp();
  const server = createAdaptorServer({ fetch: app.fetch });
  let origin = "";

  beforeAll(async () => {
    app.post("/_api/auth/login", () => {
      const response = new Response(JSON.stringify({ user: { id: "u1" } }), { headers: { "Content-Type": "application/json" } });
      response.headers.set("Set-Cookie", "session=abc; HttpOnly; Path=/");
      return response;
    });
    app.get("/_api/big", () => {
      const response = new Response(JSON.stringify({ payload: "x".repeat(4096) }), { headers: { "Content-Type": "application/json" } });
      response.headers.set("Set-Cookie", "session=rolled; HttpOnly; Path=/");
      return response;
    });
    app.get("/mcp", () => {
      const response = new Response("{}", { headers: { "Content-Type": "application/json" } });
      response.headers.set("Set-Cookie", "mcp=1; Path=/");
      return response;
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", () => resolveListen()));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  });

  it("keeps X-Request-Id and Set-Cookie on a small login-like response", async () => {
    const response = await fetch(`${origin}/_api/auth/login`, { method: "POST", headers: { "Accept-Encoding": "gzip" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.getSetCookie()).toEqual(["session=abc; HttpOnly; Path=/"]);
    expect(await response.json()).toEqual({ user: { id: "u1" } });
  });

  it("keeps X-Request-Id and Set-Cookie on a compressed response", async () => {
    const response = await fetch(`${origin}/_api/big`, { headers: { "Accept-Encoding": "gzip" } });
    expect(response.headers.get("Content-Encoding")).toBe("gzip");
    expect(response.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.getSetCookie()).toEqual(["session=rolled; HttpOnly; Path=/"]);
  });

  it("keeps both on paths excluded from compression", async () => {
    const response = await fetch(`${origin}/mcp`);
    expect(response.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.getSetCookie()).toEqual(["mcp=1; Path=/"]);
  });
});

describe("redactPath", () => {
  it("never logs a public share token (spec 89 §7)", () => {
    const token = "A".repeat(43);
    expect(redactPath(`/m/${token}`)).toBe("/m/:token");
    expect(redactPath(`/m/${token}/file`)).toBe("/m/:token/file");
    expect(redactPath("/_api/leads")).toBe("/_api/leads");
    expect(redactPath("/mcp/x")).toBe("/mcp/x");
  });
});
