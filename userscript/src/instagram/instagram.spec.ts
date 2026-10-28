import profileEs from "../../fixtures/instagram-profile-es.html?raw";
import profileEn from "../../fixtures/instagram-profile-en.html?raw";
import ownProfile from "../../fixtures/instagram-own-profile-es.html?raw";
import dmEs from "../../fixtures/instagram-dm-es.html?raw";
import dmEn from "../../fixtures/instagram-dm-en.html?raw";
import { INSTAGRAM_PASTE_MARKER, consumePasteMarker, hasPasteMarker } from "./marker";
import { accessibleName, findComposer, findMessageButton, normalizeName } from "./finders";
import { composerHas, insertIntoComposer, pasteEvent } from "./insert";
import { FLOW_TRANSITIONS, runPasteFlow, type FlowPhase } from "./flow";
import { FAILURE_NOTICES, NOTICE_ID, PASTED_NOTICE, pasteShortcut, showNotice } from "./notice";
import { startInstagram } from "./start";

const TEXT = "Hola, soy de Hospeda.\nTe escribo por las cabañas en Colón. ¿Te interesa?";
const fast = { buttonTimeoutMs: 120, composerTimeoutMs: 120, intervalMs: 10, settle: () => Promise.resolve() } as const;

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
  it("accepts only the exact #hospeda fragment", () => {
    expect(INSTAGRAM_PASTE_MARKER).toBe("hospeda");
    expect(hasPasteMarker({ hash: "#hospeda" })).toBe(true);
    for (const hash of ["", "#", "#hospeda-x", "#Hospeda", "#xhospeda", "?hospeda"]) expect(hasPasteMarker({ hash })).toBe(false);
  });
  it("removes the marker with replaceState, keeping the path, query and history state", () => {
    const replaceState = vi.fn(), history = { state: { ig: 1 }, replaceState };
    expect(consumePasteMarker({ location: { hash: "#hospeda", pathname: "/hotel.sol/", search: "?hl=es" }, history })).toBe(true);
    expect(replaceState).toHaveBeenCalledWith({ ig: 1 }, "", "/hotel.sol/?hl=es");
    expect(consumePasteMarker({ location: { hash: "", pathname: "/hotel.sol/", search: "" }, history })).toBe(false);
    expect(replaceState).toHaveBeenCalledTimes(1);
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
    expect(await runPasteFlow({ doc: document, readClipboard, ...fast, onPhase: phase => phases.push(phase) })).toEqual({ ok: true });
    expect(phases).toEqual(["finding-button", "waiting-composer", "reading-clipboard", "inserting", "done"]);
    expect(composerHas({ composer: composerNow(), text: TEXT })).toBe(true); expect(document.activeElement).toBe(composerNow());
    expect(page.sends).toEqual([]); expect(page.keys).toEqual([]); page.cleanup();
  });
  it("works on the English UI too", async () => {
    const page = mountProfile({ profile: profileEn, dm: dmEn });
    expect(await runPasteFlow({ doc: document, readClipboard: async () => TEXT, ...fast })).toEqual({ ok: true });
    expect(page.sends).toEqual([]); expect(page.keys).toEqual([]); page.cleanup();
  });
  it("fails with no-button on a profile without «Enviar mensaje», without reading the clipboard", async () => {
    document.body.innerHTML = ownProfile; const readClipboard = vi.fn(async () => TEXT);
    expect(await runPasteFlow({ doc: document, readClipboard, ...fast })).toMatchObject({ ok: false, reason: "no-button" });
    expect(readClipboard).not.toHaveBeenCalled();
  });
  it("fails with composer-timeout when the chat never opens", async () => {
    document.body.innerHTML = profileEs;
    expect(await runPasteFlow({ doc: document, readClipboard: async () => TEXT, ...fast })).toMatchObject({ ok: false, reason: "composer-timeout" });
  });
  it("does not paste into a composer that already has text", async () => {
    mountProfile({ editor: composer => { composer.textContent = "Borrador viejo"; } }); const readClipboard = vi.fn(async () => TEXT);
    const result = await runPasteFlow({ doc: document, readClipboard, ...fast });
    expect(result).toMatchObject({ ok: false, reason: "composer-busy" }); expect(readClipboard).not.toHaveBeenCalled();
    expect(composerNow().textContent).toBe("Borrador viejo");
  });
  it("reports a denied and an empty clipboard", async () => {
    mountProfile();
    expect(await runPasteFlow({ doc: document, readClipboard: async () => { throw new DOMException("denied", "NotAllowedError"); }, ...fast })).toMatchObject({ ok: false, reason: "clipboard-denied" });
    mountProfile();
    expect(await runPasteFlow({ doc: document, readClipboard: async () => "  \n", ...fast })).toMatchObject({ ok: false, reason: "clipboard-empty" });
  });
  it("reports insert-failed when neither method changed the editor", async () => {
    mountProfile({ editor: () => {} }); document.execCommand = (() => false) as typeof document.execCommand;
    expect(await runPasteFlow({ doc: document, readClipboard: async () => TEXT, ...fast })).toMatchObject({ ok: false, reason: "insert-failed" });
    expect(composerNow().textContent).toBe("");
  });
  it("uses an already open chat without clicking anything", async () => {
    document.body.innerHTML = dmEs; lexical(composerNow());
    expect(await runPasteFlow({ doc: document, readClipboard: async () => TEXT, ...fast })).toEqual({ ok: true });
  });
});

