import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import superjson from "superjson";

/** Default cap for any /_api request body. */
export const DEFAULT_BODY_LIMIT = 256 * 1024;
const MiB = 1024 * 1024;
/**
 * Per-route caps for the legitimately large payloads. Each must stay >= the route's own check:
 * resources (2.9 MB raw, base64 file), business_import / data_quality (maxFileBytes 2 MiB of rows + envelope), settings_save (templates/variables).
 */
export const ROUTE_BODY_LIMITS: Readonly<Record<string, number>> = {
  "/_api/resources": 3 * MiB,
  "/_api/business_import": 3 * MiB,
  "/_api/data_quality": 3 * MiB,
  "/_api/settings_save": MiB,
  "/_api/inbound/instagram": MiB,
};

/** Resolves the body cap for a request path. */
export function bodyLimitFor(path: string): number {
  return ROUTE_BODY_LIMITS[path] ?? DEFAULT_BODY_LIMIT;
}

/**
 * Registers one global middleware that, for `/_api/` paths only (no `/_api` wildcard route: routes.spec forbids them), picks the cap by path (Hono would run both a generic and a specific `use`, so a single selector is needed).
 * Rejects with 413 and a Spanish superjson `{error}`; bodies without Content-Length are counted while streaming. `/mcp` keeps its own limit.
 */
export function applyBodyLimit(app: Hono): void {
  app.use("*", (c, next) => !c.req.path.startsWith("/_api/") ? next() :
    bodyLimit({
      maxSize: bodyLimitFor(c.req.path),
      onError: () => new Response(superjson.stringify({ error: "La solicitud es demasiado grande." }), { status: 413, headers: { "Content-Type": "application/json" } }),
    })(c, next),
  );
}
