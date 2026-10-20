import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { AuthProvider, useAuth, SESSION_REFRESH_INTERVAL_MS, SESSION_STALE_MS } from "./useAuth";

const USER = { id: 1, email: "a@b.c", displayName: "A", fullName: "A", avatarUrl: null, role: "admin" };

function Probe() { return <span data-testid="state">{useAuth().authState.type}</span>; }

describe("AuthProvider session keepalive", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let respond: () => Response;
  let originalVisibilityState: PropertyDescriptor | undefined;
  const ok = () => new Response(JSON.stringify({ json: { user: USER } }), { status: 200 });
  const unauthorized = () => new Response(JSON.stringify({ json: { error: "Not authenticated" } }), { status: 401 });

  function mount() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={queryClient}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
  }
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const setVisibility = (value: string) => Object.defineProperty(document, "visibilityState", { configurable: true, value });

  beforeEach(() => {
    vi.useFakeTimers();
    originalVisibilityState = Object.getOwnPropertyDescriptor(document, "visibilityState");
    setVisibility("visible");
    respond = ok;
    fetchMock = vi.fn(async () => respond());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalVisibilityState) Object.defineProperty(document, "visibilityState", originalVisibilityState);
    else Reflect.deleteProperty(document, "visibilityState");
  });

  it("refetches the session every 30 minutes while visible without flipping to loading", async () => {
    mount();
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("state").textContent).toBe("authenticated");
    await advance(SESSION_REFRESH_INTERVAL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("state").textContent).toBe("authenticated");
    await advance(SESSION_REFRESH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not poll while the tab is hidden", async () => {
    mount();
    await advance(0);
    setVisibility("hidden");
    await advance(SESSION_REFRESH_INTERVAL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes on return when stale, not when the last check was recent", async () => {
    mount();
    await advance(0);
    setVisibility("hidden");
    await advance(SESSION_STALE_MS - 1000);
    setVisibility("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange", { bubbles: true })); await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    setVisibility("hidden");
    await advance(2000);
    setVisibility("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange", { bubbles: true })); await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows unauthenticated when the cookie expired while the tab was away", async () => {
    mount();
    await advance(0);
    respond = unauthorized;
    setVisibility("hidden");
    await advance(25 * 60 * 60_000);
    setVisibility("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange", { bubbles: true })); await vi.advanceTimersByTimeAsync(0); });
    await advance(2000); // retry: 1 in the provider
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("state").textContent).toBe("unauthenticated");
  });

  it("keeps the known user when a background refresh fails transiently", async () => {
    mount();
    await advance(0);
    respond = () => { throw new Error("network down"); };
    await advance(SESSION_REFRESH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("state").textContent).toBe("authenticated");
  });
});
