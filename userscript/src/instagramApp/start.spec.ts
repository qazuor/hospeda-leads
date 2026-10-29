import profileEs from "../../fixtures/instagram-profile-es.html?raw";
import threadEs from "../../fixtures/instagram-thread-header-es.html?raw";
import threadGroup from "../../fixtures/instagram-thread-group-es.html?raw";
import miniChatExpand from "../../fixtures/instagram-mini-chat-expand-es.html?raw";
import type { InstagramContextResponse, InstagramMatch, StatusResponse } from "../api";
import { ApiError } from "../api";
import { findMessageButton } from "../instagram/finders";
import { NOTICE_ID, PASTED_NOTICE } from "../instagram/notice";
import type { InstagramApi } from "./client";
import type { InstagramStore, PanelTheme } from "./storage";
import { PANEL_ID } from "./panel";
import { startInstagramApp, type HandoffOutcome, type InstagramApp } from "./start";

const USER = "cabanas_del_rio", THREAD = "17848251833510164", CHAT = `/direct/t/${THREAD}/`, NONCE = "0123456789abcdef0123456789abcdef", TEXT = "Hola, soy de Hospeda.";
const status = (instagramAccount: string | null = "hospeda.com.ar"): StatusResponse => ({ minVersion: "1.5.0", latestVersion: "1.6.0", user: { email: "ana@hospeda.test", displayName: "Ana" }, instagramAccount });
const match: InstagramMatch = { accountId: "7", code: "H7", name: "Cabañas del Río", city: "Colón", status: "contacted", statusLabel: "Contactado", assignedUserName: "Ana", doNotContact: false, restrictionActive: false, archived: false, canContact: true, leads: [], url: "https://crm.test/accounts/7" };
const contextOf = (username: string, matches: InstagramMatch[] = [match], threadId: string | null = null): InstagramContextResponse => ({ ...status(), instagramAccount: "hospeda.com.ar", hiddenMatches: 0, matches, instagram: { username, threadId } });
const threadFor = (user: string, html = threadEs) => html.split("qaz.uor").join(user);
const lexical = () => { for (const composer of document.querySelectorAll<HTMLElement>('[contenteditable="true"]')) composer.addEventListener("paste", event => { event.preventDefault(); composer.textContent = (event as ClipboardEvent).clipboardData?.getData("text/plain") ?? ""; }); };
/** The chat page with every profile label removed: the pane names only `user`, without a labelled header (real ambiguity). */
const unlabelled = (user: string) => threadFor(user).replace(/ aria-label="(?:Abrir la página del perfil de|Open the profile page of) [^"]*"/g, "");
/** Instagram's navigation with the Hospeda account, present on profile pages too. */
const NAV = `<div class="nav"><a href="/hospeda.com.ar/" role="link"><img alt="Foto del perfil de hospeda.com.ar" src=""><span>Perfil</span></a></div>`;
const composerText = () => document.getElementById("page-composer")?.textContent ?? "";

function storeOf(values: { token?: string; handoff?: unknown } = {}) {
  const data: Record<string, unknown> = { token: values.token ?? "hcu_secret", handoff: values.handoff ?? null, open: true, theme: "auto" };
  const reads: string[] = [];
  const store: InstagramStore = {
    token: () => { reads.push("token"); return String(data.token); },
    handoff: { read: () => { reads.push("handoff"); return data.handoff; }, clear: ({ nonce }) => { const current = data.handoff as { nonce?: string } | null; if (current?.nonce === nonce) data.handoff = null; } },
    isOpen: () => data.open === true, setOpen: open => { data.open = open; }, theme: () => data.theme as PanelTheme, setTheme: theme => { data.theme = theme; },
  };
  return { store, data, reads };
}
function apiOf(over: Partial<InstagramApi> = {}) {
  const api: InstagramApi = { fetchStatus: vi.fn(async () => status()), fetchContext: vi.fn(async (username: string) => contextOf(username)), reportThread: vi.fn(async () => ({})), reportThreadStale: vi.fn(async () => ({})), fetchTemplates: vi.fn(), prepare: vi.fn(), dispatch: vi.fn(), markNotSent: vi.fn(), ...over };
  return api;
}
const flow = { intervalMs: 5, settle: () => Promise.resolve(), buttonTimeoutMs: 150, chatTimeoutMs: 150, proofTimeoutMs: 120, composerTimeoutMs: 120, contradictionMs: 20 };
let app: InstagramApp | null = null;
function start(store: InstagramStore, api: InstagramApi, results: HandoffOutcome[] = [], trusted: (event: Event) => boolean = () => true) {
  app = startInstagramApp({ store, api, base: "https://crm.test", version: "1.6.0", pollMs: 60_000, handoffWaitMs: 50, flow, trusted, onResult: result => results.push(result) });
  return app;
}
const handoff = (over: Record<string, unknown> = {}) => ({ nonce: NONCE, username: USER, expiresAt: Date.now() + 60_000, text: TEXT, ...over });
const panelText = () => document.getElementById(PANEL_ID)?.shadowRoot?.textContent ?? "";
const noticeText = () => document.getElementById(NOTICE_ID)?.shadowRoot?.textContent ?? "";
afterEach(() => { app?.stop(); app = null; document.body.innerHTML = ""; history.replaceState(null, "", "/"); vi.restoreAllMocks(); });

