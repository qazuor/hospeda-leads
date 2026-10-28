// @vitest-environment-options {"url":"https://www.instagram.com/cabanas_del_rio/"}
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import profileEs from "../fixtures/instagram-profile-es.html?raw";
import dmEs from "../fixtures/instagram-dm-es.html?raw";
import { siteFor } from "./site";

/**
 * Spec 94 §2.4 (D1): Instagram runs inside the shared «Hospeda CRM» script but must stay isolated. On instagram.com the script never
 * reads the token or any GM storage, never calls GM_xmlhttpRequest or the CRM API, and runs no WhatsApp logic.
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

  it("routes www.instagram.com to the Instagram module only, without GM storage, network or WhatsApp UI", async () => {
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

  it("runs a full paste with the marker and still touches no GM helper or CRM API", async () => {
    const { startInstagram } = await import("./instagram/start");
    history.replaceState(null, "", "/cabanas_del_rio/#hospeda"); document.body.innerHTML = profileEs;
    document.querySelector<HTMLElement>('main [role="button"]:nth-child(2)')!.addEventListener("click", () => {
      document.body.innerHTML = dmEs; const composer = document.querySelector<HTMLElement>('[role="textbox"]')!;
      composer.addEventListener("paste", event => { event.preventDefault(); composer.textContent = (event as ClipboardEvent).clipboardData!.getData("text/plain"); });
    });
    const results: unknown[] = [];
    startInstagram({ flow: { readClipboard: async () => "Hola desde Hospeda", intervalMs: 10, settle: () => Promise.resolve() }, onResult: result => results.push(result) });
    await vi.waitFor(() => expect(results).toEqual([{ ok: true }]));
    for (const fn of Object.values(gm)) expect(fn).not.toHaveBeenCalled();
    expect(api.touched).toEqual([]);
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
