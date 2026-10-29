import profileEs from "../../fixtures/instagram-profile-es.html?raw";
import profileEn from "../../fixtures/instagram-profile-en.html?raw";
import ownProfile from "../../fixtures/instagram-own-profile-es.html?raw";
import highlightProfile from "../../fixtures/instagram-profile-highlight-es.html?raw";
import miniChat from "../../fixtures/instagram-mini-chat-es.html?raw";
import miniChatExpand from "../../fixtures/instagram-mini-chat-expand-es.html?raw";
import threadEs from "../../fixtures/instagram-thread-header-es.html?raw";
import threadEn from "../../fixtures/instagram-thread-header-en.html?raw";
import threadGroup from "../../fixtures/instagram-thread-group-es.html?raw";
import inboxThread from "../../fixtures/instagram-inbox-with-thread-es.html?raw";
import dmEs from "../../fixtures/instagram-dm-es.html?raw";
import dmEn from "../../fixtures/instagram-dm-en.html?raw";
import { INSTAGRAM_PASTE_MARKER, consumePasteMarker, pasteMarkerNonce } from "./marker";
import { HANDOFF_TEXT_MAX, HANDOFF_TTL_MS, checkHandoff, handoffFragment, handoffTextAllowed, newNonce, parseHandoff, profileUsername, threadIdFromPath, type InstagramHandoff } from "./handoff";
import { accessibleName, conversationPane, findComposer, findFloatingExpand, findMessageButton, findPageComposer, normalizeName } from "./finders";
import { headerText, loggedInUsername, profileHrefUsername, proveThread } from "./thread";
import { composerHas, insertIntoComposer, pasteEvent } from "./insert";
import { FLOW_TRANSITIONS, openChatFromProfile, pasteOnChatPage, proofVerdict, type AccountCheck, type FlowPhase } from "./flow";
import { FAILURE_NOTICES, NOTICE_ID, PASTED_NOTICE, UNCONFIRMED_NOTICE, failureNotice, pasteShortcut, showNotice } from "./notice";

const TEXT = "Hola, soy de Hospeda.\nTe escribo por las cabañas en Colón. ¿Te interesa?";
const USER = "cabanas_del_rio", PROFILE_PATH = `/${USER}/`;
const fast = { buttonTimeoutMs: 120, composerTimeoutMs: 120, intervalMs: 10, settle: () => Promise.resolve() } as const;
const NONCE = "0123456789abcdef0123456789abcdef";

/** Mimics Lexical: a paste with `text/plain` replaces the empty paragraph with one paragraph per line. */
function lexical(composer: HTMLElement): void {
  composer.addEventListener("paste", event => {
    const text = (event as ClipboardEvent).clipboardData?.getData("text/plain") ?? ""; if (!text) return;
    event.preventDefault(); composer.replaceChildren(...text.split("\n").map(line => { const p = document.createElement("p"); p.textContent = line; return p; }));
  });
}
/** The chat page fixture of spec 97 §9.1 for any username (the live capture was with `qaz.uor`). */
const threadFor = (user: string, html = threadEs) => html.split("qaz.uor").join(user);
const THREAD_ID = "17848251833510164", CHAT_PATH = `/direct/t/${THREAD_ID}/`;
type MountOptions = { profile?: string; chat?: string; editor?: (el: HTMLElement) => void; mode?: "navigates" | "floating" | "none"; delayMs?: number };
/**
 * Mounts a profile at `/<user>/` whose «Enviar mensaje» behaves like Instagram: it moves to the chat page (`navigates`), or opens a floating chat
 * whose «Expandir» moves there (`floating`, what 9.1 observed live), or opens nothing (`none`). Records any send and any key event.
 */
