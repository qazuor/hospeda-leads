// @vitest-environment node
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { createAdaptorServer } from "@hono/node-server";
import { Hono } from "hono";
import superjson from "superjson";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { applyBodyLimit } from "./bodyLimit";
import { applySecurity, CSP_REPORT_ONLY, isAllowedOrigin } from "./security";
import { applyAssetMiddleware } from "./staticAssets";

const base = { requestOrigin: "http://127.0.0.1:3001", publicOrigin: "https://crm.example.com" };

describe("isAllowedOrigin", () => {
  it("accepts the request origin and PUBLIC_APP_URL, rejects everything else", () => {
    expect(isAllowedOrigin({ ...base, origin: "http://127.0.0.1:3001" })).toBe(true);
    expect(isAllowedOrigin({ ...base, origin: "https://crm.example.com" })).toBe(true);
    expect(isAllowedOrigin({ ...base, origin: "https://evil.example" })).toBe(false);
    expect(isAllowedOrigin({ ...base, origin: "null" })).toBe(false);
    expect(isAllowedOrigin({ ...base, origin: "https://crm.example.com.evil.example" })).toBe(false);
  });
  it("falls back to Referer, then to Sec-Fetch-Site", () => {
    expect(isAllowedOrigin({ ...base, referer: "https://crm.example.com/accounts?x=1" })).toBe(true);
    expect(isAllowedOrigin({ ...base, referer: "https://evil.example/page" })).toBe(false);
    expect(isAllowedOrigin({ ...base })).toBe(true);
    expect(isAllowedOrigin({ ...base, secFetchSite: "same-origin" })).toBe(true);
    expect(isAllowedOrigin({ ...base, secFetchSite: "none" })).toBe(true);
    expect(isAllowedOrigin({ ...base, secFetchSite: "cross-site" })).toBe(false);
    expect(isAllowedOrigin({ ...base, secFetchSite: "same-site" })).toBe(false);
  });
});

