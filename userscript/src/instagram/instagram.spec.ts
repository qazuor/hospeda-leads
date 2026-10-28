import profileEs from "../../fixtures/instagram-profile-es.html?raw";
import profileEn from "../../fixtures/instagram-profile-en.html?raw";
import ownProfile from "../../fixtures/instagram-own-profile-es.html?raw";
import highlightProfile from "../../fixtures/instagram-profile-highlight-es.html?raw";
import miniChat from "../../fixtures/instagram-mini-chat-es.html?raw";
import dmEs from "../../fixtures/instagram-dm-es.html?raw";
import dmEn from "../../fixtures/instagram-dm-en.html?raw";
import { INSTAGRAM_PASTE_MARKER, consumePasteMarker, pasteMarkerNonce } from "./marker";
import { HANDOFF_TEXT_MAX, HANDOFF_TTL_MS, checkHandoff, handoffFragment, handoffTextAllowed, newNonce, parseHandoff, profileUsername, type InstagramHandoff } from "./handoff";
import { accessibleName, findComposer, findMessageButton, findThreadComposer, normalizeName } from "./finders";
import { composerHas, insertIntoComposer, pasteEvent } from "./insert";
import { FLOW_TRANSITIONS, runPasteFlow, type FlowPhase } from "./flow";
import { FAILURE_NOTICES, NOTICE_ID, PASTED_NOTICE, UNCONFIRMED_NOTICE, pasteShortcut, showNotice } from "./notice";
import { startInstagram, type HandoffStore } from "./start";

const TEXT = "Hola, soy de Hospeda.\nTe escribo por las cabañas en Colón. ¿Te interesa?";
const USER = "cabanas_del_rio", PROFILE_PATH = `/${USER}/`, THREAD_PATH = "/direct/t/1234567890/";
const fast = { buttonTimeoutMs: 120, composerTimeoutMs: 120, intervalMs: 10, settle: () => Promise.resolve() } as const;
const NONCE = "0123456789abcdef0123456789abcdef";

/** Mimics Lexical: a paste with `text/plain` replaces the empty paragraph with one paragraph per line. */
function lexical(composer: HTMLElement): void {
  composer.addEventListener("paste", event => {
    const text = (event as ClipboardEvent).clipboardData?.getData("text/plain") ?? ""; if (!text) return;
    event.preventDefault(); composer.replaceChildren(...text.split("\n").map(line => { const p = document.createElement("p"); p.textContent = line; return p; }));
  });
}
type MountOptions = { profile?: string; dm?: string; editor?: (el: HTMLElement) => void; delayMs?: number; withMiniChat?: boolean; navigates?: boolean };
/**
 * Mounts a profile at `/<user>/` whose message button "navigates" (pushState to a thread and swaps in the DM fixture), as Instagram's
 * SPA does. Optionally keeps a floating mini-chat with somebody else on screen. Records any send and any key event.
 */
function mountProfile({ profile = profileEs, dm = dmEs, editor = lexical, delayMs = 0, withMiniChat = false, navigates = true }: MountOptions = {}) {
  if (location.pathname !== PROFILE_PATH) history.replaceState(null, "", PROFILE_PATH + location.hash);
  document.body.innerHTML = profile + (withMiniChat ? miniChat : ""); const sends: string[] = [], keys: string[] = [];
  const onKey = (e: KeyboardEvent) => keys.push(`${e.type}:${e.key}`);
  for (const type of ["keydown", "keypress", "keyup"] as const) document.addEventListener(type, onKey, true);
  const openDm = () => {
    history.pushState(null, "", THREAD_PATH);
    document.body.innerHTML = dm + (withMiniChat ? miniChat : "");
    for (const button of document.querySelectorAll<HTMLElement>("#send-es, #send-en")) button.addEventListener("click", () => sends.push(button.id));
    for (const composer of document.querySelectorAll<HTMLElement>('[role="textbox"]')) editor(composer);
  };
  const button = findMessageButton({ doc: document });
  let clicked = 0;
  button?.addEventListener("click", () => { clicked++; if (!navigates) return; if (delayMs) setTimeout(openDm, delayMs); else openDm(); });
  return { sends, keys, clicks: () => clicked, cleanup: () => { for (const type of ["keydown", "keypress", "keyup"] as const) document.removeEventListener(type, onKey, true); } };
}
const mainComposer = () => document.querySelector<HTMLElement>('[role="main"] [role="textbox"], main [role="textbox"]')!;
const miniComposer = () => document.getElementById("mini-composer")!;
const flow = (over: Partial<Parameters<typeof runPasteFlow>[0]> = {}) => runPasteFlow({ doc: document, location, username: USER, text: TEXT, ...fast, ...over });