describe("Instagram app: the CRM handoff on the chat page (spec 97 §4.2)", () => {
  it("known thread: proves the chat, checks the account and pastes once; nothing is sent", async () => {
    // Arrange
    history.replaceState(null, "", `${CHAT}#hospeda=${NONCE}`); document.body.innerHTML = threadFor(USER); lexical();
    const { store, data } = storeOf({ handoff: handoff({ threadId: THREAD }) }), api = apiOf(), results: HandoffOutcome[] = [];
    // Act
    start(store, api, results);
    // Assert
    await vi.waitFor(() => expect(results).toEqual([{ ok: true, proof: "header" }]));
    expect(composerText()).toBe(TEXT); expect(location.hash).toBe(""); expect(data.handoff).toBeNull(); expect(noticeText()).toContain(PASTED_NOTICE);
  });
  it("the header proves somebody else: no paste, the stored thread is reported stale, the notice links the profile", async () => {
    history.replaceState(null, "", `${CHAT}#hospeda=${NONCE}`); document.body.innerHTML = threadFor("otra.persona"); lexical();
    const { store } = storeOf({ handoff: handoff({ threadId: THREAD }) }), api = apiOf(), results: HandoffOutcome[] = [];
    start(store, api, results);
    await vi.waitFor(() => expect(results).toEqual([{ ok: false, reason: "thread-contradicted", composer: null }]));
    expect(composerText()).toBe(""); expect(api.reportThreadStale).toHaveBeenCalledWith({ username: USER, threadId: THREAD });
    expect(noticeText()).toContain(`Este chat ya no es de @${USER}`);
    expect(document.getElementById(NOTICE_ID)!.shadowRoot!.querySelector("a")!.getAttribute("href")).toBe(`https://www.instagram.com/${USER}/`);
  });
  it("a really ambiguous proof asks the seller; «Sí, es este chat» pastes, then stores proof:'seller' (decision 12.1)", async () => {
    history.replaceState(null, "", `${CHAT}#hospeda=${NONCE}`); document.body.innerHTML = unlabelled(USER); lexical();
    const { store } = storeOf({ handoff: handoff({ threadId: THREAD }) }), api = apiOf(), results: HandoffOutcome[] = [];
    start(store, api, results);
    await vi.waitFor(() => expect(panelText()).toContain(`¿Este chat es con @${USER}?`));
    expect(composerText()).toBe("");
    [...document.getElementById(PANEL_ID)!.shadowRoot!.querySelectorAll("button")].find(b => b.textContent === "Sí, es este chat · pegar")!.click();
    await vi.waitFor(() => expect(composerText()).toBe(TEXT));
    await vi.waitFor(() => expect(api.reportThread).toHaveBeenCalledWith({ username: USER, threadId: THREAD, proof: "seller" }));
    expect(results.at(-1)).toEqual({ ok: true, proof: "seller" });
  });
  it("a group chat is refused: no confirmation offered, nothing pasted or stored, the stored thread is reported stale (H1)", async () => {
    // Arrange: the CRM's stored thread now shows a group with @x in it.
    history.replaceState(null, "", `${CHAT}#hospeda=${NONCE}`); document.body.innerHTML = threadGroup.split("qaz.uor").join(USER); lexical();
    const { store } = storeOf({ handoff: handoff({ threadId: THREAD }) }), api = apiOf(), results: HandoffOutcome[] = [];
    // Act
    start(store, api, results);
    // Assert
    await vi.waitFor(() => expect(results).toEqual([{ ok: false, reason: "thread-contradicted", composer: null }]));
    expect(panelText()).not.toContain("¿Este chat es con"); expect(composerText()).toBe("");
    expect(api.reportThread).not.toHaveBeenCalledWith(expect.objectContaining({ proof: "seller" }));
    expect(api.reportThreadStale).toHaveBeenCalledWith({ username: USER, threadId: THREAD });
  });
  it("a chat that names only somebody else without a label is refused, never offered for confirmation (H1)", async () => {
    history.replaceState(null, "", `${CHAT}#hospeda=${NONCE}`); document.body.innerHTML = unlabelled("otra.persona"); lexical();
    const { store } = storeOf({ handoff: handoff({ threadId: THREAD }) }), results: HandoffOutcome[] = [];
    start(store, apiOf(), results);
    await vi.waitFor(() => expect(results).toEqual([{ ok: false, reason: "thread-contradicted", composer: null }]));
    expect(panelText()).not.toContain("¿Este chat es con"); expect(composerText()).toBe("");
  });
  it("a stored thread that lands elsewhere (inbox redirect, another chat) is reported stale (M3)", async () => {
    history.replaceState(null, "", `/direct/t/999/#hospeda=${NONCE}`); document.body.innerHTML = threadFor(USER); lexical();
    const { store } = storeOf({ handoff: handoff({ threadId: THREAD }) }), api = apiOf(), results: HandoffOutcome[] = [];
    start(store, api, results);
    await vi.waitFor(() => expect(results).toEqual([{ ok: false, reason: "unconfirmed" }]));
    expect(api.reportThreadStale).toHaveBeenCalledWith({ username: USER, threadId: THREAD }); expect(composerText()).toBe("");
  });
  it("an expired or foreign handoff never reports anything stale", async () => {
    history.replaceState(null, "", `/direct/t/999/#hospeda=${NONCE}`); document.body.innerHTML = threadFor(USER);
    const { store } = storeOf({ handoff: handoff({ threadId: THREAD, expiresAt: Date.now() - 1 }) }), api = apiOf(), results: HandoffOutcome[] = [];
    start(store, api, results);
    await vi.waitFor(() => expect(results).toEqual([{ ok: false, reason: "unconfirmed" }])); expect(api.reportThreadStale).not.toHaveBeenCalled();
  });
  it("a synthetic click on «Sí, es este chat» or «No es este chat» does nothing", async () => {
    history.replaceState(null, "", `${CHAT}#hospeda=${NONCE}`); document.body.innerHTML = unlabelled(USER); lexical();
    const { store } = storeOf({ handoff: handoff({ threadId: THREAD }) }), api = apiOf();
    start(store, api, [], event => event.isTrusted);
    await vi.waitFor(() => expect(panelText()).toContain("¿Este chat es con"));
    [...document.getElementById(PANEL_ID)!.shadowRoot!.querySelectorAll("button")].find(b => b.textContent === "Sí, es este chat · pegar")!.click();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(composerText()).toBe(""); expect(api.reportThread).not.toHaveBeenCalledWith(expect.objectContaining({ proof: "seller" }));
    [...document.getElementById(PANEL_ID)!.shadowRoot!.querySelectorAll("button")].find(b => b.textContent === "No es este chat")!.click();
    expect(panelText()).toContain("¿Este chat es con");
  });
  it("another Instagram account: nothing is pasted and nothing is reported", async () => {
    history.replaceState(null, "", `${CHAT}#hospeda=${NONCE}`); document.body.innerHTML = threadFor(USER).split("hospeda.com.ar").join("personal.cuenta"); lexical();
    const { store } = storeOf({ handoff: handoff({ threadId: THREAD }) }), api = apiOf(), results: HandoffOutcome[] = [];
    start(store, api, results);
    await vi.waitFor(() => expect(results).toEqual([{ ok: false, reason: "other-account", composer: null }]));
    await app!.tick(); expect(composerText()).toBe(""); expect(api.reportThread).not.toHaveBeenCalled();
    expect(panelText()).toContain("Estás con la cuenta @personal.cuenta.");
  });
  it("a marker for another thread, or without a valid handoff, only gets the neutral notice", async () => {
    history.replaceState(null, "", `${CHAT}#hospeda=${NONCE}`); document.body.innerHTML = threadFor(USER); lexical();
    const { store } = storeOf({ handoff: handoff({ threadId: "999" }) }), results: HandoffOutcome[] = [];
    start(store, apiOf(), results);
    await vi.waitFor(() => expect(results).toEqual([{ ok: false, reason: "unconfirmed" }])); expect(composerText()).toBe("");
  });
});

