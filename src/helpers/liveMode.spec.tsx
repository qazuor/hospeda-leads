import { QueryClient, QueryClientProvider, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { useLiveMode, useLiveModeRefreshing, useLivePendingRefresh, shouldDeferLiveRefetch, LiveModeProvider, LIVE_MANUAL_WHEN_PAGED } from "./liveMode";
import { vi } from "vitest";

vi.mock("./useAuth", () => ({ useAuth: () => ({ authState: { type: "authenticated" } }) }));

const LIVE_QUERY_KEYS=[
  "communication","resources","data-quality","pipeline","work","commercial","commercial-detail","leads","lead-stats","settings","analytics","lead-duplicates","lead-notes",
  "lead-journal","global-journal","global-journal-filtered","trash-leads",
];

describe("LiveModeProvider polling", () => {
  let version = "v1";
  let domains: Record<string, string> | undefined;
  /** Database clock minus browser clock, in seconds. */
  let skew = 0;
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
    domains = undefined;
    skew = 0;
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ json: domains ? { version, domains, now: String(Date.now() / 1000 + skew) } : { version } }), { status: 200 }));
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

  it("invalidates only the query keys mapped to the changed domains", async () => {
    domains = { business: "1", work: "1", communication: "1", catalog: "1", journal: "1" };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    renderWithProvider(<span>consumer</span>, queryClient);
    await act(async () => {});
    version = "v2";
    domains = { ...domains, communication: "2" };
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey?.[0]);
    expect(keys).toEqual(["communication", "resources", "data-quality", "commercial-detail", "settings", "lead-journal", "global-journal", "global-journal-filtered"]);
    expect(keys).not.toContain("leads");
    invalidate.mockClear();
    version = "v3";
    domains = { ...domains, business: "3", work: "3" };
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey?.[0])).toEqual(expect.arrayContaining(["leads", "lead-stats", "work"]));
  });

  it("invalidates every live query when a server without domains changes version", async () => {
    domains = { business: "1", work: "1", communication: "1", catalog: "1", journal: "1" };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    renderWithProvider(<span>consumer</span>, queryClient);
    await act(async () => {});
    version = "v2";
    domains = undefined;
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
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

  describe("paged infinite lists (manual refresh chip)", () => {
    const listKey = ["leads", "business-list", 1];
    let delay = 0;
    function List({ fetched }: { fetched: number[] }) {
      const results = useInfiniteQuery({ queryKey: listKey, initialPageParam: 1, queryFn: async ({ pageParam }) => { fetched.push(pageParam); if (delay) await new Promise(resolve => setTimeout(resolve, delay)); return { page: pageParam }; }, getNextPageParam: last => last.page < 3 ? last.page + 1 : undefined, meta: LIVE_MANUAL_WHEN_PAGED });
      const { pending, clear } = useLivePendingRefresh(listKey);
      const { refresh } = useLiveMode();
      const queryClient = useQueryClient();
      // An own edit: the write is stamped first, the response arrives 300 ms later, then the list is refetched.
      const edit = useMutation({ mutationFn: async () => { write("business"); await new Promise(resolve => setTimeout(resolve, 300)); }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["leads"] }); } });
      return <><button onClick={() => edit.mutate()}>Edit</button><span>pages:{results.data?.pages.length ?? 0}</span><span>{pending ? "pending" : "fresh"}</span><button onClick={() => void results.fetchNextPage()}>More</button><button onClick={clear}>Clear</button><button onClick={() => void refresh()}>Refresh all</button></>;
    }
    async function renderList(pages: number) {
      domains = { business: "1", work: "1", communication: "1", catalog: "1", journal: "1" };
      delay = 0;
      const fetched: number[] = [];
      const { queryClient } = renderWithProvider(<List fetched={fetched} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      for (let page = 1; page < pages; page += 1) await act(async () => { screen.getByText("More").click(); await vi.advanceTimersByTimeAsync(0); });
      expect(screen.getByText("pages:" + pages)).toBeTruthy();
      fetched.length = 0;
      return { fetched, queryClient };
    }
    /** Simulates a database write now (domain value = database clock in epoch seconds). */
    function write(domain: string) {
      version = version + "+";
      domains = { ...domains, [domain]: String(Date.now() / 1000 + skew) };
    }
    async function nextPoll() {
      await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    }
    async function liveChange(domain: string) {
      write(domain);
      await nextPoll();
    }

    it("flags a list with more than one page instead of refetching every page", async () => {
      const { fetched, queryClient } = await renderList(2);
      await liveChange("business");
      expect(fetched).toEqual([]);
      expect(screen.getByText("pending")).toBeTruthy();
      await liveChange("business");
      expect(fetched).toEqual([]);
      await act(async () => { screen.getByText("Clear").click(); });
      expect(screen.getByText("fresh")).toBeTruthy();
    });

    it("keeps refreshing a list with a single page automatically", async () => {
      const { fetched, queryClient } = await renderList(1);
      await liveChange("business");
      expect(fetched).toEqual([1]);
      expect(screen.getByText("fresh")).toBeTruthy();
    });

    it("does not flag the list for changes in domains it does not read", async () => {
      const { fetched, queryClient } = await renderList(2);
      await liveChange("journal");
      expect(fetched).toEqual([]);
      expect(screen.getByText("fresh")).toBeTruthy();
    });

    it("refetches every loaded page and clears the flag on a manual refresh", async () => {
      const { fetched, queryClient } = await renderList(2);
      await liveChange("business");
      expect(screen.getByText("pending")).toBeTruthy();
      await act(async () => { screen.getByText("Refresh all").click(); await vi.advanceTimersByTimeAsync(0); });
      expect(fetched).toEqual([1, 2]);
      expect(screen.getByText("fresh")).toBeTruthy();
    });

    it("clears the flag when another full refetch of the list succeeds", async () => {
      const { fetched, queryClient } = await renderList(2);
      await liveChange("business");
      expect(screen.getByText("pending")).toBeTruthy();
      await act(async () => { await queryClient.invalidateQueries({ queryKey: ["leads"] }); await vi.advanceTimersByTimeAsync(0); });
      expect(fetched).toEqual([1, 2]);
      expect(screen.getByText("fresh")).toBeTruthy();
    });

    async function ownEditRefetchedAfter(queryClient: QueryClient, elapsed: number) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      write("business");
      await act(async () => { await vi.advanceTimersByTimeAsync(elapsed); await queryClient.invalidateQueries({ queryKey: ["leads"] }); await vi.advanceTimersByTimeAsync(0); });
    }

    it("does not flag the list for a change it already refetched after the user's own edit", async () => {
      const { fetched, queryClient } = await renderList(2);
      await ownEditRefetchedAfter(queryClient, 2000);
      expect(fetched).toEqual([1, 2]);
      await nextPoll();
      expect(screen.getByText("fresh")).toBeTruthy();
      expect(fetched).toEqual([1, 2]);
      await liveChange("business");
      expect(screen.getByText("pending")).toBeTruthy();
    });

    async function ownEdit() {
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      await act(async () => { screen.getByText("Edit").click(); await vi.advanceTimersByTimeAsync(1000); });
    }

    it.each([0, 3600])("does not flag the list after the user's own edit refetched it 300 ms later (server clock skew %i s)", async serverSkew => {
      skew = serverSkew;
      const { fetched } = await renderList(2);
      await ownEdit();
      expect(fetched).toEqual([1, 2]);
      await nextPoll();
      expect(screen.getByText("fresh")).toBeTruthy();
      expect(fetched).toEqual([1, 2]);
    });

    it.each([0, 3600])("still flags another user's change that lands after the own edit settled (server clock skew %i s)", async serverSkew => {
      skew = serverSkew;
      const { fetched } = await renderList(2);
      await ownEdit();
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      write("business");
      await nextPoll();
      expect(screen.getByText("pending")).toBeTruthy();
      expect(fetched).toEqual([1, 2]);
    });

    it("still flags the list when a refetch without an own edit started within the freshness margin of the change", async () => {
      const { queryClient } = await renderList(2);
      await ownEditRefetchedAfter(queryClient, 300);
      await nextPoll();
      expect(screen.getByText("pending")).toBeTruthy();
    });

    it("compares change times in the browser clock when the server clock is skewed", async () => {
      skew = 3600;
      const { fetched, queryClient } = await renderList(2);
      await ownEditRefetchedAfter(queryClient, 2000);
      await nextPoll();
      expect(screen.getByText("fresh")).toBeTruthy();
      expect(fetched).toEqual([1, 2]);
      await liveChange("business");
      expect(screen.getByText("pending")).toBeTruthy();
    });

    it("keeps the flag when a refetch that started before the change completes after it", async () => {
      const { fetched, queryClient } = await renderList(2);
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      delay = 6000;
      await act(async () => { void queryClient.invalidateQueries({ queryKey: ["leads"] }); await vi.advanceTimersByTimeAsync(2000); });
      write("business");
      await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
      expect(screen.getByText("pending")).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
      expect(fetched).toEqual([1, 2]);
      expect(screen.getByText("pending")).toBeTruthy();
    });

    it("keeps the flag when the list data is replaced locally with setQueryData", async () => {
      const { queryClient } = await renderList(2);
      // The last fetch must be a full one, so only the `manual` guard keeps setQueryData from clearing the flag.
      await act(async () => { await queryClient.invalidateQueries({ queryKey: ["leads"] }); await vi.advanceTimersByTimeAsync(0); });
      version = "v2";
      domains = undefined;
      await nextPoll();
      expect(screen.getByText("pending")).toBeTruthy();
      await act(async () => { queryClient.setQueryData(listKey, (data: unknown) => (data && typeof data === "object" ? { ...data } : data)); await vi.advanceTimersByTimeAsync(0); });
      expect(screen.getByText("pending")).toBeTruthy();
    });

    it("keeps the flag when only the next page is fetched", async () => {
      const { fetched, queryClient } = await renderList(2);
      await liveChange("business");
      await act(async () => { screen.getByText("More").click(); await vi.advanceTimersByTimeAsync(0); });
      expect(fetched).toEqual([3]);
      expect(screen.getByText("pages:3")).toBeTruthy();
      expect(screen.getByText("pending")).toBeTruthy();
    });

    it("defers only opted-in queries that are on screen with several pages", () => {
      const query = (meta: Record<string, unknown> | undefined, observers: number, pages: unknown) => ({ meta, getObserversCount: () => observers, state: { data: pages === undefined ? undefined : { pages } } });
      expect(shouldDeferLiveRefetch(query(LIVE_MANUAL_WHEN_PAGED, 1, [1, 2]))).toBe(true);
      expect(shouldDeferLiveRefetch(query(LIVE_MANUAL_WHEN_PAGED, 1, [1]))).toBe(false);
      expect(shouldDeferLiveRefetch(query(LIVE_MANUAL_WHEN_PAGED, 0, [1, 2]))).toBe(false);
      expect(shouldDeferLiveRefetch(query(undefined, 1, [1, 2]))).toBe(false);
      expect(shouldDeferLiveRefetch(query(LIVE_MANUAL_WHEN_PAGED, 1, undefined))).toBe(false);
    });
  });
});
