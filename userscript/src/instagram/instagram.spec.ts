import profileEs from "../../fixtures/instagram-profile-es.html?raw";
import profileEn from "../../fixtures/instagram-profile-en.html?raw";
import ownProfile from "../../fixtures/instagram-own-profile-es.html?raw";
import dmEs from "../../fixtures/instagram-dm-es.html?raw";
import dmEn from "../../fixtures/instagram-dm-en.html?raw";
import { INSTAGRAM_PASTE_MARKER, consumePasteMarker, pasteMarkerNonce } from "./marker";
import { HANDOFF_TTL_MS, checkHandoff, handoffFragment, newNonce, normalizeForHash, parseHandoff, profileUsername, textHash, type InstagramHandoff } from "./handoff";
import { accessibleName, findComposer, findMessageButton, normalizeName } from "./finders";
import { composerHas, insertIntoComposer, pasteEvent } from "./insert";
import { FLOW_TRANSITIONS, runPasteFlow, type FlowPhase } from "./flow";
import { FAILURE_NOTICES, NOTICE_ID, PASTED_NOTICE, pasteShortcut, showNotice } from "./notice";
import { startInstagram, type HandoffStore } from "./start";

const TEXT = "Hola, soy de Hospeda.\nTe escribo por las cabañas en Colón. ¿Te interesa?";
const fast = { buttonTimeoutMs: 120, composerTimeoutMs: 120, intervalMs: 10, settle: () => Promise.resolve() } as const;
let HASH = "";
beforeAll(async () => { HASH = await textHash({ text: TEXT }); });
const NONCE = "0123456789abcdef0123456789abcdef";

/** Mimics Lexical: a paste with `text/plain` replaces the empty paragraph with one paragraph per line. */
function lexical(composer: HTMLElement): void {
  composer.addEventListener("paste", event => {
    const text = (event as ClipboardEvent).clipboardData?.getData("text/plain") ?? ""; if (!text) return;
    event.preventDefault(); composer.replaceChildren(...text.split("\n").map(line => { const p = document.createElement("p"); p.textContent = line; return p; }));
  });
}
/** Mounts a profile whose message button "navigates" to the DM fixture, as Instagram's SPA does. Records any send. */
function mountProfile({ profile = profileEs, dm = dmEs, editor = lexical, delayMs = 0 }: { profile?: string; dm?: string; editor?: (el: HTMLElement) => void; delayMs?: number } = {}) {
  document.body.innerHTML = profile; const sends: string[] = [], keys: string[] = [];
  const onKey = (e: KeyboardEvent) => keys.push(`${e.type}:${e.key}`);
  for (const type of ["keydown", "keypress", "keyup"] as const) document.addEventListener(type, onKey, true);
  const openDm = () => {
    document.body.innerHTML = dm;
    for (const button of document.querySelectorAll<HTMLElement>("#send-es, #send-en")) button.addEventListener("click", () => sends.push(button.id));
    const composer = findComposer({ doc: document }); if (composer) editor(composer);
  };
  const button = findMessageButton({ doc: document });
  button?.addEventListener("click", () => { if (delayMs) setTimeout(openDm, delayMs); else openDm(); });
  return { sends, keys, cleanup: () => { for (const type of ["keydown", "keypress", "keyup"] as const) document.removeEventListener(type, onKey, true); } };
}
const composerNow = () => findComposer({ doc: document })!;

const originalExec = document.execCommand;
afterEach(() => { document.execCommand = originalExec; document.body.innerHTML = ""; history.replaceState(null, "", "/"); vi.useRealTimers(); });