function mountProfile({ profile = profileEs, chat = threadFor(USER), editor = lexical, mode = "navigates", delayMs = 0 }: MountOptions = {}) {
  if (location.pathname !== PROFILE_PATH) history.replaceState(null, "", PROFILE_PATH + location.hash);
  document.body.innerHTML = profile; const sends: string[] = [], keys: string[] = [];
  const onKey = (e: KeyboardEvent) => keys.push(`${e.type}:${e.key}`);
  for (const type of ["keydown", "keypress", "keyup"] as const) document.addEventListener(type, onKey, true);
  const openChat = () => {
    history.pushState(null, "", CHAT_PATH); document.body.innerHTML = chat;
    document.getElementById("send")?.addEventListener("click", () => sends.push("send"));
    for (const composer of document.querySelectorAll<HTMLElement>('[contenteditable="true"]')) editor(composer);
  };
  let clicked = 0, expanded = 0;
  findMessageButton({ doc: document })?.addEventListener("click", () => {
    clicked++;
    if (mode === "navigates") { if (delayMs) setTimeout(openChat, delayMs); else openChat(); }
    if (mode === "floating") { document.body.insertAdjacentHTML("beforeend", miniChatExpand); document.getElementById("expand")!.addEventListener("click", () => { expanded++; openChat(); }); }
  });
  return { sends, keys, clicks: () => clicked, expanded: () => expanded, cleanup: () => { for (const type of ["keydown", "keypress", "keyup"] as const) document.removeEventListener(type, onKey, true); } };
}
/** Mounts the chat page directly (the CRM opened `/direct/t/<id>/`). */
function mountChat({ chat = threadFor(USER), editor = lexical, path = CHAT_PATH }: { chat?: string; editor?: (el: HTMLElement) => void; path?: string } = {}) {
  history.replaceState(null, "", path); document.body.innerHTML = chat;
  for (const composer of document.querySelectorAll<HTMLElement>('[contenteditable="true"]')) editor(composer);
}
const pageComposer = () => document.getElementById("page-composer")!;
/** The chat page with every profile label removed: the pane names only `user`, with no labelled header (real ambiguity). */
const unlabelled = (user: string) => threadFor(user).replace(/ aria-label="(?:Abrir la página del perfil de|Open the profile page of) [^"]*"/g, "");
const okAccount: AccountCheck = () => "ok";
const open = (over: Partial<Parameters<typeof openChatFromProfile>[0]> = {}) => openChatFromProfile({ doc: document, location, username: USER, buttonTimeoutMs: 120, chatTimeoutMs: 150, intervalMs: 10, ...over });
const paste = (over: Partial<Parameters<typeof pasteOnChatPage>[0]> = {}) => pasteOnChatPage({ doc: document, location, username: USER, threadId: THREAD_ID, text: TEXT, account: okAccount, proofTimeoutMs: 120, composerTimeoutMs: 120, contradictionMs: 30, intervalMs: 10, settle: () => Promise.resolve(), ...over });

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
  // Fixed clock for the block: a second Date.now() could land a millisecond later and push expiresAt past now + TTL (flaky).
  const NOW = Date.now();
  const handoff = (over: Partial<InstagramHandoff> = {}): InstagramHandoff => ({ nonce: NONCE, username: USER, expiresAt: NOW + HANDOFF_TTL_MS, text: TEXT, ...over });
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
    const now = NOW, valid = handoff();
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
    expect(await insertIntoComposer({ composer, text: TEXT, settle: fast.settle })).toEqual({ ok: false, reason: "different" });
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("instagram handoff with a thread id (spec 97 §4.1–4.2)", () => {
  // One fixed expiry for the whole block: two Date.now() calls in one assertion could differ by a millisecond (flaky toEqual).
  const EXPIRES_AT = Date.now() + 60_000;
  const handoff = (over: Partial<InstagramHandoff> = {}): InstagramHandoff => ({ nonce: NONCE, username: USER, expiresAt: EXPIRES_AT, text: TEXT, ...over });
  it("reads the thread id of a chat page path, with or without the trailing slash, digits only", () => {
    // Arrange / Act / Assert
    expect(threadIdFromPath("/direct/t/17848251833510164")).toBe(THREAD_ID);
    expect(threadIdFromPath(CHAT_PATH)).toBe(THREAD_ID);
    for (const path of ["/direct/inbox/", "/direct/t/abc/", "/direct/t/1/x/", "/cabanas_del_rio/", "/direct/t/" + "1".repeat(41) + "/"]) expect(threadIdFromPath(path), path).toBeNull();
  });
  it("parses an optional numeric threadId and rejects anything else", () => {
    const now = Date.now();
    expect(parseHandoff({ value: handoff({ threadId: THREAD_ID }), now })).toEqual(handoff({ threadId: THREAD_ID }));
    expect(parseHandoff({ value: handoff(), now })).not.toHaveProperty("threadId");
    for (const threadId of ["abc", "", 5, null, "1".repeat(41)]) expect(parseHandoff({ value: { ...handoff(), threadId }, now }), String(threadId)).toBeNull();
  });
  it("on a chat page requires the handoff's thread to be the path's; on a profile it compares the username", () => {
    expect(checkHandoff({ handoff: handoff({ threadId: THREAD_ID }), nonce: NONCE, pathname: CHAT_PATH })).toBe("ok");
    expect(checkHandoff({ handoff: handoff({ threadId: "999" }), nonce: NONCE, pathname: CHAT_PATH })).toBe("thread");
    expect(checkHandoff({ handoff: handoff(), nonce: NONCE, pathname: CHAT_PATH })).toBe("thread");// no thread in the handoff: a chat page is never authorized
    expect(checkHandoff({ handoff: handoff({ threadId: THREAD_ID }), nonce: NONCE, pathname: PROFILE_PATH })).toBe("ok");
    expect(checkHandoff({ handoff: handoff({ threadId: THREAD_ID }), nonce: NONCE, pathname: "/attacker/" })).toBe("username");
  });
});

