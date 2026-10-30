import type { InstagramMatch, InstagramTemplatesResponse, PreparedTemplate, StatusResponse } from "../api";
import { PANEL_ID, renderPanel, type PanelActions } from "./panel";
import { initialState, type AppState } from "./state";
import { ALREADY_CONFIRMED, CHAT_CHANGED, RECIPIENT_MISMATCH, COMPOSER_BUSY, NOT_SENT_NOTE, initialInstagramChoice, openInstagramCompose, type ComposeContext } from "./compose";
import type { InstagramApi } from "./client";

const status: StatusResponse = { minVersion: "1.5.0", latestVersion: "1.6.0", user: { email: "ana@hospeda.test", displayName: "Ana" }, instagramAccount: "hospeda.com.ar" };
const matchOf = (over: Partial<InstagramMatch> = {}): InstagramMatch => ({ accountId: "7", code: "H7", name: "Cabañas del Río", city: "Colón", status: "contacted", statusLabel: "Contactado", assignedUserName: "Ana", doNotContact: false, restrictionActive: false, archived: false, canContact: true, leads: [{ id: "1", name: "Alojamiento", stage: "Contactado" }], url: "https://crm.test/accounts/7", ...over });
const ready = (over: Partial<AppState> = {}, matches = [matchOf()], hiddenMatches = 0): AppState => ({ ...initialState({ token: true }), status: { kind: "ok", value: status }, loggedIn: "hospeda.com.ar", threadId: "1", proof: { ok: true, threadId: "1", username: "cabanas_del_rio" }, context: { username: "cabanas_del_rio", kind: "ok", value: { ...status, instagramAccount: "hospeda.com.ar", hiddenMatches, matches, instagram: { username: "cabanas_del_rio", threadId: null } } }, ...over });
const actionsOf = (over: Partial<PanelActions> = {}): PanelActions => ({ trusted: () => true, toggle: vi.fn(), view: vi.fn(), select: vi.fn(), retry: vi.fn(), confirmChat: vi.fn(), rejectChat: vi.fn(), compose: vi.fn(), setTheme: vi.fn(), setBadges: vi.fn(), ...over });
const render = (state: AppState, actions = actionsOf(), open = true) => renderPanel({ doc: document, state, open, dark: false, theme: "auto", base: "https://crm.test", version: "1.6.0", actions });
const root = () => document.getElementById(PANEL_ID)!.shadowRoot!;
const text = () => root().textContent ?? "";
const buttonNamed = (name: string) => [...root().querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === name)!;
const originalExec = document.execCommand;
afterEach(() => { document.body.innerHTML = ""; document.execCommand = originalExec; vi.restoreAllMocks(); });

