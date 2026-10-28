// @vitest-environment-options {"url":"https://www.instagram.com/cabanas_del_rio/"}
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import profileEs from "../fixtures/instagram-profile-es.html?raw";
import dmEs from "../fixtures/instagram-dm-es.html?raw";
import { siteFor } from "./site";
import { gmHandoffStore, listenForInstagramHandoff } from "./instagramBridge";
import { HANDOFF_MESSAGE_TYPE, HANDOFF_STORAGE_KEY, textHash } from "./instagram/handoff";

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

  it("runs a full paste reading only the handoff key: no token, no other GM value, no network, no CRM API", async () => {
    const { startInstagram } = await import("./instagram/start");
    const text = "Hola desde Hospeda", nonce = "0123456789abcdef0123456789abcdef";
    const stored: Record<string, unknown> = { "hospeda-userscript-token": "hcu_secret", [HANDOFF_STORAGE_KEY]: { nonce, username: "cabanas_del_rio", expiresAt: Date.now() + 60_000, textHash: await textHash({ text }) } };
    gm.GM_getValue.mockImplementation((key: string, fallback: unknown) => stored[key] ?? fallback);
    gm.GM_setValue.mockImplementation((key: string, value: unknown) => { stored[key] = value; });
    history.replaceState(null, "", `/cabanas_del_rio/#hospeda=${nonce}`); document.body.innerHTML = profileEs;
    document.querySelector<HTMLElement>('main [role="button"]:nth-child(2)')!.addEventListener("click", () => {
      document.body.innerHTML = dmEs; const composer = document.querySelector<HTMLElement>('[role="textbox"]')!;
      composer.addEventListener("paste", event => { event.preventDefault(); composer.textContent = (event as ClipboardEvent).clipboardData!.getData("text/plain"); });
    });
    const results: unknown[] = [];
    startInstagram({ store: gmHandoffStore(), flow: { readClipboard: async () => text, intervalMs: 10, settle: () => Promise.resolve() }, onResult: result => results.push(result) });
    await vi.waitFor(() => expect(results).toEqual([{ ok: true }]));
    expect(new Set(gm.GM_getValue.mock.calls.map(call => call[0]))).toEqual(new Set([HANDOFF_STORAGE_KEY]));
    expect(gm.GM_setValue.mock.calls).toEqual([[HANDOFF_STORAGE_KEY, null]]);
    expect(gm.GM_xmlhttpRequest).not.toHaveBeenCalled(); expect(gm.GM_registerMenuCommand).not.toHaveBeenCalled();
    expect(api.touched).toEqual([]);
  });

  it("on the CRM page, stores a handoff posted by the page itself and ignores other origins, other windows and malformed data", () => {
    const save = vi.fn(), valid = { type: HANDOFF_MESSAGE_TYPE, nonce: "a".repeat(32), username: "hotel.sol", expiresAt: Date.now() + 60_000, textHash: "0011223344556677" };
    listenForInstagramHandoff({ win: window, save });
    const post = (data: unknown, init: Partial<MessageEventInit> = {}) => window.dispatchEvent(new MessageEvent("message", { data, origin: location.origin, source: window, ...init }));
    post(valid, { origin: "https://evil.example" });
    post(valid, { source: null });
    post({ ...valid, type: "other" }); post({ ...valid, nonce: "short" }); post(null);
    expect(save).not.toHaveBeenCalled();
    post(valid);
    const { type: _type, ...handoff } = valid; expect(save).toHaveBeenCalledWith(handoff);
  });

  it("keeps the Instagram sources free of imports outside their folder", () => {
    // import.meta.url follows the page URL in this environment, so resolve from the repository root.
    const dir = resolve(process.cwd(), "userscript/src/instagram") + "/";
    const sources = readdirSync(dir).filter(file => file.endsWith(".ts") && !file.endsWith(".spec.ts"));
    expect(sources.length).toBeGreaterThan(3);
    for (const file of sources) {
      const text = readFileSync(dir + file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
      for (const [, spec] of text.matchAll(/from\s+["']([^"']+)["']/g)) expect(spec, `${file} imports ${spec}`).toMatch(/^\.\/[\w-]+$/);
      expect(text, file).not.toMatch(/\bGM_\w+|unsafeWindow|fetch\(|XMLHttpRequest/);
    }
  });
});