describe("instagram thread proof (spec 97 §4.4, live findings §9.1)", () => {
  const prove = () => proveThread({ doc: document, readPath: () => location.pathname });
  it("proves the 1:1 chat from the pane's links: several links, one distinct username, a labelled header (Spanish UI)", () => {
    mountChat({ chat: threadEs });
    expect(prove()).toEqual({ ok: true, threadId: THREAD_ID, username: "qaz.uor" });
  });
  it("proves it with the English labels and absolute hrefs too", () => {
    mountChat({ chat: threadEn });
    expect(prove()).toEqual({ ok: true, threadId: THREAD_ID, username: "qaz.uor" });
  });
  it("ignores the inbox list beside the conversation and the navigation", () => {
    mountChat({ chat: inboxThread });
    expect(prove()).toEqual({ ok: true, threadId: THREAD_ID, username: "qaz.uor" });
  });
  it("never proves a group: two usernames or a participant count in the header, and names who it saw", () => {
    mountChat({ chat: threadGroup }); expect(prove()).toEqual({ ok: false, reason: "group", names: ["qaz.uor", "otra.persona"] });
    mountChat({ chat: threadGroup.replace('href="/otra.persona" aria-label="Open the profile page of otra.persona"', 'href="/qaz.uor" aria-label="Open the profile page of qaz.uor"') });
    expect(prove()).toEqual({ ok: false, reason: "group", names: ["qaz.uor"] });// one username left, but the header counts members
    mountChat({ chat: threadEs.replace("<span>Ver perfil</span>", "<span>Ver perfil · 3 miembros</span>") }); expect(prove()).toEqual({ ok: false, reason: "group", names: ["qaz.uor"] });
  });
  it("never reads the group signal in the messages: «cabaña para 4 personas» in a 1:1 chat still proves (H2)", () => {
    // Arrange: a tourism question with a people count inside the message list.
    mountChat({ chat: threadEs.replace("Hola, ¿cómo va?", "¿Tienen cabaña para 4 personas?").replace("Gracias", "Somos 3 participantes") });
    // Act / Assert
    expect(prove()).toEqual({ ok: true, threadId: THREAD_ID, username: "qaz.uor" });
    expect(headerText(conversationPane({ doc: document })!)).not.toContain("personas");
  });
  it("needs a link labelled for that same user: no links, a label for somebody else or no label is not proof", () => {
    mountChat({ chat: `<div role="main"><span>qaz.uor</span><div contenteditable="true" data-lexical-editor="true"></div></div>` }); expect(prove()).toEqual({ ok: false, reason: "no-links", names: [] });
    mountChat({ chat: `<div role="main"><a href="/qaz.uor/">qaz.uor</a></div>` }); expect(prove()).toEqual({ ok: false, reason: "no-header", names: ["qaz.uor"] });
    mountChat({ chat: `<div role="main"><a href="/qaz.uor/" aria-label="Abrir la página del perfil de qaz.uor_fan">x</a></div>` }); expect(prove()).toEqual({ ok: false, reason: "several", names: ["qaz.uor", "qaz.uor_fan"] });
  });
  it("never reads a floating chat or a page without the conversation pane, and only on a chat path", () => {
    mountChat({ chat: miniChatExpand }); expect(prove()).toEqual({ ok: false, reason: "no-pane", names: [] });
    mountChat({ chat: `<div role="main"><div role="dialog"><a href="/qaz.uor/" aria-label="Abrir la página del perfil de qaz.uor">x</a></div></div>` }); expect(prove()).toEqual({ ok: false, reason: "no-links", names: [] });
    mountChat({ chat: threadEs, path: "/qaz.uor/" }); expect(prove()).toEqual({ ok: false, reason: "path", names: [] });
  });
  it("fails when the path changes while checking", () => {
    mountChat({ chat: threadEs }); let reads = 0;
    expect(proveThread({ doc: document, readPath: () => (reads++ ? "/direct/t/1/" : CHAT_PATH) })).toEqual({ ok: false, reason: "path-changed", names: ["qaz.uor"] });
  });
  it("reads only profile hrefs: reserved pages and other hosts are not usernames", () => {
    expect(profileHrefUsername("/Qaz.Uor")).toBe("qaz.uor"); expect(profileHrefUsername("https://www.instagram.com/qaz.uor/")).toBe("qaz.uor");
    for (const href of ["/direct/", "/explore/", "/reels/", "/qaz.uor/reels/", "https://evil.example/qaz.uor/", "/p/abc/", null, ""]) expect(profileHrefUsername(href), String(href)).toBeNull();
  });
  it("reads the logged-in account from the «Perfil» link plus the matching avatar alt, in both languages", () => {
    mountChat({ chat: threadEs }); expect(loggedInUsername({ doc: document })).toBe("hospeda.com.ar");
    mountChat({ chat: threadEn }); expect(loggedInUsername({ doc: document })).toBe("hospeda.com.ar");
    mountChat({ chat: threadEs.replace('alt="Foto del perfil de hospeda.com.ar"', 'alt="Foto del perfil de otra.cuenta"') }); expect(loggedInUsername({ doc: document })).toBeNull();
    mountChat({ chat: threadEs.replace("<span>Perfil</span>", "<span>Inicio</span>") }); expect(loggedInUsername({ doc: document })).toBeNull();
  });
});

