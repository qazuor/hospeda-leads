// @vitest-environment-options {"url":"https://www.instagram.com/cabanas_del_rio/"}
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import profileEs from "../fixtures/instagram-profile-es.html?raw";
import threadEs from "../fixtures/instagram-thread-header-es.html?raw";
import { siteFor } from "./site";
import { HANDOFF_CLEANUP_MARGIN_MS, gmHandoffStore, listenForInstagramHandoff } from "./instagramBridge";
import { HANDOFF_ACK_ATTRIBUTE, HANDOFF_EVENT, HANDOFF_STORAGE_KEY, HANDOFF_TTL_MS } from "./instagram/handoff";
import { INSTAGRAM_GM_KEYS } from "./instagramApp/storage";
import { INSTAGRAM_API_FUNCTIONS } from "./instagramApp/client";

/**
 * Spec 97 §5.4 (relaxing spec 94 §2.4): on instagram.com the script may now read the token and call the CRM, inside these boundaries. The token
 * never reaches the page; there is no token entry and no page-to-script event there; panel actions need trusted events; the DOM layer
 * (`instagram/`) stays pure; the wiring layer (`instagramApp/`) imports only what it needs and calls only the allowlisted API functions; no WhatsApp
 * module runs; the clipboard is never read.
 */
const api = vi.hoisted(() => ({ touched: [] as string[] }));
vi.mock("./api", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./api");
  return Object.fromEntries(Object.entries(actual).map(([name, value]) => [name, typeof value === "function" && !/^[A-Z]/.test(name) ? (...args: unknown[]) => { api.touched.push(name); return (value as (...a: unknown[]) => unknown)(...args); } : value]));
});
const startSpy = vi.hoisted(() => ({ calls: 0 }));
vi.mock("./instagramApp/start", async () => {
  const actual = await vi.importActual<typeof import("./instagramApp/start")>("./instagramApp/start");
  return { ...actual, startInstagramApp: (...args: Parameters<typeof actual.startInstagramApp>) => { startSpy.calls++; return actual.startInstagramApp(...args); } };
});