describe("instagram marker (spec 94 §2.1)", () => {
  it("accepts only #hospeda=<32 hex>; a bare #hospeda carries no nonce", () => {
    expect(INSTAGRAM_PASTE_MARKER).toBe("hospeda");
    expect(pasteMarkerNonce({ hash: `#hospeda=${NONCE}` })).toBe(NONCE);
    for (const hash of ["", "#hospeda", "#hospeda=", "#hospeda=xyz", `#hospeda=${NONCE}0`, `#Hospeda=${NONCE}`, `#hospeda=${NONCE.toUpperCase()}`]) expect(pasteMarkerNonce({ hash }), hash).toBeNull();
  });
  it("removes a well-formed marker with replaceState, keeping the path, query and history state, and leaves anything else alone", () => {
    const replaceState = vi.fn(), history = { state: { ig: 1 }, replaceState };
    expect(consumePasteMarker({ location: { hash: `#hospeda=${NONCE}`, pathname: "/hotel.sol/", search: "?hl=es" }, history })).toBe(NONCE);
    expect(replaceState).toHaveBeenCalledWith({ ig: 1 }, "", "/hotel.sol/?hl=es");
    expect(consumePasteMarker({ location: { hash: "#hospeda", pathname: "/hotel.sol/", search: "" }, history })).toBeNull();
    expect(replaceState).toHaveBeenCalledTimes(1);
  });
});

describe("instagram handoff (D6)", () => {
  const handoff = (over: Partial<InstagramHandoff> = {}): InstagramHandoff => ({ nonce: NONCE, username: "cabanas_del_rio", expiresAt: Date.now() + HANDOFF_TTL_MS, textHash: "0011223344556677", ...over });
  it("generates 128-bit hex nonces and the fragment that carries them", () => {
    const a = newNonce(), b = newNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/); expect(a).not.toBe(b);
    expect(handoffFragment({ nonce: a })).toBe(`hospeda=${a}`);
  });
  it("hashes the normalized text: CRLF and surrounding blanks do not matter, any other change does", async () => {
    expect(normalizeForHash(" a\r\nb \n")).toBe("a\nb");
    expect(HASH).toMatch(/^[0-9a-f]{16}$/);
    expect(await textHash({ text: TEXT.replace(/\n/g, "\r\n") + "\n" })).toBe(HASH);
    expect(await textHash({ text: TEXT + "!" })).not.toBe(HASH);
  });
  it("parses only well-formed handoffs that expire within the TTL", () => {
    const now = Date.now();
    expect(parseHandoff({ value: handoff(), now })).toEqual(handoff());
    for (const value of [null, "x", { ...handoff(), nonce: "abc" }, { ...handoff(), username: "Hotel Sol" }, { ...handoff(), textHash: "zz" }, { ...handoff(), expiresAt: "soon" }, { ...handoff(), expiresAt: now + 60 * 60_000 }]) expect(parseHandoff({ value, now })).toBeNull();
  });
  it("authorizes only the same nonce, before expiry, on the profile the CRM opened (case-insensitive)", () => {
    expect(profileUsername({ pathname: "/Cabanas_Del_Rio/" })).toBe("cabanas_del_rio");
    for (const pathname of ["/direct/t/123/", "/", "/cabanas_del_rio/reels/"]) expect(profileUsername({ pathname })).toBeNull();
    expect(checkHandoff({ handoff: handoff(), nonce: NONCE, pathname: "/Cabanas_Del_Rio/" })).toBe("ok");
    expect(checkHandoff({ handoff: null, nonce: NONCE, pathname: "/cabanas_del_rio/" })).toBe("missing");
    expect(checkHandoff({ handoff: handoff(), nonce: "f".repeat(32), pathname: "/cabanas_del_rio/" })).toBe("nonce");
    expect(checkHandoff({ handoff: handoff({ expiresAt: Date.now() - 1 }), nonce: NONCE, pathname: "/cabanas_del_rio/" })).toBe("expired");
    expect(checkHandoff({ handoff: handoff(), nonce: NONCE, pathname: "/attacker/" })).toBe("username");
  });
});

