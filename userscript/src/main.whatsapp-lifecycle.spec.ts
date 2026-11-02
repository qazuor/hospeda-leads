import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchStatus: vi.fn(), fetchContext: vi.fn(), fetchAutoRegistrations: vi.fn(), saveAutoRegisterPreference: vi.fn(),
  request: vi.fn(), registerBatch: vi.fn(), fetchTemplates: vi.fn(), prepareTemplate: vi.fn(), dispatchTemplate: vi.fn(),
  fetchMaterials: vi.fn(), addMaterial: vi.fn(), removeMaterial: vi.fn(), fetchMaterialFile: vi.fn(), setCrmRequestGuard: vi.fn()
}));
vi.mock("./api", () => ({ ...api, ApiError: class ApiError extends Error { constructor(message: string, public status: number, public minVersion?: string) { super(message); } } }));

const success = (whatsappAccount: string | null) => ({ minVersion: "1.0.0", user: { email: "seller@example.com", displayName: "Seller" }, whatsappAccount, matches: [] });
let storage: Storage;
let boot: () => Promise<void>;
let activeIntervals: Set<number>;
const allApi = () => Object.values(api).filter(value => typeof value === "function" && value !== api.setCrmRequestGuard);
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await Promise.resolve(); }
async function start(): Promise<void> { await import("./main"); await flush(); }
function visibleText(): string { return [...document.querySelectorAll("#hospeda-userscript-banner")].map(host => host.shadowRoot?.querySelector(".notice")?.textContent || "").join(" "); }

describe("WhatsApp account lifecycle boot", () => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.stubGlobal("location", new URL("https://web.whatsapp.com/")); document.body.innerHTML = '<div id="app"><div id="pane-side"></div><div id="main"></div></div>';
    activeIntervals = new Set(); const setInterval = window.setInterval.bind(window), clearInterval = window.clearInterval.bind(window);
    vi.spyOn(window, "setInterval").mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) => { const id = setInterval(handler, timeout, ...args); activeIntervals.add(id); return id; }) as typeof window.setInterval);
    vi.spyOn(window, "clearInterval").mockImplementation(((id?: number) => { if (id !== undefined) activeIntervals.delete(id); clearInterval(id); }) as typeof window.clearInterval);
    storage = window.localStorage; storage.clear(); storage.setItem("last-wid-md", JSON.stringify("5493442123456:12@c.us"));
    vi.stubGlobal("GM_getValue", (key: string, fallback: unknown) => key === "hospeda-userscript-token" ? "hcu_test" : fallback);
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal("GM_setValue", vi.fn()); vi.stubGlobal("GM_registerMenuCommand", vi.fn()); vi.stubGlobal("GM_xmlhttpRequest", vi.fn());
    for (const fn of allApi()) (fn as ReturnType<typeof vi.fn>).mockReset();
    api.fetchStatus.mockResolvedValue(success("+5493442123456")); api.fetchContext.mockResolvedValue({ ...success("+5493442123456"), matches: [] });
    api.fetchAutoRegistrations.mockResolvedValue({ registrations: [] }); api.request.mockResolvedValue({ results: [] });
    boot = async () => start();
  });
  afterEach(() => { window.dispatchEvent(new Event("pagehide")); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });

  it("status pending: shows nothing and calls only status", async () => {
    let resolve!: (value: ReturnType<typeof success>) => void;
    api.fetchStatus.mockReturnValue(new Promise(resolveStatus => { resolve = resolveStatus; }));
    await boot(); await flush();
    expect(api.fetchStatus).toHaveBeenCalledTimes(1); expect(allApi().filter(fn => fn !== api.fetchStatus).every(fn => !(fn as ReturnType<typeof vi.fn>).mock.calls.length)).toBe(true);
    expect(visibleText()).toBe(""); resolve(success("+5493442123456")); await flush();
  });

  it("boot mismatch shows only the account notice and leaves only the account monitor", async () => {
    api.fetchStatus.mockResolvedValue(success("+5491111111111")); await boot();
    expect(visibleText()).toBe("Este WhatsApp no es el de Hospeda: el script está apagado.");
    expect(allApi().filter(fn => fn !== api.fetchStatus).every(fn => !(fn as ReturnType<typeof vi.fn>).mock.calls.length)).toBe(true);
    expect(activeIntervals.size).toBe(1);
  });

  it("unknown account stays quiet until 15 seconds, then shows its notice without other API calls", async () => {
    storage.removeItem("last-wid-md"); api.fetchStatus.mockResolvedValue(success("+5493442123456")); await boot();
    expect(visibleText()).toBe(""); vi.advanceTimersByTime(14_999); expect(visibleText()).toBe("");
    vi.advanceTimersByTime(1); expect(visibleText()).toBe("No pude verificar la cuenta de WhatsApp: el script está apagado.");
    expect(allApi().filter(fn => fn !== api.fetchStatus).every(fn => !(fn as ReturnType<typeof vi.fn>).mock.calls.length)).toBe(true);
  });

  it("turning mismatch on removes the chat UI, stops badges and blocks subsequent API calls", async () => {
    api.fetchStatus.mockResolvedValue(success("+5493442123456")); await boot();
    document.getElementById("hospeda-userscript-banner")?.remove(); const chatPanel = document.createElement("div"); chatPanel.id = "hospeda-userscript-banner"; document.body.append(chatPanel);
    const before = allApi().map(fn => (fn as ReturnType<typeof vi.fn>).mock.calls.length);
    storage.setItem("last-wid-md", JSON.stringify("5491111111111:12@c.us")); window.dispatchEvent(new StorageEvent("storage", { key: "last-wid-md" })); await flush();
    expect(visibleText()).toBe("Este WhatsApp no es el de Hospeda: el script está apagado.");
    const after = allApi().map(fn => (fn as ReturnType<typeof vi.fn>).mock.calls.length); expect(after).toEqual(before);
  });

  it("mismatch to ok resumes once across repeated toggles", async () => {
    api.fetchStatus.mockResolvedValue(success("+5493442123456")); storage.setItem("last-wid-md", JSON.stringify("5491111111111:12@c.us")); await boot();
    storage.setItem("last-wid-md", JSON.stringify("5493442123456:12@c.us")); window.dispatchEvent(new StorageEvent("storage", { key: "last-wid-md" })); await flush();
    expect(api.fetchStatus).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBeGreaterThanOrEqual(3);
    storage.setItem("last-wid-md", JSON.stringify("5491111111111:12@c.us")); window.dispatchEvent(new StorageEvent("storage", { key: "last-wid-md" }));
    storage.setItem("last-wid-md", JSON.stringify("5493442123456:12@c.us")); window.dispatchEvent(new StorageEvent("storage", { key: "last-wid-md" })); await flush();
    expect(api.fetchStatus).toHaveBeenCalledTimes(1); expect(document.querySelectorAll("#hospeda-userscript-banner")).toHaveLength(0);
  });

  it("unconfigured account retains normal status and badge API activity", async () => {
    api.fetchStatus.mockResolvedValue(success(null)); await boot();
    expect(api.fetchStatus).toHaveBeenCalled(); expect(api.request).not.toHaveBeenCalled();
    expect(visibleText()).not.toContain("script está apagado");
  });
});
