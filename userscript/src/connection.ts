import { CONNECTION_ATTRIBUTE, INSTALLED_EVENT, RECHECK_EVENT, USER_ATTRIBUTE } from "./announce";
import type { StatusResponse } from "./api";

/** What the CRM page learns about the script's token (spec 96 §3.1). */
export type ConnectionState = "connected" | "missing-token" | "rejected" | "outdated" | "unknown";
/** A connected state is re-checked at most this often when the tab becomes visible again. */
export const CONNECTED_RECHECK_MS = 2 * 60_000;

/** 401 → the token was revoked or is invalid; 426 → the CRM refuses this version; anything else (network, timeout, 5xx) proves nothing. */
export function connectionFromError(error: unknown): ConnectionState {
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : 0;
  return status === 401 ? "rejected" : status === 426 ? "outdated" : "unknown";
}

type WatchOptions = { doc: Document; readToken: () => string; fetchStatus: (token: string) => Promise<StatusResponse>; now?: () => number };

/**
 * Spec 96 §3.1: on the CRM origin, checks the saved token against `GET /_api/userscript/status` and publishes only the state (and, when
 * connected, the token owner's email) as attributes on <html>, dispatching INSTALLED_EVENT when they change. Without a token no request is
 * made; while the first answer is pending nothing is published (the page waits, as it does for the version). Re-checks when the tab becomes visible (at once unless connected, then at most every two minutes) and on RECHECK_EVENT.
 * The token and the response body never reach the page.
 */
export function watchConnection({ doc, readToken, fetchStatus, now = Date.now }: WatchOptions): { check: () => Promise<void>; stop: () => void } {
  let state: ConnectionState | null = null, user: string | null = null, lastCheck = -Infinity, running: Promise<void> | null = null;
  const publish = (next: ConnectionState, email: string | null) => {
    if (next === state && email === user) return;
    state = next; user = email;
    doc.documentElement.setAttribute(CONNECTION_ATTRIBUTE, next);
    if (email) doc.documentElement.setAttribute(USER_ATTRIBUTE, email); else doc.documentElement.removeAttribute(USER_ATTRIBUTE);
    doc.dispatchEvent(new Event(INSTALLED_EVENT));
  };
  const run = async () => {
    lastCheck = now();
    const token = readToken();
    if (!token) { publish("missing-token", null); return; }
    try { const status = await fetchStatus(token); publish("connected", typeof status.user?.email === "string" ? status.user.email : null); }
    catch (error) { publish(connectionFromError(error), null); }
  };
  const check = () => { running ??= run().finally(() => { running = null; }); return running; };
  const onVisible = () => { if (doc.visibilityState !== "visible") return; if (state !== "connected" || now() - lastCheck >= CONNECTED_RECHECK_MS) void check(); };
  const onRecheck = () => { void check(); };
  doc.addEventListener("visibilitychange", onVisible);
  doc.addEventListener(RECHECK_EVENT, onRecheck);
  void check();
  return { check, stop: () => { doc.removeEventListener("visibilitychange", onVisible); doc.removeEventListener(RECHECK_EVENT, onRecheck); } };
}