describe("Instagram panel views (spec 97 §4.3)", () => {
  it("shows the recognized business: code, city, name, chips, verified chat and the two actions", () => {
    render(ready());
    expect(root().querySelector(".launcher")!.textContent).toContain("H7");
    for (const part of ["H7 · Colón", "Cabañas del Río", "Responsable: Ana", "Contactado", "1 gestión abierta", "@cabanas_del_rio · chat verificado", "Mandar un mensaje", "Abrir en CRM"]) expect(text()).toContain(part);
    expect(buttonNamed("Mandar un mensaje").disabled).toBe(false);
  });
  it("«No contactar» shows the note and disables «Mandar un mensaje» with the CRM's reason", () => {
    render(ready({}, [matchOf({ doNotContact: true })]));
    expect(text()).toContain("Este negocio pidió no ser contactado. No le escribas desde Instagram.");
    expect(buttonNamed("Mandar un mensaje").disabled).toBe(true); expect(buttonNamed("Mandar un mensaje").title).toBe("El negocio tiene No contactar activo.");
  });
  it("covers none, hidden, several, unproven, another account and no configured account", () => {
    render(ready({}, [])); expect(text()).toContain("No encontré un negocio con @cabanas_del_rio en el CRM."); expect(text()).toContain("Buscar en Negocios del CRM");
    render(ready({}, [], 2)); expect(text()).toContain("Este Instagram está en un negocio que no podés ver. Consultá a un administrador antes de escribirle.");
    const select = vi.fn(); render(ready({}, [matchOf(), matchOf({ accountId: "8", code: "H8" })]), actionsOf({ select }));
    expect(text()).toContain("Hay varios negocios con este Instagram");
    const picker = root().querySelector("select")!; picker.value = "8"; picker.dispatchEvent(new Event("change")); expect(select).toHaveBeenCalledWith("8");
    render(ready({ proof: { ok: false, reason: "several", names: [] } })); expect(text()).toContain("No pude confirmar con quién es este chat.");
    render(ready({ loggedIn: "personal.cuenta" })); expect(text()).toContain("Estás con la cuenta @personal.cuenta. Entrá con la cuenta de Instagram de Hospeda para usar el script.");
    render(ready({ status: { kind: "ok", value: { ...status, instagramAccount: null } } })); expect(text()).toContain("Falta configurar la cuenta de Instagram de Hospeda en el CRM.");
  });
  it("asks the seller to confirm an unproven chat from a CRM handoff (decision 12.1)", () => {
    const confirmChat = vi.fn(), rejectChat = vi.fn();
    render(ready({ proof: { ok: false, reason: "no-header", names: [] }, confirm: { username: "cabanas_del_rio", threadId: "1" } }), actionsOf({ confirmChat, rejectChat }));
    expect(text()).toContain("¿Este chat es con @cabanas_del_rio?");
    buttonNamed("Sí, es este chat · pegar").click(); buttonNamed("No es este chat").click();
    expect(confirmChat).toHaveBeenCalledOnce(); expect(rejectChat).toHaveBeenCalledOnce();
  });
  it("has no token field on Instagram: it sends the seller to the CRM to connect", () => {
    render(ready({ token: false })); expect(text()).toContain("Conectá el script desde el CRM: User script → Conectar este navegador.");
    expect(root().querySelectorAll("input")).toHaveLength(0);
    expect(root().querySelector<HTMLAnchorElement>("a")!.href).toBe("https://crm.test/userscript");
    // Settings only has the badges switch (a checkbox), never a text field for a token.
    render(ready({ token: false, view: "settings" })); expect(root().querySelectorAll('input:not([type="checkbox"]), textarea')).toHaveLength(0); expect(text()).toContain("CONEXIÓN");
  });
  it("Ajustes shows the connection, the version and a newer script", () => {
    render(ready({ view: "settings" })); expect(text()).toContain("Conectado como Ana"); expect(text()).toContain("Versión 1.6.0 · al día");
    render(ready({ view: "settings", status: { kind: "ok", value: { ...status, latestVersion: "1.7.0" } } })); expect(text()).toContain("Hay una versión nueva del script (1.7.0)");
  });
  it("ignores synthetic clicks from the page on actions that call the CRM (isTrusted)", () => {
    const compose = vi.fn(), confirmChat = vi.fn();
    render(ready(), actionsOf({ trusted: event => event.isTrusted, compose }));
    buttonNamed("Mandar un mensaje").click(); expect(compose).not.toHaveBeenCalled();
    render(ready({ proof: { ok: false, reason: "no-header", names: [] }, confirm: { username: "cabanas_del_rio", threadId: "1" } }), actionsOf({ trusted: event => event.isTrusted, confirmChat }));
    buttonNamed("Sí, es este chat · pegar").click(); expect(confirmChat).not.toHaveBeenCalled();
  });
  it("ignores a synthetic business change and a synthetic «No es este chat» (L3)", () => {
    const select = vi.fn(), rejectChat = vi.fn();
    render(ready({}, [matchOf(), matchOf({ accountId: "8", code: "H8" })]), actionsOf({ trusted: event => event.isTrusted, select }));
    const picker = root().querySelector("select")!; picker.value = "8"; picker.dispatchEvent(new Event("change")); expect(select).not.toHaveBeenCalled();
    render(ready({ proof: { ok: false, reason: "no-header", names: [] }, confirm: { username: "cabanas_del_rio", threadId: "1" } }), actionsOf({ trusted: event => event.isTrusted, rejectChat }));
    buttonNamed("No es este chat").click(); expect(rejectChat).not.toHaveBeenCalled();
  });
  it("Ajustes has the conversation-list badges switch (spec 97 §15)", () => {
    const setBadges = vi.fn(); renderPanel({ doc: document, state: ready({ view: "settings" }), open: true, dark: false, theme: "auto", badges: true, base: "https://crm.test", version: "1.6.0", actions: actionsOf({ setBadges }) });
    const check = root().querySelector<HTMLInputElement>('input[type="checkbox"]')!; expect(check.checked).toBe(true); expect(text()).toContain("Mostrar insignias en la lista de chats");
    check.click(); expect(setBadges).toHaveBeenCalledWith(false);
  });
  it("keeps the token out of the page", () => {
    render(ready()); expect(document.documentElement.outerHTML).not.toContain("hcu_");
  });
});