describe("instagram chat page finders (spec 97 §9.1)", () => {
  it("finds the Lexical composer without aria-label inside the conversation pane, never the floating one", () => {
    mountChat({ chat: threadEs + miniChatExpand });
    expect(conversationPane({ doc: document })).not.toBeNull();
    expect(findPageComposer({ doc: document })?.id).toBe("page-composer");
    mountChat({ chat: miniChatExpand }); expect(findPageComposer({ doc: document })).toBeNull();
  });
  it("refuses to guess between two editors in the pane", () => {
    mountChat({ chat: threadEs.replace('<div role="button" tabindex="0" id="send">', '<div contenteditable="true" data-lexical-editor="true"></div><div role="button" tabindex="0" id="send">') });
    expect(findPageComposer({ doc: document })).toBeNull();
  });
  it("finds only an «Expandir» that was not on the page before the click", () => {
    document.body.innerHTML = profileEs + miniChatExpand; const old = new Set<Element>([document.getElementById("expand")!]);
    expect(findFloatingExpand({ doc: document, before: old })).toBeNull();
    expect(findFloatingExpand({ doc: document, before: new Set() })?.id).toBe("expand");
  });
});

describe("instagram flows (state machines, spec 97 §4.2)", () => {
  it("only allows forward transitions and ends in done or failed", () => {
    expect(FLOW_TRANSITIONS.done).toEqual([]); expect(FLOW_TRANSITIONS.failed).toEqual([]);
    expect(FLOW_TRANSITIONS["finding-button"]).not.toContain("inserting"); expect(FLOW_TRANSITIONS.proving).not.toContain("inserting");
  });
  it("profile → chat page: clicks «Enviar mensaje» once and returns the path's thread", async () => {
    const page = mountProfile(); const phases: FlowPhase[] = [];
    expect(await open({ onPhase: phase => phases.push(phase) })).toEqual({ ok: true, threadId: THREAD_ID });
    expect(page.clicks()).toBe(1); expect(phases).toEqual(["finding-button", "opening-chat", "done"]); page.cleanup();
  });
  it("profile → floating chat → «Expandir» → chat page (what Instagram does live), never touching the floating composer", async () => {
    const page = mountProfile({ mode: "floating" });
    expect(await open()).toEqual({ ok: true, threadId: THREAD_ID }); expect(page.expanded()).toBe(1); page.cleanup();
  });
  it("a floating chat without «Expandir» ends as floating-no-link; nothing at all too", async () => {
    mountProfile({ mode: "none" }); expect(await open()).toEqual({ ok: false, reason: "floating-no-link" });
  });
  it("fails with no-button, and aborts when the page leaves the verified profile", async () => {
    mountProfile({ profile: ownProfile }); expect(await open()).toEqual({ ok: false, reason: "no-button" });
    mountProfile({ mode: "none" }); setTimeout(() => history.pushState(null, "", "/otro_negocio/"), 20);
    expect(await open()).toEqual({ ok: false, reason: "navigated-away" });
  });
  it("chat page proven: pastes into the empty page composer, never sends, no key events", async () => {
    mountChat(); const sends: string[] = [], keys: string[] = []; document.getElementById("send")!.addEventListener("click", () => sends.push("send"));
    const onKey = (e: KeyboardEvent) => keys.push(e.key); document.addEventListener("keydown", onKey, true);
    const phases: FlowPhase[] = [];
    expect(await paste({ onPhase: phase => phases.push(phase) })).toEqual({ ok: true, proof: "header" });
    expect(composerHas({ composer: pageComposer(), text: TEXT })).toBe(true); expect(sends).toEqual([]); expect(keys).toEqual([]);
    expect(phases).toEqual(["proving", "waiting-composer", "inserting", "done"]); document.removeEventListener("keydown", onKey, true);
  });
  it("chat page contradicted (the header proves somebody else): nothing is pasted", async () => {
    mountChat({ chat: threadFor("otra.persona") });
    expect(await paste()).toEqual({ ok: false, reason: "thread-contradicted", composer: null }); expect(composerHas({ composer: pageComposer(), text: TEXT })).toBe(false);
  });
  it("chat page really ambiguous (only @x, no labelled header): thread-unproven; the seller's confirmation pastes", async () => {
    mountChat({ chat: unlabelled(USER) });
    expect(await paste()).toEqual({ ok: false, reason: "thread-unproven", composer: null });
    expect(await paste({ sellerConfirmed: true })).toEqual({ ok: true, proof: "seller" });
  });
  it("evidence against @x is never confirmable (H1): a group, only another user, or another user without a label", async () => {
    for (const chat of [threadGroup.split("qaz.uor").join(USER), threadFor("otra.persona"), unlabelled("otra.persona")]) {
      mountChat({ chat });
      expect(await paste({ sellerConfirmed: true })).toEqual({ ok: false, reason: "thread-contradicted", composer: null });
      expect(composerHas({ composer: pageComposer(), text: TEXT })).toBe(false);
    }
  });
  it("several users that include @x stay ambiguous, so the seller may confirm", async () => {
    mountChat({ chat: threadFor(USER).replace('<div role="row"><a href="/cabanas_del_rio"', '<div role="row"><a href="/otra.persona"') });
    expect(await paste()).toEqual({ ok: false, reason: "thread-unproven", composer: null });
  });
  it("another or an unknown Instagram account: nothing is pasted", async () => {
    mountChat(); expect(await paste({ account: () => "mismatch" })).toEqual({ ok: false, reason: "other-account", composer: null });
    expect(await paste({ account: () => "unknown" })).toEqual({ ok: false, reason: "account-unknown", composer: null });
    expect(composerHas({ composer: pageComposer(), text: TEXT })).toBe(false);
  });
  it("never writes into a composer that already has text, and reports the composer timeout", async () => {
    mountChat(); pageComposer().textContent = "borrador";
    const busy = await paste(); expect(busy.ok).toBe(false); expect(!busy.ok && busy.reason).toBe("composer-busy"); expect(pageComposer().textContent).toBe("borrador");
    mountChat({ chat: threadEs.split("qaz.uor").join(USER).replace(/<div contenteditable[^>]*>.*?<\/div>/, "") });
    expect(await paste()).toEqual({ ok: false, reason: "composer-timeout", composer: null });
  });
  it("aborts when the page moves to another chat before the proof", async () => {
    mountChat(); history.replaceState(null, "", "/direct/t/1/");
    expect(await paste()).toEqual({ ok: false, reason: "navigated-away", composer: null });
  });
  it("reports insert-failed when neither method changed the editor", async () => {
    mountChat({ editor: () => {} }); document.execCommand = () => false;
    const result = await paste(); expect(!result.ok && result.reason).toBe("insert-failed");
  });
  it("judges one proof read against the expected chat", () => {
    const proof = { ok: true as const, threadId: THREAD_ID, username: USER }, at = { username: USER, threadId: THREAD_ID, path: CHAT_PATH };
    expect(proofVerdict({ proof, ...at })).toBe("proven");
    expect(proofVerdict({ ...at, proof: { ...proof, username: "x" } })).toBe("contradicted");
    // Real ambiguity: nothing seen, or @x among others, or only @x without a label.
    expect(proofVerdict({ ...at, proof: { ok: false, reason: "no-links", names: [] } })).toBe("inconclusive");
    expect(proofVerdict({ ...at, proof: { ok: false, reason: "no-pane", names: [] } })).toBe("inconclusive");
    expect(proofVerdict({ ...at, proof: { ok: false, reason: "several", names: [USER, "y"] } })).toBe("inconclusive");
    expect(proofVerdict({ ...at, proof: { ok: false, reason: "no-header", names: [USER] } })).toBe("inconclusive");
    // Evidence against @x.
    expect(proofVerdict({ ...at, proof: { ok: false, reason: "group", names: [USER] } })).toBe("contradicted");
    expect(proofVerdict({ ...at, proof: { ok: false, reason: "group", names: [] } })).toBe("contradicted");
    expect(proofVerdict({ ...at, proof: { ok: false, reason: "several", names: ["y", "z"] } })).toBe("contradicted");
    expect(proofVerdict({ ...at, proof: { ok: false, reason: "no-header", names: ["y"] } })).toBe("contradicted");
    expect(proofVerdict({ proof, username: USER, threadId: THREAD_ID, path: "/direct/t/1/" })).toBe("moved");
  });
  it("checks the Hospeda account before clicking «Enviar mensaje» (L5)", async () => {
    const page = mountProfile();
    expect(await open({ account: () => "mismatch" })).toEqual({ ok: false, reason: "other-account" });
    expect(await open({ account: () => "unknown" })).toEqual({ ok: false, reason: "account-unknown" });
    expect(page.clicks()).toBe(0); expect(location.pathname).toBe(PROFILE_PATH);
    expect(await open({ account: okAccount })).toEqual({ ok: true, threadId: THREAD_ID }); page.cleanup();
  });
});

