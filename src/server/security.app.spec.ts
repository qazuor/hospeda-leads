// @vitest-environment node
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { createAdaptorServer } from "@hono/node-server";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Replace only the MCP sub-app: the rest of the real app (middleware stack, /_api routes, fallbacks) is exercised.
vi.mock("./mcp/routes", () => ({
  mcpRoutes: () => {
    const mcp = new Hono();
    mcp.post("/mcp/oauth/authorize", () => Response.redirect("https://chatgpt.com/connector_platform_oauth_redirect?code=c", 303));
    mcp.post("/mcp/oauth/token", (c) => c.json({ ok: true }));
    return mcp;
  },
}));

const TOUCHED = ["DATABASE_URL", "JWT_SECRET", "PUBLIC_APP_URL"];
const saved: Record<string, string | undefined> = {};
let server: ReturnType<typeof createAdaptorServer>;
let port = 0;

beforeAll(async () => {
  for (const k of TOUCHED) saved[k] = process.env[k];
  process.env["DATABASE_URL"] = "postgres://u:p@127.0.0.1:1/x";
  process.env["JWT_SECRET"] = "app-security-test-secret-0123456789abcdef";
  process.env["PUBLIC_APP_URL"] = "https://crm.example.com";
  const { app } = await import("./app");
  server = createAdaptorServer({ fetch: app.fetch });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  for (const k of TOUCHED) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  return new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = (path: string, headers: Record<string, string>) => new Promise<{ status: number; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
  const req = httpRequest({ host: "127.0.0.1", port, path, method: "POST", agent: false, headers: { "Content-Length": "2", ...headers } }, (res) => { res.resume(); res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers })); });
  req.on("error", reject);
  req.end("{}");
});

describe("the full app middleware stack with MCP", () => {
  it("does not turn an MCP OAuth redirect (Response.redirect, immutable headers) into a 500", async () => {
    const res = await post("/mcp/oauth/authorize", { Origin: "https://crm.example.com", "Content-Type": "application/x-www-form-urlencoded" });
    expect(res.status).toBe(303);
    expect(res.headers["location"]).toContain("https://chatgpt.com/connector_platform_oauth_redirect");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });
  it("leaves cross-origin MCP requests (token exchange from the connector) to the MCP routes", async () => {
    const res = await post("/mcp/oauth/token", { Origin: "https://chatgpt.com" });
    expect(res.status).toBe(200);
  });
  it("still rejects a cross-origin POST to a cookie-authenticated /_api route before auth", async () => {
    expect((await post("/_api/commercial", { Origin: "https://evil.example" })).status).toBe(403);
  });
});