describe("instagram finders (accessible names, never class names)", () => {
  it("normalizes accents, spaces, case and a trailing ellipsis", () => {
    expect(normalizeName("  Enviar   MENSAJE ")).toBe("enviar mensaje");
    expect(normalizeName("Mensaje…")).toBe("mensaje");
    expect(normalizeName("Message...")).toBe("message");
    expect(normalizeName("Escribí un mensaje")).toBe("escribi un mensaje");
  });
  it("finds «Enviar mensaje» on a Spanish profile and ignores «Mensajes» in the navigation", () => {
    document.body.innerHTML = profileEs; const button = findMessageButton({ doc: document })!;
    expect(accessibleName(button)).toBe("enviar mensaje"); expect(button.closest("main")).not.toBeNull();
  });
  it("finds the visible «Message» on an English profile and skips the hidden duplicate", () => {
    document.body.innerHTML = profileEn; expect(findMessageButton({ doc: document })!.id).toBe("visible-message");
  });
  it("returns null on the seller's own profile and on a DM page", () => {
    document.body.innerHTML = ownProfile; expect(findMessageButton({ doc: document })).toBeNull();
  });
  it("finds the composer by aria-label (Spanish) and aria-labelledby (English), never the search box", () => {
    document.body.innerHTML = dmEs; expect(findComposer({ doc: document })!.getAttribute("aria-label")).toBe("Mensaje");
    document.body.innerHTML = dmEn; expect(findComposer({ doc: document })!.getAttribute("aria-labelledby")).toBe("composer-label-en");
    document.body.innerHTML = profileEs + profileEn; expect(findComposer({ doc: document })).toBeNull();
  });
  it("skips a hidden composer", () => {
    document.body.innerHTML = `<div aria-hidden="true">${dmEs}</div>`; expect(findComposer({ doc: document })).toBeNull();
  });
});

