// @vitest-environment-options {"url":"https://www.instagram.com/cabanas_del_rio/"}
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import profileEs from "../fixtures/instagram-profile-es.html?raw";
import dmEs from "../fixtures/instagram-dm-es.html?raw";
import { siteFor } from "./site";
import { HANDOFF_CLEANUP_MARGIN_MS, gmHandoffStore, listenForInstagramHandoff } from "./instagramBridge";
import { HANDOFF_ACK_ATTRIBUTE, HANDOFF_EVENT, HANDOFF_STORAGE_KEY, HANDOFF_TTL_MS } from "./instagram/handoff";

/**
 * Spec 94 §2.4 (D1): Instagram runs inside the shared «Hospeda CRM» script but must stay isolated. On instagram.com the script never
 * reads the token or any GM value other than the one-time handoff, never calls GM_xmlhttpRequest or the CRM API, and runs no WhatsApp logic.
 */
const api = vi.hoisted(() => ({ touched: [] as string[] }));
vi.mock("./api", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./api");
  return Object.fromEntries(Object.entries(actual).map(([name, value]) => [name, typeof value === "function" && !/^[A-Z]/.test(name) ? (...args: unknown[]) => { api.touched.push(name); return (value as (...a: unknown[]) => unknown)(...args); } : value]));
});
const startSpy = vi.hoisted(() => ({ calls: 0 }));
vi.mock("./instagram/start", async () => {
  const actual = await vi.importActual<typeof import("./instagram/start")>("./instagram/start");
  return { startInstagram: (...args: Parameters<typeof actual.startInstagram>) => { startSpy.calls++; return actual.startInstagram(...args); } };
});

const gm = { GM_xmlhttpRequest: vi.fn(), GM_getValue: vi.fn(), GM_setValue: vi.fn(), GM_registerMenuCommand: vi.fn() };
beforeAll(() => { for (const [name, fn] of Object.entries(gm)) vi.stubGlobal(name, fn); });
afterAll(() => vi.unstubAllGlobals());

