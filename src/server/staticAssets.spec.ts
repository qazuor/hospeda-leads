import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyAssetMiddleware, applyStaticFallback, isAssetLikePath } from "./staticAssets";

describe("isAssetLikePath", () => {
  it.each([
    ["/assets/app.js", true],
    ["/assets/old-hash.css", true],
    ["/accounts/12", false],
    ["/accounts/acme.example", true],
    ["/", false],
    ["/assets/", true],
  ])("classifies %s", (path, expected) => {
    expect(isAssetLikePath(path)).toBe(expected);
  });
});

describe("applyAssetMiddleware + applyStaticFallback", () => {
  const distDir = mkdtempSync(join(tmpdir(), "hospeda-static-assets-"));
  const app = new Hono();

  beforeAll(() => {
    writeFileSync(join(distDir, "index.html"), "<!doctype html><html><body>CRM shell</body></html>");
    const assetsDir = join(distDir, "assets");
    mkdirSync(assetsDir);
    writeFileSync(join(assetsDir, "app-abc123.js"), `window.payload = "${"x".repeat(2048)}";`);

    applyAssetMiddleware(app);
    app.get("/_api/x", (c) => c.json({ payload: "x".repeat(2048) }));
    app.get("/_api/resources/download", (c) => c.text("download payload"));
    applyStaticFallback(app, { distDir });
  });

  afterAll(() => rmSync(distDir, { recursive: true, force: true }));

  it("serves hashed assets with immutable caching", async () => {
    const response = await app.request("/assets/app-abc123.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("immutable");
  });

  it("does not return the SPA shell for missing assets", async () => {
    const response = await app.request("/assets/missing.js");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).not.toContain("CRM shell");
  });

  it("returns the SPA shell for client routes without caching it", async () => {
    const response = await app.request("/accounts/12");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(await response.text()).toContain("CRM shell");
  });

  it("keeps unknown API routes as JSON 404s", async () => {
    const response = await app.request("/_api/nope");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Endpoint not found" });
  });

  it("compresses API JSON but excludes resource downloads", async () => {
    const compressed = await app.request("/_api/x", { headers: { "Accept-Encoding": "gzip" } });
    const download = await app.request("/_api/resources/download", { headers: { "Accept-Encoding": "gzip" } });
    expect(compressed.headers.get("Content-Encoding")).toBe("gzip");
    expect(download.headers.has("Content-Encoding")).toBe(false);
  });
});
