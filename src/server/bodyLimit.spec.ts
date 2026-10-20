// @vitest-environment node
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { createAdaptorServer } from "@hono/node-server";
import { Hono } from "hono";
import superjson from "superjson";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyBodyLimit, bodyLimitFor, DEFAULT_BODY_LIMIT } from "./bodyLimit";

describe("bodyLimitFor", () => {
  it("uses the default cap and larger per-route caps", () => {
    expect(bodyLimitFor("/_api/commercial")).toBe(DEFAULT_BODY_LIMIT);
    expect(bodyLimitFor("/_api/brevo/events")).toBe(DEFAULT_BODY_LIMIT);
    expect(bodyLimitFor("/_api/resources")).toBeGreaterThanOrEqual(2_900_000);
    expect(bodyLimitFor("/_api/business_import")).toBeGreaterThanOrEqual(2 * 1024 * 1024 + 4096);
    expect(bodyLimitFor("/_api/data_quality")).toBeGreaterThanOrEqual(2 * 1024 * 1024 + 4096);
  });
});

describe("applyBodyLimit through the node adapter", () => {
  const app = new Hono();
  const server = createAdaptorServer({ fetch: app.fetch });
  let port = 0;
  beforeAll(async () => {
    applyBodyLimit(app);
    for (const path of ["/_api/commercial", "/_api/resources", "/_api/brevo/events", "/other"]) app.post(path, async (c) => c.json({ bytes: (await c.req.text()).length }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const send = (path: string, chunks: string[], chunked: boolean) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method: "POST", agent: false, headers: chunked ? { "Transfer-Encoding": "chunked" } : { "Content-Length": String(chunks.join("").length) } }, (res) => {
      let body = ""; res.on("data", (d) => (body += d)); res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });

  it("rejects an over-limit body with a Spanish superjson 413", async () => {
    const res = await send("/_api/commercial", ["x".repeat(DEFAULT_BODY_LIMIT + 1)], false);
    expect(res.status).toBe(413);
    expect(superjson.parse<{ error: string }>(res.body).error).toBe("La solicitud es demasiado grande.");
  });
  it("accepts a body just under the limit", async () => {
    const res = await send("/_api/commercial", ["x".repeat(DEFAULT_BODY_LIMIT)], false);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).bytes).toBe(DEFAULT_BODY_LIMIT);
  });
  it("counts a chunked request without Content-Length", async () => {
    const over = await send("/_api/commercial", ["x".repeat(100_000), "x".repeat(100_000), "x".repeat(100_000)], true);
    expect(over.status).toBe(413);
    const under = await send("/_api/commercial", ["x".repeat(100_000), "x".repeat(100_000)], true);
    expect(under.status).toBe(200);
    expect(JSON.parse(under.body).bytes).toBe(200_000);
  });
  it("lets resource uploads exceed the default cap but not their own", async () => {
    expect((await send("/_api/resources", ["x".repeat(2_500_000)], false)).status).toBe(200);
    expect((await send("/_api/resources", ["x".repeat(3 * 1024 * 1024 + 1)], false)).status).toBe(413);
  });
  it("keeps the webhook working and leaves non-API paths alone", async () => {
    expect((await send("/_api/brevo/events", [JSON.stringify({ event: "delivered" })], false)).status).toBe(200);
    expect((await send("/other", ["x".repeat(DEFAULT_BODY_LIMIT * 2)], false)).status).toBe(200);
  });
});