const originalExec = document.execCommand;
afterEach(() => { document.execCommand = originalExec; document.body.innerHTML = ""; history.replaceState(null, "", "/"); vi.useRealTimers(); vi.restoreAllMocks(); });

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

describe("instagram handoff (D6, D7)", () => {
  const handoff = (over: Partial<InstagramHandoff> = {}): InstagramHandoff => ({ nonce: NONCE, username: USER, expiresAt: Date.now() + HANDOFF_TTL_MS, text: TEXT, ...over });
  it("generates 128-bit hex nonces and the fragment that carries them", () => {
    const a = newNonce(), b = newNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/); expect(a).not.toBe(b);
    expect(handoffFragment({ nonce: a })).toBe(`hospeda=${a}`);
  });
  it("carries the text itself, capped at 4000 characters and never blank", () => {
    expect(HANDOFF_TEXT_MAX).toBe(4000);
    expect(handoffTextAllowed("ñ".repeat(4000))).toBe(true);
    for (const text of ["", "   \n", "a".repeat(4001)]) expect(handoffTextAllowed(text)).toBe(false);
  });
  it("parses only well-formed handoffs that expire within the TTL", () => {
    const now = Date.now(), valid = handoff();
    expect(parseHandoff({ value: valid, now })).toEqual(valid);
    for (const value of [null, "x", { ...handoff(), nonce: "abc" }, { ...handoff(), username: "Hotel Sol" }, { ...handoff(), text: 5 }, { ...handoff(), text: "a".repeat(4001) }, { ...handoff(), expiresAt: "soon" }, { ...handoff(), expiresAt: now + 60 * 60_000 }]) expect(parseHandoff({ value, now })).toBeNull();
  });
  it("authorizes only the same nonce, before expiry, on the profile the CRM opened (case-insensitive)", () => {
    expect(profileUsername({ pathname: "/Cabanas_Del_Rio/" })).toBe(USER);
    for (const pathname of ["/direct/t/123/", "/", "/cabanas_del_rio/reels/"]) expect(profileUsername({ pathname })).toBeNull();
    expect(checkHandoff({ handoff: handoff(), nonce: NONCE, pathname: "/Cabanas_Del_Rio/" })).toBe("ok");
    expect(checkHandoff({ handoff: null, nonce: NONCE, pathname: PROFILE_PATH })).toBe("missing");
    expect(checkHandoff({ handoff: handoff(), nonce: "f".repeat(32), pathname: PROFILE_PATH })).toBe("nonce");
    expect(checkHandoff({ handoff: handoff({ expiresAt: Date.now() - 1 }), nonce: NONCE, pathname: PROFILE_PATH })).toBe("expired");
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
  it("finds «Enviar mensaje» in the Spanish profile header and ignores «Mensajes» in the navigation", () => {
    document.body.innerHTML = profileEs; const button = findMessageButton({ doc: document })!;
    expect(accessibleName(button)).toBe("enviar mensaje"); expect(button.closest("header")).not.toBeNull();
  });
  it("finds the visible «Message» on an English profile and skips the hidden duplicate", () => {
    document.body.innerHTML = profileEn; expect(findMessageButton({ doc: document })!.id).toBe("visible-message");
  });
  it("only looks in the profile header: a highlight or a post link titled «Mensaje» never matches", () => {
    document.body.innerHTML = highlightProfile; expect(findMessageButton({ doc: document })!.id).toBe("header-message");
    document.getElementById("header-message")!.remove(); expect(findMessageButton({ doc: document })).toBeNull();
  });
  it("returns null on the seller's own profile", () => {
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
  it("with a new /direct/t/ thread, uses only the page composer, never a floating one", () => {
    document.body.innerHTML = miniChat + dmEs;
    expect(findThreadComposer({ doc: document, pathname: THREAD_PATH, startPath: PROFILE_PATH, username: USER })!.closest('[role="dialog"]')).toBeNull();
    document.body.innerHTML = miniChat.replace("otra_persona", USER);// even a floating chat labelled for the target is not used once a thread opened
    expect(findThreadComposer({ doc: document, pathname: THREAD_PATH, startPath: PROFILE_PATH, username: USER })).toBeNull();
  });
  it("rejects a floating chat whose messages read @target or target: message content never identifies a chat", () => {
    document.body.innerHTML = profileEs + miniChat;
    expect(document.getElementById("mini-chat")!.textContent).toContain("@cabanas_del_rio");
    expect(findThreadComposer({ doc: document, pathname: PROFILE_PATH, startPath: PROFILE_PATH, username: USER })).toBeNull();
  });
  it("accepts a floating chat only by its own label or header", () => {
    document.body.innerHTML = profileEs + miniChat;
    expect(findThreadComposer({ doc: document, pathname: PROFILE_PATH, startPath: PROFILE_PATH, username: "otra_persona" })!.id).toBe("mini-composer");
    document.body.innerHTML = profileEs + `<div role="dialog" aria-label="Chat"><header><h2>@${USER}</h2></header><div role="grid"></div><div contenteditable="true" role="textbox" aria-label="Mensaje" id="by-header"><p><br></p></div></div>`;
    expect(findThreadComposer({ doc: document, pathname: PROFILE_PATH, startPath: PROFILE_PATH, username: USER })!.id).toBe("by-header");
  });
});

describe("instagram insertion (D3)", () => {
  it("builds a paste event that carries text/plain", () => {
    const event = pasteEvent({ text: TEXT, view: window }) as ClipboardEvent;
    expect(event.type).toBe("paste"); expect(event.bubbles).toBe(true); expect(event.clipboardData!.getData("text/plain")).toBe(TEXT);
  });
  it("pastes through the editor's paste handler, line breaks included", async () => {
    document.body.innerHTML = dmEs; const composer = findComposer({ doc: document })!; lexical(composer);
    expect(await insertIntoComposer({ composer, text: TEXT, settle: fast.settle })).toEqual({ ok: true, method: "paste" });
    expect(composer.querySelectorAll("p")).toHaveLength(2); expect(composerHas({ composer, text: TEXT })).toBe(true);
  });
  it("checks exact (whitespace-insensitive) equality, not containment", () => {
    document.body.innerHTML = dmEs; const composer = findComposer({ doc: document })!;
    composer.textContent = TEXT.replace("\n", " "); expect(composerHas({ composer, text: TEXT })).toBe(true);
    composer.textContent = `${TEXT} extra`; expect(composerHas({ composer, text: TEXT })).toBe(false);
  });
  it("falls back to execCommand('insertText') when the paste left the editor empty", async () => {
    document.body.innerHTML = dmEn; const composer = findComposer({ doc: document })!;
    const exec = vi.fn((command: string, _ui?: boolean, value?: string) => { if (command === "insertText") composer.textContent = value ?? ""; return true; });
    document.execCommand = exec as typeof document.execCommand;
    expect(await insertIntoComposer({ composer, text: TEXT, settle: fast.settle })).toEqual({ ok: true, method: "insertText" });
    expect(exec).toHaveBeenCalledWith("insertText", false, TEXT);
  });
  it("does not try again when the paste left other content (it would duplicate)", async () => {
    document.body.innerHTML = dmEs; const composer = findComposer({ doc: document })!;
    composer.addEventListener("paste", e => { e.preventDefault(); composer.textContent = "Hola, soy"; });
    const exec = vi.fn(() => true); document.execCommand = exec as typeof document.execCommand;
    expect(await insertIntoComposer({ composer, text: TEXT, settle: fast.settle })).toEqual({ ok: false });
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("instagram paste flow (state machine, M2)", () => {
  it("only allows forward transitions and ends in done or failed", () => {
    expect(FLOW_TRANSITIONS.done).toEqual([]); expect(FLOW_TRANSITIONS.failed).toEqual([]);
    expect(FLOW_TRANSITIONS["finding-button"]).not.toContain("inserting");
  });
  it("clicks «Enviar mensaje», waits for the new thread, inserts the handoff text and never sends", async () => {
    const page = mountProfile({ delayMs: 30 }), phases: FlowPhase[] = [];
    expect(await flow({ onPhase: phase => phases.push(phase) })).toEqual({ ok: true });
    expect(phases).toEqual(["finding-button", "waiting-composer", "inserting", "done"]);
    expect(composerHas({ composer: mainComposer(), text: TEXT })).toBe(true); expect(document.activeElement).toBe(mainComposer());
    expect(page.sends).toEqual([]); expect(page.keys).toEqual([]); page.cleanup();
  });
  it("works on the English UI too", async () => {
    const page = mountProfile({ profile: profileEn, dm: dmEn });
    expect(await flow()).toEqual({ ok: true });
    expect(page.sends).toEqual([]); expect(page.keys).toEqual([]); page.cleanup();
  });
  it("always clicks, even with a chat already open, and never uses a mini-chat with somebody else", async () => {
    const page = mountProfile({ withMiniChat: true });
    expect(await flow()).toEqual({ ok: true }); expect(page.clicks()).toBe(1);
    expect(composerHas({ composer: mainComposer(), text: TEXT })).toBe(true); expect(miniComposer().textContent).toBe(""); page.cleanup();
  });
  it("does not paste when the click opened nothing it can verify (only the mini-chat is there)", async () => {
    const page = mountProfile({ withMiniChat: true, navigates: false });
    expect(await flow()).toMatchObject({ ok: false, reason: "thread-unverified" });
    expect(page.clicks()).toBe(1); expect(miniComposer().textContent).toBe(""); page.cleanup();
  });
  it("aborts when the page moves to another profile while waiting for the chat", async () => {
    const page = mountProfile({ navigates: false });
    findMessageButton({ doc: document })!.addEventListener("click", () => setTimeout(() => { history.pushState(null, "", "/otro_negocio/"); document.body.innerHTML = dmEs; }, 20));
    expect(await flow()).toMatchObject({ ok: false, reason: "navigated-away" });
    expect(findComposer({ doc: document })!.textContent).toBe(""); page.cleanup();
  });
  it("does not click when the page is no longer the verified profile", async () => {
    const page = mountProfile(); history.replaceState(null, "", "/otro_negocio/");
    expect(await flow()).toMatchObject({ ok: false, reason: "navigated-away" }); expect(page.clicks()).toBe(0); page.cleanup();
  });
  it("fails with no-button on a profile without «Enviar mensaje»", async () => {
    history.replaceState(null, "", PROFILE_PATH); document.body.innerHTML = ownProfile;
    expect(await flow()).toMatchObject({ ok: false, reason: "no-button" });
  });
  it("fails with composer-timeout when the chat never opens", async () => {
    mountProfile({ navigates: false });
    expect(await flow()).toMatchObject({ ok: false, reason: "composer-timeout" });
  });
  it("does not paste into a composer that already has text", async () => {
    mountProfile({ editor: composer => { composer.textContent = "Borrador viejo"; } });
    expect(await flow()).toMatchObject({ ok: false, reason: "composer-busy" });
    expect(mainComposer().textContent).toBe("Borrador viejo");
  });
  it("reports insert-failed when neither method changed the editor", async () => {
    mountProfile({ editor: () => {} }); document.execCommand = (() => false) as typeof document.execCommand;
    expect(await flow()).toMatchObject({ ok: false, reason: "insert-failed" });
    expect(mainComposer().textContent).toBe("");
  });
});

describe("instagram notice (§2.3)", () => {
  it("has a Spanish message per failure and turns Ctrl+V into ⌘V on macOS", () => {
    expect(Object.keys(FAILURE_NOTICES).sort()).toEqual(["composer-busy", "composer-timeout", "insert-failed", "navigated-away", "no-button", "thread-unverified"]);
    expect(FAILURE_NOTICES["insert-failed"]).toBe("No pude pegar el mensaje: pegalo con Ctrl+V.");
    expect(UNCONFIRMED_NOTICE).toBe('No pude confirmar que lo abrió el CRM: tocá "Enviar mensaje" y pegá el mensaje (Ctrl+V).');
    expect(pasteShortcut({ text: UNCONFIRMED_NOTICE, platform: "MacIntel" })).toContain("(⌘V)");
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
  /** In-memory stand-in for the GM handoff key, with the same compare-and-delete as the real store. */
  function memoryStore(value: unknown): HandoffStore & { value: unknown; reads: number } {
    const store = { value, reads: 0, read: () => { store.reads++; return store.value; }, clear: ({ nonce }: { nonce: string }) => { if ((store.value as { nonce?: string } | null)?.nonce === nonce) store.value = null; } }; return store;
  }
  const handoff = (over: Partial<InstagramHandoff> = {}): InstagramHandoff => ({ nonce: NONCE, username: USER, expiresAt: Date.now() + HANDOFF_TTL_MS, text: TEXT, ...over });
  const notice = () => document.getElementById(NOTICE_ID)?.shadowRoot?.textContent ?? null;
  /** Runs the module on a profile and returns what happened. */
  async function run({ hash, store, waitMs = 60 }: { hash: string; store: HandoffStore; waitMs?: number }) {
    history.replaceState(null, "", PROFILE_PATH + hash); const page = mountProfile();
    const results: unknown[] = [];
    startInstagram({ store, flow: fast, handoffWaitMs: waitMs, onResult: result => results.push(result) });
    if (pasteMarkerNonce({ hash })) await vi.waitFor(() => expect(results).toHaveLength(1)); else await new Promise(resolve => setTimeout(resolve, 60));
    await new Promise(resolve => setTimeout(resolve, 20)); page.cleanup();
    return { results, clicks: page.clicks(), sends: page.sends };
  }
  beforeEach(() => { vi.spyOn(console, "debug").mockImplementation(() => {}); });

  it("does nothing on a page without the marker: no storage read, no DOM change", async () => {
    history.replaceState(null, "", PROFILE_PATH); document.body.innerHTML = profileEs; const before = document.body.innerHTML, store = memoryStore(handoff()), onResult = vi.fn();
    startInstagram({ store, flow: fast, handoffWaitMs: 30, onResult }); await new Promise(resolve => setTimeout(resolve, 60));
    expect(onResult).not.toHaveBeenCalled(); expect(store.reads).toBe(0); expect(document.body.innerHTML).toBe(before);
  });
  it("stays silent with a bare #hospeda: no click, no notice, the pending handoff stays", async () => {
    const store = memoryStore(handoff()), outcome = await run({ hash: "#hospeda", store });
    expect(outcome.results).toEqual([]); expect(outcome.clicks).toBe(0); expect(notice()).toBeNull(); expect(store.reads).toBe(0); expect(store.value).not.toBeNull();
  });
  for (const [name, stored, cleared] of [
    ["an unknown or superseded nonce", () => handoff({ nonce: "f".repeat(32) }), false],
    ["no handoff at all", () => null, false],
    ["an expired nonce", () => handoff({ expiresAt: Date.now() - 1 }), true],
    ["another profile's username", () => handoff({ username: "otro_negocio" }), true],
  ] as const) it(`shows only the fixed neutral notice with ${name} (M3)`, async () => {
    const store = memoryStore(stored()), outcome = await run({ hash: `#hospeda=${NONCE}`, store });
    expect(outcome.results).toEqual([{ ok: false, reason: "unconfirmed" }]); expect(outcome.clicks).toBe(0);
    expect(notice()).toContain('No pude confirmar que lo abrió el CRM: tocá "Enviar mensaje" y pegá el mensaje');
    expect(store.value === null).toBe(cleared || stored() === null);
  });
  it("pastes the handoff text once, deletes it first, and a reused nonce only gets the neutral notice", async () => {
    const store = memoryStore(handoff()), first = await run({ hash: `#hospeda=${NONCE}`, store });
    expect(first.results).toEqual([{ ok: true }]); expect(first.clicks).toBe(1); expect(first.sends).toEqual([]);
    expect(store.value).toBeNull(); expect(composerHas({ composer: mainComposer(), text: TEXT })).toBe(true);
    expect(notice()).toContain(PASTED_NOTICE);
    const again = await run({ hash: `#hospeda=${NONCE}`, store });
    expect(again.results).toEqual([{ ok: false, reason: "unconfirmed" }]); expect(again.clicks).toBe(0);
  });
  it("a second «Abrir Instagram» supersedes the first: tab A neither pastes nor wipes tab B's handoff (L7)", async () => {
    const second = "e".repeat(32), store = memoryStore(handoff({ nonce: second }));
    const tabA = await run({ hash: `#hospeda=${NONCE}`, store });
    expect(tabA.results).toEqual([{ ok: false, reason: "unconfirmed" }]); expect((store.value as InstagramHandoff).nonce).toBe(second);
    const tabB = await run({ hash: `#hospeda=${second}`, store });
    expect(tabB.results).toEqual([{ ok: true }]); expect(store.value).toBeNull();
  });
  it("waits for a handoff that reaches the tab a moment later (GM storage sync)", async () => {
    const store = memoryStore(null); setTimeout(() => { store.value = handoff(); }, 20);
    const outcome = await run({ hash: `#hospeda=${NONCE}`, store, waitMs: 500 });
    expect(outcome.results).toEqual([{ ok: true }]);
  });
  it("runs once even with repeated hashchange events", async () => {
    history.replaceState(null, "", PROFILE_PATH + `#hospeda=${NONCE}`); const page = mountProfile({ delayMs: 20 }); const store = memoryStore(handoff()), results: unknown[] = [];
    startInstagram({ store, flow: fast, handoffWaitMs: 60, onResult: result => results.push(result) });
    window.dispatchEvent(new HashChangeEvent("hashchange")); window.dispatchEvent(new HashChangeEvent("hashchange"));
    await vi.waitFor(() => expect(results).toEqual([{ ok: true }])); await new Promise(resolve => setTimeout(resolve, 50));
    expect(results).toHaveLength(1); expect(page.clicks()).toBe(1); page.cleanup();
  });
  it("leaves a composer that already has text untouched and says so", async () => {
    history.replaceState(null, "", PROFILE_PATH + `#hospeda=${NONCE}`); mountProfile({ editor: composer => { composer.textContent = "Borrador viejo"; } }); const results: unknown[] = [];
    startInstagram({ store: memoryStore(handoff()), flow: fast, handoffWaitMs: 60, onResult: result => results.push(result) });
    await vi.waitFor(() => expect(results).toEqual([expect.objectContaining({ ok: false, reason: "composer-busy" })]));
    expect(mainComposer().textContent).toBe("Borrador viejo"); expect(notice()).toContain("El chat ya tenía texto escrito");
  });
  it("never reads the clipboard", async () => {
    const readText = vi.fn(async () => "secreto"); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText } });
    await run({ hash: `#hospeda=${NONCE}`, store: memoryStore(handoff()) });
    expect(readText).not.toHaveBeenCalled();
  });
});