describe("Instagram app: unknown thread from the profile (spec 97 §4.2, decision 12.2)", () => {
  function mountProfile({ expand = true }: { expand?: boolean } = {}) {
    history.replaceState(null, "", `/${USER}/#hospeda=${NONCE}`); document.body.innerHTML = NAV + profileEs;
    findMessageButton({ doc: document })!.addEventListener("click", () => {
      document.body.insertAdjacentHTML("beforeend", expand ? miniChatExpand : miniChatExpand.replace('aria-label="Expandir"', 'aria-label="Opciones"'));
      document.getElementById("expand")!.addEventListener("click", () => { history.pushState(null, "", CHAT); document.body.innerHTML = threadFor(USER); lexical(); });
    });
  }
  it("clicks «Enviar mensaje», then the floating chat's «Expandir», proves the chat page and pastes", async () => {
    mountProfile(); const { store } = storeOf({ handoff: handoff() }), results: HandoffOutcome[] = [];
    start(store, apiOf(), results);
    await vi.waitFor(() => expect(results).toEqual([{ ok: true, proof: "header" }]));
    expect(location.pathname).toBe(CHAT); expect(composerText()).toBe(TEXT);
  });
  it("without «Expandir» keeps the handoff in memory and pastes when a proven chat page for that username shows up", async () => {
    mountProfile({ expand: false }); const { store } = storeOf({ handoff: handoff() }), results: HandoffOutcome[] = [];
    start(store, apiOf(), results);
    await vi.waitFor(() => expect(results).toEqual([{ ok: false, reason: "floating-no-link" }]));
    expect(noticeText()).toContain("Instagram abrió un chat flotante.");
    // The seller expands it by hand.
    history.pushState(null, "", CHAT); document.body.innerHTML = threadFor(USER); lexical(); await app!.tick();
    await vi.waitFor(() => expect(composerText()).toBe(TEXT));
  });
  it("a reload loses the in-memory handoff: a new page never pastes", async () => {
    history.replaceState(null, "", CHAT); document.body.innerHTML = threadFor(USER); lexical();
    const { store } = storeOf({ handoff: handoff() });
    start(store, apiOf()); await app!.tick(); await new Promise(resolve => setTimeout(resolve, 30));
    expect(composerText()).toBe("");
  });
});

