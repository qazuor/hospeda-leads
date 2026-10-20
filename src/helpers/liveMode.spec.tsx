import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { useLiveMode, useLiveModeRefreshing, LiveModeProvider } from "./liveMode";
import { vi } from "vitest";

vi.mock("./useAuth", () => ({ useAuth: () => ({ authState: { type: "authenticated" } }) }));

const LIVE_QUERY_KEYS=[
  "communication","resources","data-quality","pipeline","work","commercial","commercial-detail","leads","lead-stats","settings","analytics","lead-duplicates","lead-notes",
  "lead-journal","global-journal","global-journal-filtered","trash-leads",
];

describe("LiveModeProvider polling", () => {
  let version = "v1";
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalVisibilityState: PropertyDescriptor | undefined;

  function renderWithProvider(child: React.ReactNode, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
    return { ...render(<QueryClientProvider client={queryClient}><LiveModeProvider>{child}</LiveModeProvider></QueryClientProvider>), queryClient };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    originalVisibilityState = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    version = "v1";
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ json: { version } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalVisibilityState) Object.defineProperty(document, "visibilityState", originalVisibilityState);
    else Reflect.deleteProperty(document, "visibilityState");
  });

  it("checks immediately and every 10 seconds while visible", async () => {
    renderWithProvider(<span>consumer</span>);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(9999); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("skips hidden intervals and checks on return when the throttle allows", async () => {
    renderWithProvider(<span>consumer</span>);
    await act(async () => {});
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("coalesces focus and visibility events dispatched together", async () => {
    renderWithProvider(<span>consumer</span>);
    await act(async () => {});
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalidates every live query only when a previously seen version changes", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    renderWithProvider(<span>consumer</span>, queryClient);
    await act(async () => {});
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(invalidate).not.toHaveBeenCalled();
    version = "v2";
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(invalidate).toHaveBeenCalledTimes(LIVE_QUERY_KEYS.length);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(LIVE_QUERY_KEYS.map(key => [key]));
  });

  it("stops polling and removes event listeners on unmount", async () => {
    const { unmount } = renderWithProvider(<span>consumer</span>);
    await act(async () => {});
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops polling when a consumer disables live mode", async () => {
    function Consumer() {
      const { setEnabled } = useLiveMode();
      return <button onClick={() => setEnabled(false)}>Turn off</button>;
    }
    renderWithProvider(<Consumer />);
    await act(async () => {});
    await act(async () => { screen.getByText("Turn off").click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not start overlapping checks while a fetch is unresolved", async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    renderWithProvider(<span>consumer</span>);
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a pending response after live mode is switched off", async () => {
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>(resolve => { resolveFetch = resolve; }));
    function Consumer() {
      const { setEnabled, status } = useLiveMode();
      return <><button onClick={() => setEnabled(false)}>Turn off</button><span>{status}</span></>;
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    renderWithProvider(<Consumer />, queryClient);
    await act(async () => {});
    await act(async () => { screen.getByText("Turn off").click(); });
    version = "v2";
    await act(async () => { resolveFetch(new Response(JSON.stringify({ json: { version } }), { status: 200 })); });
    expect(screen.getByText("off")).toBeTruthy();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not rerender manual-refresh consumers when a background check finds no new version", async () => {
    let renders = 0;
    function Consumer() { useLiveModeRefreshing(); renders += 1; return <span>consumer</span>; }
    renderWithProvider(<Consumer />);
    await act(async () => {});
    const afterInitialCheck = renders;
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(renders).toBe(afterInitialCheck);
  });

  it("rerenders useLiveMode consumers when lastCheckedAt changes", async () => {
    let renders = 0;
    function Consumer() { useLiveMode(); renders += 1; return <span>{renders}</span>; }
    renderWithProvider(<Consumer />);
    await act(async () => {});
    const afterInitialCheck = renders;
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(renders).toBeGreaterThan(afterInitialCheck);
  });

  it("keeps background status stable while manual check exposes checking", async () => {
    let resolveBackground!: (response: Response) => void;
    let resolveManual!: (response: Response) => void;
    function Consumer() {
      const { status, checkNow } = useLiveMode();
      return <><span>{status}</span><button onClick={() => void checkNow()}>Check now</button></>;
    }
    renderWithProvider(<Consumer />);
    await act(async () => {});
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveBackground = resolve; }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(screen.getByText("live")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { resolveBackground(new Response(JSON.stringify({ json: { version } }), { status: 200 })); });
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveManual = resolve; }));
    await act(async () => { screen.getByText("Check now").click(); });
    expect(screen.getByText("checking")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await act(async () => { resolveManual(new Response(JSON.stringify({ json: { version } }), { status: 200 })); });
    expect(screen.getByText("live")).toBeTruthy();
  });
});
