import { afterEach, describe, expect, it, vi } from "vitest";
import { CONNECTION_ATTRIBUTE, INSTALLED_EVENT, RECHECK_EVENT, USER_ATTRIBUTE } from "./announce";
import { CONNECTED_RECHECK_MS, RECHECK_THROTTLE_MS, connectionFromError, watchConnection } from "./connection";
import { ApiError, type StatusResponse } from "./api";

const ok = (email = "ana@hospeda.test"): StatusResponse => ({ minVersion: "1.5.0", latestVersion: "1.5.0", user: { email, displayName: "Ana" } });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const html = () => document.documentElement;
let watcher: { stop: () => void } | null = null;
const setVisibility = (value: DocumentVisibilityState) => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });

afterEach(() => { vi.useRealTimers(); watcher?.stop(); watcher = null; html().removeAttribute(CONNECTION_ATTRIBUTE); html().removeAttribute(USER_ATTRIBUTE); setVisibility("visible"); });

describe("connectionFromError", () => {
  it("maps 401 to rejected, 426 to outdated and anything else to unknown", () => {
    expect(connectionFromError(new ApiError("x", 401))).toBe("rejected");
    expect(connectionFromError(new ApiError("x", 426))).toBe("outdated");
    expect(connectionFromError(new ApiError("x", 0))).toBe("unknown");
    expect(connectionFromError(new ApiError("x", 503))).toBe("unknown");
    expect(connectionFromError(new Error("boom"))).toBe("unknown");
  });
});