describe("Instagram app: panel and learning (spec 97 §4.3–4.4, decision 12.3)", () => {
  it("on a proven chat with a CRM business, shows it and reports the thread once", async () => {
    history.replaceState(null, "", CHAT); document.body.innerHTML = threadFor(USER);
    const api = apiOf(); start(storeOf().store, api);
    await vi.waitFor(() => expect(panelText()).toContain("Cabañas del Río"));
    expect(api.fetchContext).toHaveBeenCalledWith(USER);
    await vi.waitFor(() => expect(api.reportThread).toHaveBeenCalledExactlyOnceWith({ username: USER, threadId: THREAD, proof: "header" }));
    await app!.tick(); await app!.tick(); expect(api.reportThread).toHaveBeenCalledOnce();
  });
  it("does not report an unknown username, nor a thread the CRM already has", async () => {
    history.replaceState(null, "", CHAT); document.body.innerHTML = threadFor(USER);
    const api = apiOf({ fetchContext: vi.fn(async (username: string) => contextOf(username, [])) }); start(storeOf().store, api);
    await vi.waitFor(() => expect(panelText()).toContain(`No encontré un negocio con @${USER} en el CRM.`)); expect(api.reportThread).not.toHaveBeenCalled();
    app!.stop(); document.body.innerHTML = threadFor(USER);
    const known = apiOf({ fetchContext: vi.fn(async (username: string) => contextOf(username, [match], THREAD)) }); start(storeOf().store, known);
    await vi.waitFor(() => expect(panelText()).toContain("Cabañas del Río")); expect(known.reportThread).not.toHaveBeenCalled();
  });
  it("without a configured Hospeda account learns nothing and says so", async () => {
    history.replaceState(null, "", CHAT); document.body.innerHTML = threadFor(USER);
    const api = apiOf({ fetchStatus: vi.fn(async () => status(null)) }); start(storeOf().store, api);
    await vi.waitFor(() => expect(panelText()).toContain("Falta configurar la cuenta de Instagram de Hospeda en el CRM."));
    expect(api.reportThread).not.toHaveBeenCalled();
  });
  it("a rejected token and an outdated script show their launcher labels", async () => {
    history.replaceState(null, "", CHAT); document.body.innerHTML = threadFor(USER);
    start(storeOf().store, apiOf({ fetchStatus: vi.fn(async () => { throw new ApiError("x", 426, "1.6.0"); }) }));
    await vi.waitFor(() => expect(document.getElementById(PANEL_ID)!.shadowRoot!.querySelector(".launcher")!.textContent).toContain("Actualizá el script"));
  });
  it("never shows the panel off a chat page, and removes it when the seller leaves the chat", async () => {
    history.replaceState(null, "", CHAT); document.body.innerHTML = threadFor(USER);
    start(storeOf().store, apiOf()); await vi.waitFor(() => expect(document.getElementById(PANEL_ID)).not.toBeNull());
    history.pushState(null, "", `/${USER}/`); await app!.tick(); expect(document.getElementById(PANEL_ID)).toBeNull();
  });
  it("without a token makes no request and shows how to connect from the CRM", async () => {
    history.replaceState(null, "", CHAT); document.body.innerHTML = threadFor(USER);
    const api = apiOf(); start(storeOf({ token: "" }).store, api); await app!.tick();
    expect(api.fetchStatus).not.toHaveBeenCalled(); expect(api.fetchContext).not.toHaveBeenCalled();
    expect(panelText()).toContain("Conectá el script desde el CRM");
  });
});