describe("instagram insertion (D3)", () => {
  it("builds a paste event that carries text/plain", () => {
    const event = pasteEvent({ text: TEXT, view: window }) as ClipboardEvent;
    expect(event.type).toBe("paste"); expect(event.bubbles).toBe(true); expect(event.clipboardData!.getData("text/plain")).toBe(TEXT);
  });
  it("pastes through the editor's paste handler, line breaks included", async () => {
    document.body.innerHTML = dmEs; const composer = composerNow(); lexical(composer);
    expect(await insertIntoComposer({ composer, text: TEXT, settle: fast.settle })).toEqual({ ok: true, method: "paste" });
    expect(composer.querySelectorAll("p")).toHaveLength(2); expect(composerHas({ composer, text: TEXT })).toBe(true);
  });
  it("falls back to execCommand('insertText') when the paste left the editor empty", async () => {
    document.body.innerHTML = dmEn; const composer = composerNow();
    const exec = vi.fn((command: string, _ui?: boolean, value?: string) => { if (command === "insertText") composer.textContent = value ?? ""; return true; });
    document.execCommand = exec as typeof document.execCommand;
    expect(await insertIntoComposer({ composer, text: TEXT, settle: fast.settle })).toEqual({ ok: true, method: "insertText" });
    expect(exec).toHaveBeenCalledWith("insertText", false, TEXT);
  });
  it("does not try again when the paste left other content (it would duplicate)", async () => {
    document.body.innerHTML = dmEs; const composer = composerNow();
    composer.addEventListener("paste", e => { e.preventDefault(); composer.textContent = "Hola, soy"; });
    const exec = vi.fn(() => true); document.execCommand = exec as typeof document.execCommand;
    expect(await insertIntoComposer({ composer, text: TEXT, settle: fast.settle })).toEqual({ ok: false });
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("instagram paste flow (state machine)", () => {
  it("only allows forward transitions and ends in done or failed", () => {
    expect(FLOW_TRANSITIONS.done).toEqual([]); expect(FLOW_TRANSITIONS.failed).toEqual([]);
    expect(FLOW_TRANSITIONS["finding-button"]).not.toContain("inserting");
  });
  it("clicks «Enviar mensaje», waits for the composer, pastes the clipboard and never sends", async () => {
    const page = mountProfile({ delayMs: 30 }), phases: FlowPhase[] = [], readClipboard = vi.fn(async () => TEXT);
    expect(await runPasteFlow({ doc: document, expectedTextHash: HASH, readClipboard, ...fast, onPhase: phase => phases.push(phase) })).toEqual({ ok: true });
    expect(phases).toEqual(["finding-button", "waiting-composer", "reading-clipboard", "inserting", "done"]);
    expect(composerHas({ composer: composerNow(), text: TEXT })).toBe(true); expect(document.activeElement).toBe(composerNow());
    expect(page.sends).toEqual([]); expect(page.keys).toEqual([]); page.cleanup();
  });
  it("works on the English UI too", async () => {
    const page = mountProfile({ profile: profileEn, dm: dmEn });
    expect(await runPasteFlow({ doc: document, expectedTextHash: HASH, readClipboard: async () => TEXT, ...fast })).toEqual({ ok: true });
    expect(page.sends).toEqual([]); expect(page.keys).toEqual([]); page.cleanup();
  });
  it("fails with no-button on a profile without «Enviar mensaje», without reading the clipboard", async () => {
    document.body.innerHTML = ownProfile; const readClipboard = vi.fn(async () => TEXT);
    expect(await runPasteFlow({ doc: document, expectedTextHash: HASH, readClipboard, ...fast })).toMatchObject({ ok: false, reason: "no-button" });
    expect(readClipboard).not.toHaveBeenCalled();
  });
  it("fails with composer-timeout when the chat never opens", async () => {
    document.body.innerHTML = profileEs;
    expect(await runPasteFlow({ doc: document, expectedTextHash: HASH, readClipboard: async () => TEXT, ...fast })).toMatchObject({ ok: false, reason: "composer-timeout" });
  });
  it("does not paste into a composer that already has text", async () => {
    mountProfile({ editor: composer => { composer.textContent = "Borrador viejo"; } }); const readClipboard = vi.fn(async () => TEXT);
    const result = await runPasteFlow({ doc: document, expectedTextHash: HASH, readClipboard, ...fast });
    expect(result).toMatchObject({ ok: false, reason: "composer-busy" }); expect(readClipboard).not.toHaveBeenCalled();
    expect(composerNow().textContent).toBe("Borrador viejo");
  });
  it("reports a denied and an empty clipboard", async () => {
    mountProfile();
    expect(await runPasteFlow({ doc: document, expectedTextHash: HASH, readClipboard: async () => { throw new DOMException("denied", "NotAllowedError"); }, ...fast })).toMatchObject({ ok: false, reason: "clipboard-denied" });
    mountProfile();
    expect(await runPasteFlow({ doc: document, expectedTextHash: HASH, readClipboard: async () => "  \n", ...fast })).toMatchObject({ ok: false, reason: "clipboard-empty" });
  });
  it("does not paste when the clipboard no longer holds the CRM message", async () => {
    mountProfile();
    expect(await runPasteFlow({ doc: document, expectedTextHash: HASH, readClipboard: async () => "mi-contraseña-secreta", ...fast })).toMatchObject({ ok: false, reason: "clipboard-changed" });
    expect(composerNow().textContent).toBe("");
  });
  it("reports insert-failed when neither method changed the editor", async () => {
    mountProfile({ editor: () => {} }); document.execCommand = (() => false) as typeof document.execCommand;
    expect(await runPasteFlow({ doc: document, expectedTextHash: HASH, readClipboard: async () => TEXT, ...fast })).toMatchObject({ ok: false, reason: "insert-failed" });
    expect(composerNow().textContent).toBe("");
  });
  it("uses an already open chat without clicking anything", async () => {
    document.body.innerHTML = dmEs; lexical(composerNow());
    expect(await runPasteFlow({ doc: document, expectedTextHash: HASH, readClipboard: async () => TEXT, ...fast })).toEqual({ ok: true });
  });
});

describe("instagram notice (§2.3)", () => {
  it("has a Spanish message per failure and turns Ctrl+V into ⌘V on macOS", () => {
    expect(FAILURE_NOTICES["clipboard-changed"]).toBe("El portapapeles cambió: pegá el mensaje con Ctrl+V.");
    expect(Object.keys(FAILURE_NOTICES).sort()).toEqual(["clipboard-changed", "clipboard-denied", "clipboard-empty", "composer-busy", "composer-timeout", "insert-failed", "no-button"]);
    expect(FAILURE_NOTICES["insert-failed"]).toBe("No pude pegar el mensaje: pegalo con Ctrl+V.");
    expect(pasteShortcut({ text: FAILURE_NOTICES["insert-failed"], platform: "MacIntel" })).toBe("No pude pegar el mensaje: pegalo con ⌘V.");
    expect(pasteShortcut({ text: FAILURE_NOTICES["insert-failed"], platform: "Win32" })).toContain("Ctrl+V");
  });
  it("shows one notice at a time, closes it and removes it after a while", () => {
    vi.useFakeTimers();
    showNotice({ doc: document, text: "uno", tone: "warning" }); const host = showNotice({ doc: document, text: PASTED_NOTICE, tone: "success" });
    expect(document.querySelectorAll(`#${NOTICE_ID}`)).toHaveLength(1);
    expect(host.shadowRoot!.querySelector('[role="status"]')!.textContent).toContain(PASTED_NOTICE);
    host.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Cerrar aviso"]')!.click(); expect(document.getElementById(NOTICE_ID)).toBeNull();
    showNotice({ doc: document, text: "dos", tone: "warning" }); vi.advanceTimersByTime(8000); expect(document.getElementById(NOTICE_ID)).toBeNull();
  });
});

describe("startInstagram: only with a valid one-time handoff", () => {
  /** In-memory stand-in for the GM handoff key. */
  function memoryStore(value: unknown): HandoffStore & { value: unknown; reads: number } {
    const store = { value, reads: 0, read: () => { store.reads++; return store.value; }, clear: () => { store.value = null; } }; return store;
  }
  const handoff = (over: Partial<InstagramHandoff> = {}): InstagramHandoff => ({ nonce: NONCE, username: "cabanas_del_rio", expiresAt: Date.now() + HANDOFF_TTL_MS, textHash: HASH, ...over });
  const at = (hash: string) => history.replaceState(null, "", `/cabanas_del_rio/${hash}`);
  /** Runs the module on a profile and returns what happened: the result, clipboard reads, sends and whether «Enviar mensaje» was clicked. */
  async function run({ hash, store }: { hash: string; store: HandoffStore }) {
    at(hash); const page = mountProfile(); let clicked = false;
    findMessageButton({ doc: document })?.addEventListener("click", () => { clicked = true; });
    const results: unknown[] = [], readClipboard = vi.fn(async () => TEXT);
    startInstagram({ store, flow: { ...fast, readClipboard }, handoffWaitMs: 60, onResult: result => results.push(result) });
    await vi.waitFor(() => expect(results.length + (location.hash === hash && !hash.startsWith("#hospeda=") ? 1 : 0)).toBeGreaterThan(0));
    await new Promise(resolve => setTimeout(resolve, 30)); page.cleanup();
    return { results, readClipboard, clicked, sends: page.sends };
  }
  beforeEach(() => { vi.spyOn(console, "debug").mockImplementation(() => {}); });

  it("does nothing on a page without the marker: no storage read, no DOM change", async () => {
    at(""); document.body.innerHTML = profileEs; const before = document.body.innerHTML, store = memoryStore(handoff()), onResult = vi.fn();
    startInstagram({ store, flow: fast, handoffWaitMs: 30, onResult }); await new Promise(resolve => setTimeout(resolve, 60));
    expect(onResult).not.toHaveBeenCalled(); expect(store.reads).toBe(0); expect(document.body.innerHTML).toBe(before);
  });
  it("ignores a bare #hospeda: no click, no clipboard read, the pending handoff stays", async () => {
    const store = memoryStore(handoff()), outcome = await run({ hash: "#hospeda", store });
    expect(outcome.clicked).toBe(false); expect(outcome.readClipboard).not.toHaveBeenCalled(); expect(store.reads).toBe(0); expect(store.value).not.toBeNull();
  });
  for (const [name, stored, keep] of [
    ["a wrong nonce", () => handoff({ nonce: "f".repeat(32) }), true],
    ["no handoff at all", () => null, true],
    ["an expired nonce", () => handoff({ expiresAt: Date.now() - 1 }), false],
    ["another profile's username", () => handoff({ username: "otro_negocio" }), false],
  ] as const) it(`does nothing with ${name}`, async () => {
    const store = memoryStore(stored()), outcome = await run({ hash: `#hospeda=${NONCE}`, store });
    expect(outcome.results).toEqual([{ ok: false, reason: "unauthorized" }]);
    expect(outcome.clicked).toBe(false); expect(outcome.readClipboard).not.toHaveBeenCalled(); expect(document.getElementById(NOTICE_ID)).toBeNull();
    expect(store.value === null).toBe(!keep || stored() === null);
  });
  it("pastes once with a valid handoff, deletes it first, and a reused nonce does nothing", async () => {
    const store = memoryStore(handoff()), first = await run({ hash: `#hospeda=${NONCE}`, store });
    expect(first.results).toEqual([{ ok: true }]); expect(first.clicked).toBe(true); expect(first.sends).toEqual([]);
    expect(store.value).toBeNull(); expect(location.hash).toBe("");
    expect(document.getElementById(NOTICE_ID)!.shadowRoot!.textContent).toContain(PASTED_NOTICE);
    const again = await run({ hash: `#hospeda=${NONCE}`, store });
    expect(again.results).toEqual([{ ok: false, reason: "unauthorized" }]); expect(again.clicked).toBe(false); expect(again.readClipboard).not.toHaveBeenCalled();
  });
  it("waits for a handoff that reaches the tab a moment later (GM storage sync)", async () => {
    const store = memoryStore(null); setTimeout(() => { store.value = handoff(); }, 20);
    at(`#hospeda=${NONCE}`); mountProfile(); const results: unknown[] = [];
    startInstagram({ store, flow: { ...fast, readClipboard: async () => TEXT }, handoffWaitMs: 500, onResult: result => results.push(result) });
    await vi.waitFor(() => expect(results).toEqual([{ ok: true }]));
  });
  it("runs once even with repeated hashchange events", async () => {
    at(`#hospeda=${NONCE}`); mountProfile({ delayMs: 20 }); const store = memoryStore(handoff()), results: unknown[] = [], readClipboard = vi.fn(async () => TEXT);
    startInstagram({ store, flow: { ...fast, readClipboard }, handoffWaitMs: 60, onResult: result => results.push(result) });
    window.dispatchEvent(new HashChangeEvent("hashchange")); window.dispatchEvent(new HashChangeEvent("hashchange"));
    await vi.waitFor(() => expect(results).toEqual([{ ok: true }])); await new Promise(resolve => setTimeout(resolve, 50));
    expect(results).toHaveLength(1); expect(readClipboard).toHaveBeenCalledTimes(1);
  });
  it("shows the failure notice and focuses the composer when the clipboard is denied", async () => {
    at(`#hospeda=${NONCE}`); mountProfile(); const results: unknown[] = [];
    startInstagram({ store: memoryStore(handoff()), flow: { ...fast, readClipboard: async () => { throw new Error("denied"); } }, handoffWaitMs: 60, onResult: result => results.push(result) });
    await vi.waitFor(() => expect(results).toHaveLength(1));
    expect(document.getElementById(NOTICE_ID)!.shadowRoot!.querySelector('[role="alert"]')!.textContent).toContain("No pude leer el portapapeles.");
    expect(document.activeElement).toBe(composerNow());
  });
  it("leaves a composer that already has text untouched", async () => {
    at(`#hospeda=${NONCE}`); mountProfile({ editor: composer => { composer.textContent = "Borrador viejo"; } }); const results: unknown[] = [];
    startInstagram({ store: memoryStore(handoff()), flow: { ...fast, readClipboard: async () => TEXT }, handoffWaitMs: 60, onResult: result => results.push(result) });
    await vi.waitFor(() => expect(results).toEqual([expect.objectContaining({ ok: false, reason: "composer-busy" })]));
    expect(composerNow().textContent).toBe("Borrador viejo");
  });
});
