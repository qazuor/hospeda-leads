import type { Context, ErrorHandler, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import superjson from "superjson";
import { keepLateHeaderMutations } from "./staticAssets";

export const GENERIC_ERROR_MESSAGE = "No se pudo completar la acción. Intentá de nuevo.";
const REQUEST_ID_HEADER = "X-Request-Id";

/** Slow-request threshold in ms (`SLOW_REQUEST_MS`, default 1000). Read per request so tests and deploys can tune it. */
function slowRequestMs(): number {
  const n = Number.parseInt(process.env.SLOW_REQUEST_MS ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1000;
}

/** Path only: the query string is never logged because it can carry emails or search terms. Public share tokens (`/m/<token>`) are credentials: redacted. */
export function redactPath(path: string): string {
  return path.replace(/^\/m\/[^/]+/, "/m/:token").slice(0, 200);
}
function safePath(c: Context): string {
  return redactPath(c.req.path);
}

/** One JSON line by level; callers must pass no cookies, bodies or tokens. */
export function logLine(level: "warn" | "error", fields: Record<string, unknown>): void {
  const line = JSON.stringify({ level, ...fields });
  if (level === "error") console.error(line);
  else console.warn(line);
}

/**
 * Assigns a request id (never trusted from the client), exposes it as `X-Request-Id` and logs one JSON line
 * for 5xx responses or requests slower than `SLOW_REQUEST_MS`. Logs method, path, status, duration and id only:
 * no query string, body, cookies or tokens. Thrown errors are logged once by `onError` instead.
 */
export const requestContext: MiddlewareHandler = async (c, next) => {
  const reqId = crypto.randomUUID();
  const started = performance.now();
  c.set("reqId", reqId);
  await next();
  const ms = Math.round(performance.now() - started);
  // @hono/node-server's lightweight Response drops headers set after construction until its body is read: materialize first.
  keepLateHeaderMutations(c);
  try {
    c.res.headers.set(REQUEST_ID_HEADER, reqId);
  } catch {
    // Immutable headers (e.g. Response.redirect()): rebuild the response to carry the id.
    c.res = new Response(c.res.body, c.res);
    c.res.headers.set(REQUEST_ID_HEADER, reqId);
  }
  const status = c.res.status;
  if (c.error) return;
  if (status >= 500) logLine("error", { reqId, method: c.req.method, path: safePath(c), status, ms });
  else if (ms >= slowRequestMs()) logLine("warn", { reqId, method: c.req.method, path: safePath(c), status, ms, slow: true });
};

const PG_FIELDS = ["table_name", "column_name", "constraint_name"] as const;

/** Duck-typed postgres.js error: 5-char SQLSTATE `code` plus `severity` (same rule as crmErrors). */
function isPgError(error: unknown): error is Error & Record<string, unknown> {
  const e = error as { code?: unknown; severity?: unknown };
  return typeof e?.code === "string" && /^[0-9A-Z]{5}$/.test(e.code) && e.severity !== undefined;
}

/**
 * Loggable summary of an error. Postgres messages can embed user input (e.g. `invalid input syntax ... "x@y.com"`),
 * so pg errors log name, SQLSTATE and schema identifiers only; other messages are cut to 200 chars.
 * The stack keeps only its `at` frames because its first line repeats the message.
 */
function describeError(error: Error): Record<string, unknown> {
  const stack = error.stack?.split("\n").filter((line) => line.trimStart().startsWith("at ")).join("\n");
  if (!isPgError(error)) return { name: error.name, message: error.message.slice(0, 200), stack };
  const fields: Record<string, unknown> = { name: error.name, code: error.code };
  for (const key of PG_FIELDS) if (typeof error[key] === "string") fields[key] = error[key];
  return { ...fields, stack };
}

/** Global error handler: logs the real error with the request id, answers a generic Spanish 500 and never echoes the raw error. */
export const onError: ErrorHandler = (error, c) => {
  if (error instanceof HTTPException && error.status < 500) return error.getResponse();
  const reqId = (c.get("reqId") as string | undefined) ?? crypto.randomUUID();
  logLine("error", { reqId, method: c.req.method, path: safePath(c), ...describeError(error) });
  if (c.req.path.startsWith("/_api/")) {
    return new Response(superjson.stringify({ error: GENERIC_ERROR_MESSAGE, requestId: reqId }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  return c.text(GENERIC_ERROR_MESSAGE, 500);
};

/**
 * Health handler. `ping` is a cheap DB round trip (`select 1`); it must settle within `timeoutMs`.
 * Without `ping` it is a pure liveness probe. The body never includes error details: only `db: "ok" | "error"`.
 */
export function createHealthHandler(opts: { ping?: () => Promise<unknown>; timeoutMs?: number; cacheMs?: number }) {
  const { ping, timeoutMs = 2000, cacheMs = 0 } = opts;
  // Concurrent callers share one in-flight check and its result is reused for `cacheMs`, so repeated hits during DB trouble cannot pile up pool connections.
  let inflight: Promise<boolean> | undefined;
  let cached: { at: number; ok: boolean } | undefined;
  const check = async (): Promise<boolean> => {
    if (!ping) return true;
    if (cached && performance.now() - cached.at < cacheMs) return cached.ok;
    inflight ??= (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let ok = true;
      try {
        await Promise.race([ping(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("health timeout")), timeoutMs); })]);
      } catch (error) {
        ok = false;
        logLine("error", { name: "HealthCheckFailed", code: isPgError(error) ? error.code : undefined, message: error instanceof Error && !isPgError(error) ? error.message.slice(0, 200) : undefined });
      } finally {
        clearTimeout(timer);
        cached = { at: performance.now(), ok };
        inflight = undefined;
      }
      return ok;
    })();
    return inflight;
  };
  return async (c: Context): Promise<Response> => {
    if (!ping) return c.json({ ok: true, service: "hospeda-leads" });
    return (await check()) ? c.json({ ok: true, service: "hospeda-leads", db: "ok" }) : c.json({ ok: false, service: "hospeda-leads", db: "error" }, 503);
  };
}
