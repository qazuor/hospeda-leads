import { compress } from "hono/compress";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type MiddlewareHandler } from "hono";

export function isAssetLikePath(path: string): boolean {
  const finalSegment = path.slice(path.lastIndexOf("/") + 1);
  return path.startsWith("/assets/") || /\.[^./]+$/.test(finalSegment);
}

export const cacheHeadersMiddleware: MiddlewareHandler = async (c, next) => {
  await next();
  if (c.req.path.startsWith("/assets/")) {
    if (c.res.status === 200) c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }
  if (c.req.path === "/" || c.req.path === "/index.html" || c.res.headers.get("Content-Type")?.includes("text/html")) {
    c.res.headers.set("Cache-Control", "no-cache");
  }
};

// Register before the routes so compression and cache headers wrap them.
export function applyAssetMiddleware(app: Hono): void {
  const compression = compress();

  app.use("*", async (c, next) => {
    if (c.req.path === "/_api/resources/download" || c.req.path === "/mcp" || c.req.path.startsWith("/mcp/")) return next();
    return compression(c, next);
  });
  app.use("*", cacheHeadersMiddleware);
}

// Register after the routes so API requests never hit the filesystem lookup.
export function applyStaticFallback(app: Hono, opts: { distDir: string }): void {
  const distDir = relative(process.cwd(), resolve(opts.distDir));
  app.use("/*", serveStatic({ root: distDir }));
  app.notFound(async (c) => {
    if (c.req.path.startsWith("/_api/")) return c.json({ error: "Endpoint not found" }, 404);
    if (isAssetLikePath(c.req.path)) {
      c.header("Cache-Control", "no-store");
      return c.text("Not found", 404);
    }
    try {
      const html = await readFile(resolve(opts.distDir, "index.html"), "utf8");
      c.header("Cache-Control", "no-cache");
      return c.html(html);
    } catch {
      c.header("Cache-Control", "no-cache");
      return c.text("Not found", 404);
    }
  });
}