describe("Instagram isolation inside the shared script", () => {
  it("picks the module by host", () => {
    expect(siteFor({ hostname: "web.whatsapp.com" })).toBe("whatsapp");
    expect(siteFor({ hostname: "www.instagram.com" })).toBe("instagram");
    for (const hostname of ["crm.hospeda.com.ar", "localhost", "instagram.com"]) expect(siteFor({ hostname })).toBe("crm");
  });

  it("routes www.instagram.com to the Instagram module only; without a marker it reads no GM value, makes no request and adds no UI", async () => {
    expect(location.hostname).toBe("www.instagram.com");
    document.body.innerHTML = profileEs; const before = document.body.innerHTML;
    await import("./main");
    expect(startSpy.calls).toBe(1);
    for (const fn of Object.values(gm)) expect(fn).not.toHaveBeenCalled();
    expect(api.touched).toEqual([]);
    // No marker: nothing injected (no launcher, no panel, no update prompt, no notice).
    expect(document.body.innerHTML).toBe(before);
    expect(document.documentElement.hasAttribute("data-hospeda-userscript")).toBe(false);
  });

  it("runs a full paste reading only the handoff key: no token, no other GM value, no clipboard, no network, no CRM API", async () => {
    const { startInstagram } = await import("./instagram/start");
    const text = "Hola desde Hospeda", nonce = "0123456789abcdef0123456789abcdef";
    const stored: Record<string, unknown> = { "hospeda-userscript-token": "hcu_secret", [HANDOFF_STORAGE_KEY]: { nonce, username: "cabanas_del_rio", expiresAt: Date.now() + 60_000, text } };
    gm.GM_getValue.mockImplementation((key: string, fallback: unknown) => stored[key] ?? fallback);
    gm.GM_setValue.mockImplementation((key: string, value: unknown) => { stored[key] = value; });
    const readText = vi.fn(); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText } });
    history.replaceState(null, "", `/cabanas_del_rio/#hospeda=${nonce}`); document.body.innerHTML = profileEs;
    document.querySelector<HTMLElement>('main header [role="button"]:nth-child(2)')!.addEventListener("click", () => {
      history.pushState(null, "", "/direct/t/1/"); document.body.innerHTML = dmEs; const composer = document.querySelector<HTMLElement>('[role="textbox"]')!;
      composer.addEventListener("paste", event => { event.preventDefault(); composer.textContent = (event as ClipboardEvent).clipboardData!.getData("text/plain"); });
    });
    const results: unknown[] = [];
    startInstagram({ store: gmHandoffStore(), flow: { intervalMs: 10, settle: () => Promise.resolve() }, onResult: result => results.push(result) });
    await vi.waitFor(() => expect(results).toEqual([{ ok: true }]));
    expect(document.querySelector('[role="textbox"]')!.textContent).toBe(text);
    expect(new Set(gm.GM_getValue.mock.calls.map(call => call[0]))).toEqual(new Set([HANDOFF_STORAGE_KEY]));
    expect(gm.GM_setValue.mock.calls).toEqual([[HANDOFF_STORAGE_KEY, null]]);
    expect(gm.GM_xmlhttpRequest).not.toHaveBeenCalled(); expect(gm.GM_registerMenuCommand).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled(); expect(api.touched).toEqual([]);
  });

  it("the store only deletes the handoff of its own nonce (compare-and-delete)", () => {
    const stored: Record<string, unknown> = { [HANDOFF_STORAGE_KEY]: { nonce: "b".repeat(32) } };
    gm.GM_getValue.mockImplementation((key: string, fallback: unknown) => stored[key] ?? fallback); gm.GM_setValue.mockClear();
    gm.GM_setValue.mockImplementation((key: string, value: unknown) => { stored[key] = value; });
    gmHandoffStore().clear({ nonce: "a".repeat(32) }); expect(gm.GM_setValue).not.toHaveBeenCalled();
    gmHandoffStore().clear({ nonce: "b".repeat(32) }); expect(stored[HANDOFF_STORAGE_KEY]).toBeNull();
  });

  it("on the CRM page, stores a handoff from a JSON string event and acks it; anything else is ignored and never acked", () => {
    const save = vi.fn(), valid = { nonce: "a".repeat(32), username: "hotel.sol", expiresAt: Date.now() + 60_000, text: "Hola" };
    listenForInstagramHandoff({ doc: document, save }); document.documentElement.removeAttribute(HANDOFF_ACK_ATTRIBUTE);
    const fire = (detail: unknown) => document.dispatchEvent(new CustomEvent(HANDOFF_EVENT, { detail }));
    fire(valid);// an object, not a string: may not cross the sandbox, so it is not accepted
    fire("{not json"); fire(JSON.stringify({ ...valid, nonce: "short" })); fire(JSON.stringify({ ...valid, text: "a".repeat(4001) })); fire(null);
    expect(save).not.toHaveBeenCalled(); expect(document.documentElement.hasAttribute(HANDOFF_ACK_ATTRIBUTE)).toBe(false);
    fire(JSON.stringify(valid));
    expect(save).toHaveBeenCalledWith(valid); expect(document.documentElement.getAttribute(HANDOFF_ACK_ATTRIBUTE)).toBe(valid.nonce);
  });

  it("on the CRM page, deletes a handoff nobody consumed once the TTL plus a margin has passed (compare-and-delete by nonce)", () => {
    vi.useFakeTimers();
    try {
      const clear = vi.fn(), valid = { nonce: "c".repeat(32), username: "hotel.sol", expiresAt: Date.now() + HANDOFF_TTL_MS, text: "Hola" };
      listenForInstagramHandoff({ doc: document, save: vi.fn(), read: () => null, clear });
      document.dispatchEvent(new CustomEvent(HANDOFF_EVENT, { detail: JSON.stringify(valid) }));
      vi.advanceTimersByTime(HANDOFF_TTL_MS + HANDOFF_CLEANUP_MARGIN_MS - 1); expect(clear).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1); expect(clear).toHaveBeenCalledExactlyOnceWith({ nonce: valid.nonce });
    } finally { vi.useRealTimers(); }
  });

  it("on the CRM page, deletes an expired or malformed handoff left in storage when the bridge starts, and keeps a live one", () => {
    const live = { nonce: "d".repeat(32), username: "hotel.sol", expiresAt: Date.now() + 60_000, text: "Hola" };
    for (const [stored, deleted] of [[{ ...live, expiresAt: Date.now() - 1 }, true], [{ nonce: "x" }, true], [live, false], [null, false]] as const) {
      const save = vi.fn(); listenForInstagramHandoff({ doc: document, save, read: () => stored, clear: vi.fn() });
      expect(save.mock.calls, JSON.stringify(stored)).toEqual(deleted ? [[null]] : []);
    }
  });

  it("keeps the Instagram sources free of imports outside their folder", () => {
    // import.meta.url follows the page URL in this environment, so resolve from the repository root.
    const dir = resolve(process.cwd(), "userscript/src/instagram") + "/";
    const sources = readdirSync(dir).filter(file => file.endsWith(".ts") && !file.endsWith(".spec.ts"));
    expect(sources.length).toBeGreaterThan(3);
    for (const file of sources) {
      const text = readFileSync(dir + file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
      for (const [, spec] of text.matchAll(/from\s+["']([^"']+)["']/g)) expect(spec, `${file} imports ${spec}`).toMatch(/^\.\/[\w-]+$/);
      // Isolation is by code, not by capability (@grant applies to every @match): no network, storage, clipboard or dynamic code paths.
      expect(text, file).not.toMatch(/\bGM_\w+|GM_xmlhttpRequest|unsafeWindow|\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|new\s+Image\b|navigator\.clipboard|readText|\bimport\s*\(|^\s*import\s+["']|\beval\s*\(|new\s+Function\b|localStorage|sessionStorage|indexedDB|document\.cookie/m);
    }
  });
});