describe("instagram notice (spec 94 §2.3, spec 97 §4.6)", () => {
  it("has a Spanish message per failure and turns Ctrl+V into ⌘V on macOS", () => {
    expect(Object.keys(FAILURE_NOTICES).sort()).toEqual(["account-unknown", "composer-busy", "composer-timeout", "floating-no-link", "insert-failed", "navigated-away", "no-button", "other-account", "text-differs", "thread-unproven"]);
    expect(FAILURE_NOTICES["floating-no-link"]).toBe("Instagram abrió un chat flotante. Abrilo en pantalla completa y pego el mensaje.");
    expect(FAILURE_NOTICES["thread-unproven"]).toBe("No pude confirmar con quién es este chat, así que no pegué nada. Pegá el mensaje con Ctrl+V.");
    expect(FAILURE_NOTICES["other-account"]).toBe("Estás con otra cuenta de Instagram. Entrá con la de Hospeda y pegá el mensaje con Ctrl+V.");
    expect(failureNotice({ reason: "thread-contradicted", username: USER })).toBe(`Este chat ya no es de @${USER}. Abrí el perfil y tocá "Enviar mensaje"; el mensaje está copiado.`);
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
  it("adds the profile link only for an Instagram profile URL", () => {
    const host = showNotice({ doc: document, text: "x", tone: "warning", link: { text: "Abrir el perfil", href: `https://www.instagram.com/${USER}/` } });
    expect(host.shadowRoot!.querySelector("a")!.getAttribute("href")).toBe(`https://www.instagram.com/${USER}/`);
    expect(showNotice({ doc: document, text: "x", tone: "warning", link: { text: "x", href: "javascript:alert(1)" } }).shadowRoot!.querySelector("a")).toBeNull();
  });
});