const gm = { GM_xmlhttpRequest: vi.fn(), GM_getValue: vi.fn(), GM_setValue: vi.fn(), GM_registerMenuCommand: vi.fn() };
beforeAll(() => { for (const [name, fn] of Object.entries(gm)) vi.stubGlobal(name, fn); });
afterAll(() => vi.unstubAllGlobals());
const TOKEN = "hcu_secret_token_value";
/** GM storage as a map: answers reads, records writes. */
function storage(initial: Record<string, unknown>) {
  const stored = { ...initial };
  gm.GM_getValue.mockImplementation((key: string, fallback: unknown) => key in stored ? stored[key] : fallback);
  gm.GM_setValue.mockImplementation((key: string, value: unknown) => { stored[key] = value; });
  return stored;
}
/** A CRM that answers the status and the Instagram lookup. Records each URL. */
function crm() {
  const urls: string[] = [];
  gm.GM_xmlhttpRequest.mockImplementation((options: { url: string; headers?: Record<string, string>; onload: (r: { status: number; response: unknown; responseText: string }) => void }) => {
    urls.push(options.url); expect(options.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
    const path = new URL(options.url).pathname;
    const response = path.endsWith("/status") ? { minVersion: "1.5.0", latestVersion: "1.6.0", user: { email: "ana@hospeda.test", displayName: "Ana" }, instagramAccount: "hospeda.com.ar" }
      : path.endsWith("/instagram/threads") ? { threads: [] }
      : path.endsWith("/context") ? { minVersion: "1.5.0", latestVersion: "1.6.0", user: { email: "ana@hospeda.test", displayName: "Ana" }, instagramAccount: "hospeda.com.ar", hiddenMatches: 0, matches: [], instagram: { username: "qaz.uor", threadId: null } } : {};
    queueMicrotask(() => options.onload({ status: 200, response, responseText: JSON.stringify(response) }));
    return { abort: () => {} };
  });
  return urls;
}

describe("Instagram boundaries inside the shared script (spec 97 §5.4)", () => {
  it("picks the module by host", () => {
    expect(siteFor({ hostname: "web.whatsapp.com" })).toBe("whatsapp");
    expect(siteFor({ hostname: "www.instagram.com" })).toBe("instagram");
    for (const hostname of ["crm.hospeda.com.ar", "localhost", "instagram.com"]) expect(siteFor({ hostname })).toBe("crm");
  });

  it("routes www.instagram.com to the Instagram app only; off a chat page without a marker it reads nothing, requests nothing and adds nothing", async () => {
    expect(location.hostname).toBe("www.instagram.com");
    document.body.innerHTML = profileEs; const before = document.body.innerHTML;
    await import("./main");
    expect(startSpy.calls).toBe(1);
    for (const fn of Object.values(gm)) expect(fn).not.toHaveBeenCalled();
    expect(api.touched).toEqual([]);
    // No WhatsApp logic: no menu, no WhatsApp panel.
    expect(document.getElementById("hospeda-userscript-banner")).toBeNull();
    expect(document.body.innerHTML).toBe(before);
    expect(document.documentElement.hasAttribute("data-hospeda-userscript")).toBe(false);
  });

  it("on a chat page: reads only its own GM keys, calls only allowlisted functions, keeps the token out of the page and never reads the clipboard", async () => {
    const { startInstagramApp } = await import("./instagramApp/start"), { gmInstagramStore } = await import("./instagramApp/storage"), { instagramApi } = await import("./instagramApp/client");
    storage({ "hospeda-userscript-token": TOKEN, "hospeda-userscript-auto-register": true, "hospeda-userscript-theme": "dark" }); const urls = crm();
    const readText = vi.fn(); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText, writeText: vi.fn() } });
    history.replaceState(null, "", "/direct/t/17848251833510164/"); document.body.innerHTML = threadEs; api.touched.length = 0; gm.GM_getValue.mockClear();
    const store = gmInstagramStore(), app = startInstagramApp({ store, api: instagramApi({ base: "https://crm.test", token: store.token }), base: "https://crm.test", version: "1.6.0", pollMs: 60_000 });
    try {
      await vi.waitFor(() => expect(urls.some(url => url.includes("/_api/userscript/context?instagram=qaz.uor"))).toBe(true));
      await vi.waitFor(() => expect(document.getElementById("hospeda-instagram-panel")?.shadowRoot?.textContent).toContain("No encontré un negocio"));
      expect(new Set(gm.GM_getValue.mock.calls.map(call => call[0])).size).toBeGreaterThan(0);
      for (const [key] of gm.GM_getValue.mock.calls) expect(INSTAGRAM_GM_KEYS, String(key)).toContain(key);
      for (const [key] of gm.GM_setValue.mock.calls) expect(["hospeda-instagram-open", "hospeda-instagram-theme", HANDOFF_STORAGE_KEY], String(key)).toContain(key);
      for (const name of api.touched) expect(INSTAGRAM_API_FUNCTIONS.concat("request"), name).toContain(name);
      for (const url of urls) expect(url.startsWith("https://crm.test/_api/userscript/"), url).toBe(true);
      expect(document.documentElement.outerHTML).not.toContain(TOKEN); expect(readText).not.toHaveBeenCalled();
      expect(gm.GM_registerMenuCommand).not.toHaveBeenCalled(); expect(document.getElementById("hospeda-userscript-banner")).toBeNull();
    } finally { app.stop(); document.getElementById("hospeda-instagram-panel")?.remove(); }
  });

  it("without a token makes no request on a chat page", async () => {
    const { startInstagramApp } = await import("./instagramApp/start"), { gmInstagramStore } = await import("./instagramApp/storage"), { instagramApi } = await import("./instagramApp/client");
    storage({}); gm.GM_xmlhttpRequest.mockClear();
    history.replaceState(null, "", "/direct/t/17848251833510164/"); document.body.innerHTML = threadEs;
    const store = gmInstagramStore(), app = startInstagramApp({ store, api: instagramApi({ base: "https://crm.test", token: store.token }), base: "https://crm.test", version: "1.6.0", pollMs: 60_000 });
    try { await app.tick(); expect(gm.GM_xmlhttpRequest).not.toHaveBeenCalled(); } finally { app.stop(); document.getElementById("hospeda-instagram-panel")?.remove(); }
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

  it("keeps the DOM layer (instagram/) pure: own imports only, no GM, network, clipboard, storage or dynamic code", () => {
    // import.meta.url follows the page URL in this environment, so resolve from the repository root.
    const dir = resolve(process.cwd(), "userscript/src/instagram") + "/";
    const sources = readdirSync(dir).filter(file => file.endsWith(".ts") && !file.endsWith(".spec.ts"));
    expect(sources.length).toBeGreaterThan(3);
    for (const file of sources) {
      const text = readFileSync(dir + file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
      for (const [, spec] of text.matchAll(/from\s+["']([^"']+)["']/g)) expect(spec, `${file} imports ${spec}`).toMatch(/^\.\/[\w-]+$/);
      expect(text, file).not.toMatch(/\bGM_\w+|unsafeWindow|\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|new\s+Image\b|navigator\.clipboard|readText|\bimport\s*\(|^\s*import\s+["']|\beval\s*\(|new\s+Function\b|localStorage|sessionStorage|indexedDB|document\.cookie/m);
    }
  });

  it("keeps the wiring layer (instagramApp/) inside its allowlist: imports, API functions and no page-to-script events", () => {
    const dir = resolve(process.cwd(), "userscript/src/instagramApp") + "/";
    const sources = readdirSync(dir).filter(file => file.endsWith(".ts") && !file.endsWith(".spec.ts"));
    expect(sources).toEqual(expect.arrayContaining(["start.ts", "panel.ts", "compose.ts", "client.ts", "storage.ts", "state.ts"]));
    // badgeCard is the pill + hover card shared with WhatsApp's chat badges: pure DOM, and it must stay import-free to be allowed here.
    const allowedImports = /^(?:\.\/[\w-]+|\.\.\/instagram\/[\w-]+|\.\.\/(?:api|styles|logo|version|parse|badgeCard))$/;
    expect(readFileSync(resolve(process.cwd(), "userscript/src/badgeCard.ts"), "utf8")).not.toMatch(/^\s*import\s/m);
    for (const file of sources) {
      const text = readFileSync(dir + file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
      for (const [, spec] of text.matchAll(/from\s+["']([^"']+)["']/g)) expect(spec, `${file} imports ${spec}`).toMatch(allowedImports);
      expect(text, file).not.toMatch(/unsafeWindow|readText|\bfetch\s*\(|XMLHttpRequest|GM_xmlhttpRequest|WebSocket|EventSource|sendBeacon|\beval\s*\(|new\s+Function\b|\bimport\s*\(|^\s*import\s+["']|localStorage|sessionStorage|indexedDB|document\.cookie|innerHTML|insertAdjacentHTML/m);
      // No listener for the CRM page's events (token, handoff, recheck): those stay on the CRM origin only.
      expect(text, file).not.toMatch(/addEventListener\(\s*["'`]hospeda-|addEventListener\(\s*(?:TOKEN_EVENT|HANDOFF_EVENT|RECHECK_EVENT|INSTALLED_EVENT)/);
      // GM only in the store.
      if (file !== "storage.ts") expect(text, file).not.toMatch(/\bGM_\w+/);
      // From ../api: only the allowlisted calls, ApiError and types.
      for (const [, names] of text.matchAll(/import\s*{([^}]*)}\s*from\s*["']\.\.\/api["']/g)) for (const raw of names.split(",")) {
        const name = raw.trim(); if (!name || name.startsWith("type ")) continue;
        expect(INSTAGRAM_API_FUNCTIONS.concat("ApiError"), `${file} imports ${name} from ../api`).toContain(name);
      }
    }
  });
});
