import type { Hono, MiddlewareHandler } from "hono";
import superjson from "superjson";
import { logLine } from "./observability";

/** Content-Security-Policy applied in REPORT-ONLY mode (decision D-13: collect violations before enforcing). */
export const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self'",
  // Mantine and the inline `@layer` declaration in index.html need inline styles; Google Fonts CSS is imported from the stylesheets.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Material previews use blob: URLs and PDF thumbnails data: URLs; pdf.js runs in a worker served from /assets (or a blob).
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** Bearer-token clients without browser cookies: they are not CSRF-able, so the Origin check skips them. */
export const ORIGIN_GUARD_EXEMPT_PATHS: ReadonlySet<string> = new Set(["/_api/brevo/events", "/_api/business_import", "/_api/inbound/email", "/_api/inbound/addresses", "/_api/userscript/register"]);
const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const originOf = (value: string | undefined | null): string | null => {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null; } catch { return null; }
};

/**
 * Decides whether a state-changing request comes from this app. Origin (or Referer) must match the request origin or PUBLIC_APP_URL.
 * `forwardedOrigin` is `https://<Host>` when the proxy sent `X-Forwarded-Proto: https` (node-server ignores it, so the request URL stays http).
 * A literal `Origin: null` never matches, even with Sec-Fetch-Site same-origin (sandboxed frames and some redirects send it): it is rejected on purpose.
 * Without either header only browsers that declare a cross-site/same-site fetch are refused; plain HTTP clients (scripts, tests) send neither.
 */
export function isAllowedOrigin(input: { origin?: string | null; referer?: string | null; secFetchSite?: string | null; requestOrigin: string | null; publicOrigin: string | null; forwardedOrigin?: string | null }): boolean {
  const allowed = [input.requestOrigin, input.publicOrigin, input.forwardedOrigin].filter((v): v is string => !!v);
  if (input.origin != null) return allowed.includes(originOf(input.origin) ?? "");
  const referer = originOf(input.referer);
  if (referer) return allowed.includes(referer);
  const site = input.secFetchSite;
  return !site || site === "same-origin" || site === "none";
}

/** Rejects cross-site state-changing /_api requests with a Spanish superjson 403. */
export const originGuard: MiddlewareHandler = async (c, next) => {
  const path = c.req.path;
  if (!path.startsWith("/_api/") || !STATE_CHANGING.has(c.req.method) || ORIGIN_GUARD_EXEMPT_PATHS.has(path)) return next();
  const host = c.req.header("Host");
  const forwardedOrigin = c.req.header("X-Forwarded-Proto")?.split(",")[0]?.trim().toLowerCase() === "https" && host ? originOf(`https://${host}`) : null;
  const origin = c.req.header("Origin"), referer = c.req.header("Referer"), secFetchSite = c.req.header("Sec-Fetch-Site");
  const ok = isAllowedOrigin({ origin, referer, secFetchSite, requestOrigin: originOf(c.req.url), publicOrigin: originOf(process.env["PUBLIC_APP_URL"]), forwardedOrigin });
  if (ok) return next();
  // Diagnostics only: no cookies, bodies or full referer paths.
  logLine("warn", { event: "origin_rejected", method: c.req.method, path, origin: origin?.slice(0, 200) ?? null, refererHost: originOf(referer)?.replace(/^https?:\/\//, "") ?? null, secFetchSite: secFetchSite ?? null, host: host ?? null });
  return new Response(superjson.stringify({ error: "Origen no permitido" }), { status: 403, headers: { "Content-Type": "application/json" } });
};

/** Adds security headers after the handler ran; never overrides a policy the handler chose (e.g. the MCP consent page). */
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  // Response.redirect() (MCP OAuth consent) has immutable headers: rebuild the response so headers can be added.
  try { c.res.headers.set("X-Content-Type-Options", "nosniff"); } catch { c.res = new Response(c.res.body, c.res); }
  const h = c.res.headers;
  const set = (name: string, value: string) => { if (!h.has(name)) h.set(name, value); };
  set("X-Frame-Options", "DENY");
  set("X-Content-Type-Options", "nosniff");
  set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env["NODE_ENV"] === "production") set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (!h.has("Content-Security-Policy")) set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);
};

/** Registers both middlewares. Call after applyAssetMiddleware so compress() preserves headers set late, and before the routes. */
export function applySecurity(app: Hono): void {
  app.use("*", securityHeaders);
  app.use("*", originGuard);
}