const prepared: PreparedTemplate = { messageId: "m-1", revision: 2, body: "Hola Cabañas", recipient: "@cabanas_del_rio", recipientName: "Cabañas del Río", unresolved: [] };
const templates = (over: Partial<InstagramTemplatesResponse> = {}): InstagramTemplatesResponse => ({ leads: [{ id: "1", name: "Alojamiento", type: "main", stage: "Contactado", templates: [{ id: "t1", name: "Presentación", recommended: true, body: "Hola {{nombre}}" }] }], general: { defaultPurpose: "first_contact", purposes: [{ value: "first_contact", label: "Presentación / primer contacto", templates: [{ id: "g1", name: "General", recommended: true, body: "Hola" }] }, { value: "other", label: "Otro", templates: [{ id: "g2", name: "Otro", recommended: true, body: "Hola" }] }] }, blocked: null, username: "cabanas_del_rio", ...over });

describe("Instagram «Mandar un mensaje» (spec 97 §4.3)", () => {
  function setup(over: Partial<ComposeContext> = {}, data = templates()) {
    document.body.innerHTML = `<div class="panel"><section class="card" id="card"></section></div><div id="composer" contenteditable="true"></div>`;
    const composer = document.getElementById("composer")!, order: string[] = [];
    composer.addEventListener("paste", event => { order.push("paste"); event.preventDefault(); composer.textContent = (event as ClipboardEvent).clipboardData?.getData("text/plain") ?? ""; });
    const api: InstagramApi = { fetchStatus: vi.fn(), fetchContext: vi.fn(), reportThread: vi.fn(), reportThreadStale: vi.fn(), fetchTemplates: vi.fn(async () => data), prepare: vi.fn(async () => prepared), dispatch: vi.fn(async () => { order.push("dispatch"); return { messageId: "m-1", status: "instagram_opened" }; }), markNotSent: vi.fn(async () => ({})), fetchThreads: vi.fn(async () => ({ threads: [] })) };
    const checkChat = vi.fn(() => { order.push("check"); return null as string | null; }), back = vi.fn();
    const card = document.getElementById("card")!;
    openInstagramCompose(card, { doc: document, api, match: matchOf(), username: "cabanas_del_rio", trusted: () => true, checkChat, composer: () => composer, back, header: title => { const h = document.createElement("h2"); h.textContent = title; return h; }, settle: () => Promise.resolve(), newId: () => "00000000-0000-4000-8000-000000000001", ...over });
    const named = (name: string) => [...card.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === name)!;
    return { api, card, composer, order, checkChat, back, named };
  }
  it("starts on the first management with its recommended template and prepares it for the business username", async () => {
    const { api, card } = setup();
    await vi.waitFor(() => expect(card.textContent).toContain("Para @cabanas_del_rio"));
    expect(api.prepare).toHaveBeenCalledWith({ id: "00000000-0000-4000-8000-000000000001", accountId: "7", leadId: "1", templateId: "t1" });
    expect(card.textContent).toContain(NOT_SENT_NOTE); expect(card.textContent).toContain("MODELOS PARA ESTA GESTIÓN");
  });
  it("pastes in order: re-prove, dispatch once, re-prove, then the composer; never sends", async () => {
    const { api, card, composer, order, named } = setup();
    await vi.waitFor(() => expect(named("Pegar en el chat").disabled).toBe(false));
    named("Pegar en el chat").click();
    await vi.waitFor(() => expect(card.textContent).toContain("Listo, está en el chat"));
    expect(order).toEqual(["check", "dispatch", "check", "paste"]); expect(composer.textContent).toBe("Hola Cabañas");
    expect(api.dispatch).toHaveBeenCalledExactlyOnceWith({ id: "m-1", revision: 2 });
    expect(card.textContent).toContain("Revisalo y envialo vos. Si al final no lo mandás, avisalo acá.");
    named("No lo voy a enviar").click(); await vi.waitFor(() => expect(api.markNotSent).toHaveBeenCalledWith("m-1"));
  });
  it("refuses a composer that already has text, before recording anything (D3)", async () => {
    const { api, card, composer, named } = setup(); composer.textContent = "borrador";
    await vi.waitFor(() => expect(named("Pegar en el chat").disabled).toBe(false));
    named("Pegar en el chat").click();
    await vi.waitFor(() => expect(card.textContent).toContain(COMPOSER_BUSY));
    expect(api.dispatch).not.toHaveBeenCalled(); expect(composer.textContent).toBe("borrador");
  });
  it("stops when the chat changed during the requests; the attempt stays opened (no «no enviado»)", async () => {
    let calls = 0; const { api, card, named } = setup({ checkChat: () => (calls++ ? CHAT_CHANGED : null) });
    await vi.waitFor(() => expect(named("Pegar en el chat").disabled).toBe(false));
    named("Pegar en el chat").click();
    await vi.waitFor(() => expect(card.textContent).toContain(CHAT_CHANGED));
    expect(api.dispatch).toHaveBeenCalledOnce(); expect(api.markNotSent).not.toHaveBeenCalled();
  });
  it("offers copy and retry when the insertion fails, keeping the attempt", async () => {
    // Arrange: an editor that ignores both the paste event and insertText.
    const dead = document.createElement("div"); dead.contentEditable = "true"; document.execCommand = () => false;
    const ctx = setup({ composer: () => dead }); document.body.append(dead);
    await vi.waitFor(() => expect(ctx.named("Pegar en el chat").disabled).toBe(false));
    // Act
    ctx.named("Pegar en el chat").click();
    // Assert
    await vi.waitFor(() => expect(ctx.card.textContent).toContain("No pude escribir en la caja de Instagram. Copialo y pegalo con Ctrl+V."));
    expect(ctx.named("Copiar texto")).toBeTruthy(); expect(ctx.named("Reintentar")).toBeTruthy(); expect(ctx.api.markNotSent).not.toHaveBeenCalled();
  });
  it("refuses a draft addressed to another Instagram user, before recording anything (L1)", async () => {
    const ctx = setup(); (ctx.api.prepare as ReturnType<typeof vi.fn>).mockResolvedValue({ ...prepared, recipient: "@otro_negocio" });
    await vi.waitFor(() => expect(ctx.named("Pegar en el chat").disabled).toBe(false));
    ctx.named("Pegar en el chat").click();
    await vi.waitFor(() => expect(ctx.card.textContent).toContain(RECIPIENT_MISMATCH));
    expect(ctx.api.dispatch).not.toHaveBeenCalled(); expect(ctx.composer.textContent).toBe("");
  });
  it("does not paste a message Instagram already confirmed", async () => {
    const ctx = setup(); (ctx.api.dispatch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ messageId: "m-1", status: "manual_sent", alreadyConfirmed: true });
    await vi.waitFor(() => expect(ctx.named("Pegar en el chat").disabled).toBe(false));
    ctx.named("Pegar en el chat").click();
    await vi.waitFor(() => expect(ctx.card.textContent).toContain(ALREADY_CONFIRMED)); expect(ctx.composer.textContent).toBe("");
  });
  it("without managements uses «Sin gestión» with the default purpose (decision 12.6); «Otro» waits for its aclaración", async () => {
    const data = templates({ leads: [] });
    expect(initialInstagramChoice(data)).toEqual({ leadId: "", purpose: "first_contact", otherPurpose: "", templateId: "g1" });
    const ctx = setup({}, data);
    await vi.waitFor(() => expect(ctx.api.prepare).toHaveBeenCalledWith({ id: "00000000-0000-4000-8000-000000000001", accountId: "7", leadId: null, templateId: "g1", purpose: "first_contact", otherPurpose: null }));
    const purpose = [...ctx.card.querySelectorAll("select")].find(s => [...s.options].some(o => o.value === "other"))!;
    purpose.value = "other"; purpose.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(ctx.card.textContent).toContain("Aclaración del propósito"));
    expect(ctx.api.prepare).toHaveBeenCalledTimes(1);
  });
  it("shows the CRM's block reason and prepares nothing", async () => {
    const ctx = setup({}, templates({ leads: [], general: null, blocked: "El negocio tiene No contactar activo." }));
    await vi.waitFor(() => expect(ctx.card.textContent).toContain("El negocio tiene No contactar activo."));
    expect(ctx.api.prepare).not.toHaveBeenCalled();
  });
  it("ignores synthetic clicks on «Pegar en el chat» (isTrusted)", async () => {
    const ctx = setup({ trusted: event => event.isTrusted });
    await vi.waitFor(() => expect(ctx.card.textContent).toContain("Pegar en el chat"));
    // The initial prepare runs from the trusted «Mandar un mensaje» that opened the view; the page cannot paste.
    ctx.named("Pegar en el chat").click(); await Promise.resolve();
    expect(ctx.api.dispatch).not.toHaveBeenCalled(); expect(ctx.composer.textContent).toBe("");
  });
});