describe("instagram notice (§2.3)", () => {
  it("has a Spanish message per failure and turns Ctrl+V into ⌘V on macOS", () => {
    expect(Object.keys(FAILURE_NOTICES).sort()).toEqual(["clipboard-denied", "clipboard-empty", "composer-busy", "composer-timeout", "insert-failed", "no-button"]);
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

describe("startInstagram: once per marker, nothing without it", () => {
  it("does nothing on a page without the marker", async () => {
    history.replaceState(null, "", "/cabanas_del_rio/"); document.body.innerHTML = profileEs; const before = document.body.innerHTML;
    const onResult = vi.fn(), readClipboard = vi.fn(async () => TEXT);
    startInstagram({ flow: { ...fast, readClipboard }, onResult }); await new Promise(resolve => setTimeout(resolve, 50));
    expect(onResult).not.toHaveBeenCalled(); expect(readClipboard).not.toHaveBeenCalled(); expect(document.body.innerHTML).toBe(before);
  });
  it("consumes the marker, pastes once and ignores repeated hashchange events", async () => {
    history.replaceState(null, "", "/cabanas_del_rio/#hospeda"); const page = mountProfile({ delayMs: 20 });
    const results: unknown[] = [], readClipboard = vi.fn(async () => TEXT);
    startInstagram({ flow: { ...fast, readClipboard }, onResult: result => results.push(result) });
    expect(location.hash).toBe(""); expect(location.pathname).toBe("/cabanas_del_rio/");
    window.dispatchEvent(new HashChangeEvent("hashchange")); window.dispatchEvent(new HashChangeEvent("hashchange"));
    await vi.waitFor(() => expect(results).toEqual([{ ok: true }]));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(results).toHaveLength(1); expect(readClipboard).toHaveBeenCalledTimes(1);
    expect(document.getElementById(NOTICE_ID)!.shadowRoot!.textContent).toContain(PASTED_NOTICE);
    expect(page.sends).toEqual([]); expect(page.keys).toEqual([]); page.cleanup();
  });
  it("shows the failure notice and focuses the composer when the clipboard is denied", async () => {
    history.replaceState(null, "", "/cabanas_del_rio/#hospeda"); mountProfile(); const results: unknown[] = [];
    startInstagram({ flow: { ...fast, readClipboard: async () => { throw new Error("denied"); } }, onResult: result => results.push(result) });
    await vi.waitFor(() => expect(results).toHaveLength(1));
    expect(document.getElementById(NOTICE_ID)!.shadowRoot!.querySelector('[role="alert"]')!.textContent).toContain("No pude leer el portapapeles.");
    expect(document.activeElement).toBe(composerNow());
  });
});