describe("watchConnection", () => {
  it("reports a missing token without any request", async () => {
    const fetchStatus = vi.fn(), listener = vi.fn(); document.addEventListener(INSTALLED_EVENT, listener);
    watcher = watchConnection({ doc: document, readToken: () => "", fetchStatus }); await flush();
    expect(fetchStatus).not.toHaveBeenCalled(); expect(html().getAttribute(CONNECTION_ATTRIBUTE)).toBe("missing-token"); expect(html().hasAttribute(USER_ATTRIBUTE)).toBe(false); expect(listener).toHaveBeenCalledTimes(1);
    document.removeEventListener(INSTALLED_EVENT, listener);
  });
  it("publishes connected with the token owner's email, never the token", async () => {
    const fetchStatus = vi.fn(async () => ok());
    watcher = watchConnection({ doc: document, readToken: () => "hcu_secret_token", fetchStatus }); await flush();
    expect(fetchStatus).toHaveBeenCalledWith("hcu_secret_token");
    expect(html().getAttribute(CONNECTION_ATTRIBUTE)).toBe("connected"); expect(html().getAttribute(USER_ATTRIBUTE)).toBe("ana@hospeda.test");
    expect(document.documentElement.outerHTML).not.toContain("hcu_secret_token");
  });
  it.each([[401, "rejected"], [426, "outdated"], [0, "unknown"], [500, "unknown"]] as const)("maps a %s answer to %s and drops the user", async (status, state) => {
    watcher = watchConnection({ doc: document, readToken: () => "hcu_x", fetchStatus: async () => { throw new ApiError("x", status); } }); await flush();
    expect(html().getAttribute(CONNECTION_ATTRIBUTE)).toBe(state); expect(html().hasAttribute(USER_ATTRIBUTE)).toBe(false);
  });
  it("re-checks at once when the tab becomes visible and the state is not connected", async () => {
    let token = "", listener = vi.fn(); document.addEventListener(INSTALLED_EVENT, listener);
    const fetchStatus = vi.fn(async () => ok());
    watcher = watchConnection({ doc: document, readToken: () => token, fetchStatus }); await flush();
    expect(html().getAttribute(CONNECTION_ATTRIBUTE)).toBe("missing-token");
    token = "hcu_pasted"; setVisibility("visible"); document.dispatchEvent(new Event("visibilitychange")); await flush();
    expect(fetchStatus).toHaveBeenCalledTimes(1); expect(html().getAttribute(CONNECTION_ATTRIBUTE)).toBe("connected"); expect(listener).toHaveBeenCalledTimes(2);
    document.removeEventListener(INSTALLED_EVENT, listener);
  });
  it("throttles visibility re-checks to two minutes while connected", async () => {
    let at = 0; const fetchStatus = vi.fn(async () => ok());
    watcher = watchConnection({ doc: document, readToken: () => "hcu_x", fetchStatus, now: () => at }); await flush();
    at = CONNECTED_RECHECK_MS - 1; document.dispatchEvent(new Event("visibilitychange")); await flush(); expect(fetchStatus).toHaveBeenCalledTimes(1);
    at = CONNECTED_RECHECK_MS; document.dispatchEvent(new Event("visibilitychange")); await flush(); expect(fetchStatus).toHaveBeenCalledTimes(2);
    setVisibility("hidden"); at = CONNECTED_RECHECK_MS * 3; document.dispatchEvent(new Event("visibilitychange")); await flush(); expect(fetchStatus).toHaveBeenCalledTimes(2);
  });
  it("re-checks on the page's recheck event and announces only changes", async () => {
    const answers: Array<() => Promise<StatusResponse>> = [async () => { throw new ApiError("x", 0); }, async () => ok(), async () => ok()];
    const fetchStatus = vi.fn(() => answers.shift()!()), listener = vi.fn(); document.addEventListener(INSTALLED_EVENT, listener);
    let at = 0; watcher = watchConnection({ doc: document, readToken: () => "hcu_x", fetchStatus, now: () => at }); await flush();
    expect(html().getAttribute(CONNECTION_ATTRIBUTE)).toBe("unknown");
    at += RECHECK_THROTTLE_MS; document.dispatchEvent(new Event(RECHECK_EVENT)); await flush(); expect(html().getAttribute(CONNECTION_ATTRIBUTE)).toBe("connected");
    at += RECHECK_THROTTLE_MS; document.dispatchEvent(new Event(RECHECK_EVENT)); await flush();
    expect(fetchStatus).toHaveBeenCalledTimes(3); expect(listener).toHaveBeenCalledTimes(2);
    document.removeEventListener(INSTALLED_EVENT, listener);
  });
  it("throttles page re-checks to one every five seconds, collapsing a burst into one trailing check", async () => {
    vi.useFakeTimers(); const fetchStatus = vi.fn(async () => ok());
    watcher = watchConnection({ doc: document, readToken: () => "hcu_x", fetchStatus }); await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) document.dispatchEvent(new Event(RECHECK_EVENT));
    await vi.advanceTimersByTimeAsync(RECHECK_THROTTLE_MS - 1); expect(fetchStatus).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(fetchStatus).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(RECHECK_THROTTLE_MS); document.dispatchEvent(new Event(RECHECK_EVENT)); await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });
  it("never doubles a check in flight", async () => {
    let release: (value: StatusResponse) => void = () => undefined;
    const fetchStatus = vi.fn(() => new Promise<StatusResponse>(resolve => { release = resolve; }));
    let at = 0; watcher = watchConnection({ doc: document, readToken: () => "hcu_x", fetchStatus, now: () => at }); await flush();
    at = RECHECK_THROTTLE_MS; document.dispatchEvent(new Event(RECHECK_EVENT)); await flush();
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    release(ok()); await flush(); expect(html().getAttribute(CONNECTION_ATTRIBUTE)).toBe("connected");
  });
  it("drops a pending trailing check when stopped", async () => {
    vi.useFakeTimers(); const fetchStatus = vi.fn(async () => ok());
    const w = watchConnection({ doc: document, readToken: () => "hcu_x", fetchStatus }); await vi.advanceTimersByTimeAsync(0);
    document.dispatchEvent(new Event(RECHECK_EVENT)); w.stop(); await vi.advanceTimersByTimeAsync(RECHECK_THROTTLE_MS * 2);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });
});
