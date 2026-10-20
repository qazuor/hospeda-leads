import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { AuthProvider, useAuth, AUTH_QUERY_KEY, RELOGIN_GRACE_MS, SESSION_REFRESH_INTERVAL_MS, SESSION_STALE_MS } from "./useAuth";
import { authNavigation, LOGOUT_STORAGE_KEY } from "./authSync";
import { SESSION_EXPIRED_EVENT } from "./apiClient";

const USER = { id: 1, email: "a@b.c", displayName: "A", fullName: "A", avatarUrl: null, role: "admin" };

function Probe() { const { authState, sessionExpired } = useAuth(); return <><span data-testid="state">{authState.type}</span><span data-testid="expired">{String(sessionExpired)}</span></>; }

describe("AuthProvider session keepalive", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let respond: () => Response;
  let originalVisibilityState: PropertyDescriptor | undefined;
  let assignMock: ReturnType<typeof vi.spyOn>;
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
    assignMock = vi.spyOn(authNavigation, "assign").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it("keeps the page and flags the expiry when the cookie expired while the tab was away", async () => {
    mount();
    await advance(0);
    respond = unauthorized;
    setVisibility("hidden");
    await advance(25 * 60 * 60_000);
    setVisibility("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange", { bubbles: true })); await vi.advanceTimersByTimeAsync(0); });
    await advance(2000); // retry: 1 in the provider
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // No redirect: the known user stays on the page under the re-login dialog.
    expect(screen.getByTestId("state").textContent).toBe("authenticated");
    expect(screen.getByTestId("expired").textContent).toBe("true");
  });

  it("is plainly unauthenticated, with no expiry dialog, on a first visit without a session", async () => {
    respond = unauthorized;
    mount();
    await advance(2000);
    expect(screen.getByTestId("state").textContent).toBe("unauthenticated");
    expect(screen.getByTestId("expired").textContent).toBe("false");
  });

  it("keeps the known user when a background refresh fails with a network error", async () => {
    mount();
    await advance(0);
    respond = () => { throw new Error("network down"); };
    await advance(SESSION_REFRESH_INTERVAL_MS);
    await advance(2000); // retry: 1 in the provider
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("state").textContent).toBe("authenticated");
    expect(screen.getByTestId("expired").textContent).toBe("false");
  });

  it("keeps the known user when a background refresh returns 400 session validation failed", async () => {
    mount();
    await advance(0);
    respond = () => new Response(JSON.stringify({ json: { error: "Session validation failed" } }), { status: 400 });
    await advance(SESSION_REFRESH_INTERVAL_MS);
    await advance(2000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("state").textContent).toBe("authenticated");
  });

  it("logout cancels an in-flight refresh so it cannot restore the user", async () => {
    let logout: (() => Promise<void>) | undefined;
    function Grab() { logout = useAuth().logout; return <Probe />; }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><AuthProvider><Grab /></AuthProvider></QueryClientProvider>);
    await advance(0);
    let release: (r: Response) => void = () => {};
    let pendingTaken = false;
    let finishLogout: () => void = () => {};
    // First session call stays in flight; logout and the post-logout session check answer normally (server has no session).
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("logout")) return new Promise<Response>((r) => { finishLogout = () => r(new Response(JSON.stringify({ json: {} }), { status: 200 })); });
      if (pendingTaken) return Promise.resolve(unauthorized());
      pendingTaken = true;
      return new Promise<Response>((r) => { release = r; });
    });
    await advance(SESSION_REFRESH_INTERVAL_MS);
    let done: Promise<void> | undefined;
    await act(async () => { done = logout!(); await vi.advanceTimersByTimeAsync(0); });
    // The stale refresh answers while the logout request is still in flight.
    await act(async () => { release(ok()); await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByTestId("state").textContent).toBe("unauthenticated");
    await act(async () => { finishLogout(); await done; await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByTestId("state").textContent).toBe("unauthenticated");
  });

  describe("session expiry from page requests", () => {
    let auth: ReturnType<typeof useAuth> | undefined;
    let renders = 0;
    function Grab() { auth = useAuth(); renders++; return <Probe />; }
    function mountWith(queryClient: QueryClient) { return render(<QueryClientProvider client={queryClient}><AuthProvider><Grab /></AuthProvider></QueryClientProvider>); }
    const fire = () => act(async () => { window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT)); });

    it("collapses every 401 event into one expiry flag", async () => {
      mountWith(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
      await advance(0);
      expect(screen.getByTestId("expired").textContent).toBe("false");
      await fire();
      const after = renders;
      await fire(); await fire();
      expect(screen.getByTestId("expired").textContent).toBe("true");
      expect(screen.getByTestId("state").textContent).toBe("authenticated");
      expect(renders).toBe(after);
    });

    it("ignores 401 events when nobody is signed in", async () => {
      respond = unauthorized;
      mountWith(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
      await advance(2000);
      await fire();
      expect(screen.getByTestId("expired").textContent).toBe("false");
      expect(screen.getByTestId("state").textContent).toBe("unauthenticated");
    });

    it("re-login as the same user keeps page data and reloads only failed reads", async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      mountWith(queryClient);
      await advance(0);
      queryClient.setQueryData(["accounts", 1], { draft: "kept" });
      const failed = vi.fn(async () => { throw new Error("401"); });
      await act(async () => { await queryClient.prefetchQuery({ queryKey: ["work"], queryFn: failed }); });
      await fire();
      const reloaded = vi.fn(async () => "ok");
      queryClient.getQueryCache().find({ queryKey: ["work"] })!.setOptions({ queryKey: ["work"], queryFn: reloaded });
      await act(async () => { auth!.onRelogin(USER as never); await vi.advanceTimersByTimeAsync(0); });
      expect(screen.getByTestId("expired").textContent).toBe("false");
      expect(queryClient.getQueryData(["accounts", 1])).toEqual({ draft: "kept" });
      expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toEqual(USER);
      expect(queryClient.getQueryState(["work"])!.isInvalidated).toBe(true);
    });

    it("re-login as another user clears every cache and reloads the app at home", async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      mountWith(queryClient);
      await advance(0);
      queryClient.setQueryData(["accounts", 1], { draft: "previous user" });
      queryClient.getMutationCache().build(queryClient, { mutationFn: async () => "x" });
      await fire();
      await act(async () => { auth!.onRelogin({ ...USER, id: 2, email: "x@y.z" } as never); });
      expect(queryClient.getQueryData(["accounts", 1])).toBeUndefined();
      expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
      expect(assignMock).toHaveBeenCalledWith("/");
    });

    it("compares re-login with the user signed in at expiry, even if the cache changed since", async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      mountWith(queryClient);
      await advance(0);
      await fire();
      // Something rewrites the cached session to the incoming user before the dialog answers: still an account switch.
      queryClient.getQueryCache().find({ queryKey: AUTH_QUERY_KEY })!.setData({ ...USER, id: 2 });
      await act(async () => { auth!.onRelogin({ ...USER, id: 2, email: "x@y.z" } as never); });
      expect(assignMock).toHaveBeenCalledWith("/");
    });

    it("a session refresh answering 200 for another user resets everything", async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      mountWith(queryClient);
      await advance(0);
      queryClient.setQueryData(["accounts", 1], { draft: "previous user" });
      respond = () => new Response(JSON.stringify({ json: { user: { ...USER, id: 2 } } }), { status: 200 });
      await act(async () => { await queryClient.refetchQueries({ queryKey: AUTH_QUERY_KEY }); await vi.advanceTimersByTimeAsync(0); });
      expect(assignMock).toHaveBeenCalledWith("/");
      expect(queryClient.getQueryData(["accounts", 1])).toBeUndefined();
    });

    it("a session refresh answering 200 for the same user clears the expiry (renewed in another tab)", async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      mountWith(queryClient);
      await advance(0);
      await advance(1000);
      await fire();
      expect(screen.getByTestId("expired").textContent).toBe("true");
      await advance(1);
      await act(async () => { await queryClient.refetchQueries({ queryKey: AUTH_QUERY_KEY }); await vi.advanceTimersByTimeAsync(0); });
      expect(screen.getByTestId("expired").textContent).toBe("false");
      expect(assignMock).not.toHaveBeenCalled();
    });

    it("ignores late 401s right after a re-login, but not later ones", async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      mountWith(queryClient);
      await advance(0);
      await fire();
      await act(async () => { auth!.onRelogin(USER as never); });
      await fire();
      expect(screen.getByTestId("expired").textContent).toBe("false");
      await advance(RELOGIN_GRACE_MS);
      await fire();
      expect(screen.getByTestId("expired").textContent).toBe("true");
    });

    it("logout in another tab clears caches and goes to the login page without the dialog", async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      mountWith(queryClient);
      await advance(0);
      queryClient.setQueryData(["accounts", 1], { private: true });
      await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: LOGOUT_STORAGE_KEY, newValue: "1" })); });
      expect(queryClient.getQueryData(["accounts", 1])).toBeUndefined();
      expect(assignMock).toHaveBeenCalledWith("/login");
      expect(screen.getByTestId("expired").textContent).toBe("false");
    });

    it("logout tells the other tabs", async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      mountWith(queryClient);
      await advance(0);
      window.localStorage.removeItem(LOGOUT_STORAGE_KEY);
      await act(async () => { await auth!.logout(); });
      expect(window.localStorage.getItem(LOGOUT_STORAGE_KEY)).not.toBeNull();
      expect(assignMock).not.toHaveBeenCalled();
    });

    it("logout succeeds when the server session is already gone", async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      mountWith(queryClient);
      await advance(0);
      await fire();
      respond = unauthorized;
      await act(async () => { await auth!.logout(); await vi.advanceTimersByTimeAsync(2000); });
      expect(screen.getByTestId("state").textContent).toBe("unauthenticated");
      expect(screen.getByTestId("expired").textContent).toBe("false");
    });
  });
});