describe("security middlewares through the node adapter", () => {
  const app = new Hono();
  const server = createAdaptorServer({ fetch: app.fetch });
  let port = 0;
  const savedUrl = process.env["PUBLIC_APP_URL"];
  const savedEnv = process.env["NODE_ENV"];
  beforeAll(async () => {
    process.env["PUBLIC_APP_URL"] = "https://crm.example.com";
    applyAssetMiddleware(app);
    applySecurity(app);
    applyBodyLimit(app);
    app.post("/_api/commercial", (c) => { c.header("Set-Cookie", "session=abc; Path=/; HttpOnly"); return c.json({ ok: true }); });
    app.get("/_api/commercial", (c) => c.json({ ok: true }));
    for (const path of ["/_api/brevo/events", "/_api/business_import", "/_api/leads_ingest"]) app.post(path, (c) => c.json({ ok: true }));
    app.post("/mcp/redirect", () => Response.redirect("https://chatgpt.com/cb?code=1", 303));
    app.get("/mcp/page", (c) => c.html("<p>consent</p>", 200, { "Content-Security-Policy": "default-src 'none'" }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterEach(() => { if (savedEnv === undefined) delete process.env["NODE_ENV"]; else process.env["NODE_ENV"] = savedEnv; });
  afterAll(() => {
    if (savedUrl === undefined) delete process.env["PUBLIC_APP_URL"]; else process.env["PUBLIC_APP_URL"] = savedUrl;
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const send = (method: string, path: string, headers: Record<string, string> = {}) => new Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method, agent: false, headers: { ...(method === "POST" ? { "Content-Length": "2" } : {}), ...headers } }, (res) => {
      let body = ""; res.on("data", (d) => (body += d)); res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
    });
    req.on("error", reject);
    if (method === "POST") req.write("{}");
    req.end();
  });

  it("sets the report-only CSP and hardening headers without enforcing a CSP", async () => {
    const res = await send("GET", "/_api/commercial");
    expect(res.headers["content-security-policy-report-only"]).toBe(CSP_REPORT_ONLY);
    expect(res.headers["content-security-policy"]).toBeUndefined();
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });
  it("adds HSTS only in production", async () => {
    process.env["NODE_ENV"] = "production";
    expect((await send("GET", "/_api/commercial")).headers["strict-transport-security"]).toContain("max-age=");
  });
  it("keeps a policy chosen by the handler (MCP consent page) and the cookie set by the route", async () => {
    const page = await send("GET", "/mcp/page");
    expect(page.headers["content-security-policy"]).toBe("default-src 'none'");
    expect(page.headers["content-security-policy-report-only"]).toBeUndefined();
    const post = await send("POST", "/_api/commercial", { Origin: "https://crm.example.com" });
    expect(post.status).toBe(200);
    expect(String(post.headers["set-cookie"])).toContain("session=abc");
    expect(post.headers["x-frame-options"]).toBe("DENY");
  });
  it("rejects a cross-site POST with a Spanish superjson 403 and never reaches the handler", async () => {
    const res = await send("POST", "/_api/commercial", { Origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(superjson.parse<{ error: string }>(res.body).error).toBe("Origen no permitido");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect((await send("POST", "/_api/commercial", { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await send("POST", "/_api/commercial", { Referer: "https://evil.example/x" })).status).toBe(403);
  });
  it("allows same-origin, PUBLIC_APP_URL, header-less clients and all GETs", async () => {
    expect((await send("POST", "/_api/commercial", { Origin: `http://127.0.0.1:${port}` })).status).toBe(200);
    expect((await send("POST", "/_api/commercial", { Origin: "https://crm.example.com" })).status).toBe(200);
    expect((await send("POST", "/_api/commercial")).status).toBe(200);
    expect((await send("GET", "/_api/commercial", { Origin: "https://evil.example" })).status).toBe(200);
  });
  it("adds headers to a Response.redirect() with immutable headers instead of failing with 500", async () => {
    const res = await send("POST", "/mcp/redirect");
    expect(res.status).toBe(303);
    expect(res.headers["location"]).toBe("https://chatgpt.com/cb?code=1");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["content-security-policy-report-only"]).toBe(CSP_REPORT_ONLY);
  });
  it("trusts https://<Host> only when the proxy sent X-Forwarded-Proto: https", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env["PUBLIC_APP_URL"];
    try {
      const headers = { Origin: "https://crm.example.com", Host: "crm.example.com" };
      expect((await send("POST", "/_api/commercial", { ...headers, "X-Forwarded-Proto": "https" })).status).toBe(200);
      const denied = await send("POST", "/_api/commercial", headers);
      expect(denied.status).toBe(403);
      expect((await send("POST", "/_api/commercial", { ...headers, "X-Forwarded-Proto": "http" })).status).toBe(403);
      const line = JSON.parse(String(warn.mock.calls[0]?.[0])) as Record<string, unknown>;
      expect(line).toMatchObject({ level: "warn", event: "origin_rejected", method: "POST", path: "/_api/commercial", origin: "https://crm.example.com", host: "crm.example.com" });
      expect(JSON.stringify(line)).not.toContain("cookie");
    } finally { warn.mockRestore(); process.env["PUBLIC_APP_URL"] = "https://crm.example.com"; }
  });
  it("keeps rejecting a literal Origin: null even when Sec-Fetch-Site says same-origin", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try { expect((await send("POST", "/_api/commercial", { Origin: "null", "Sec-Fetch-Site": "same-origin" })).status).toBe(403); } finally { warn.mockRestore(); }
  });
  it("lets bearer-token clients through regardless of Origin", async () => {
    for (const path of ["/_api/brevo/events", "/_api/business_import", "/_api/leads_ingest"]) expect((await send("POST", path, { Origin: "https://evil.example" })).status).toBe(200);
  });
});
