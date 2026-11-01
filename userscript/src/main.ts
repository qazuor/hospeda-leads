import { fetchContext, fetchStatus, fetchAutoRegistrations, saveAutoRegisterPreference, type ContextResponse, type Match, type StatusResponse, ApiError } from "./api";
import { parseCode } from "./parse";
import { getAppRoot, getConversationPanel, readChat, redactedSnapshot, type ChatRead } from "./selectors";
import { internalChat, pageHeader } from "./internals";
import { messageFingerprint, RegisterController } from "./register";
import { copyDiagnostic } from "./diagnostic";
import { applyTheme, isAutoOpen, isDark, isEditing, openSettings, renderBanner, setPanelOpen, type UiOptions } from "./ui";
import { USERSCRIPT_VERSION } from "./version";
import { announceInstalled } from "./announce";
import { watchConnection } from "./connection";
import { listenForToken } from "./tokenBridge";
import { showUpdatePrompt, throttled } from "./updatePrompt";
import { AutoRegisterController, autoEligibility } from "./autoRegister";
import {ChatBadges,badgePreference,toggleBadgePreference} from './badges';
import { siteFor } from "./site";
import { listenForInstagramHandoff } from "./instagramBridge";
import { startInstagramApp } from "./instagramApp/start";
import { gmInstagramStore } from "./instagramApp/storage";
import { instagramApi } from "./instagramApp/client";
import { listenForVisibility } from "./visibility";

const BASE = (import.meta as ImportMeta & { env: { USERSCRIPT_CRM_BASE_URL?: string } }).env.USERSCRIPT_CRM_BASE_URL || "https://crm.hospeda.com.ar";
const TOKEN_KEY = "hospeda-userscript-token", choicesKey = (phone: string | null) => `hospeda-userscript-choice:${phone || "unknown"}`;
let observer: MutationObserver | null = null, timer = 0, lastFingerprint = "", activeChat = "", previewOpen = false;
let autoController:AutoRegisterController|null=null,autoMessage="";
let chatBadges:ChatBadges|null=null,badgeError:string|undefined,badgePane:HTMLElement|null=null;
// Read in start() for WhatsApp only: on Instagram the script reads no WhatsApp value from GM storage (spec 94 §2.4, spec 97 §5.4).
let autoPreference=true;
let autoCount:{accountId:string;value:number;expiresAt:number}|null=null;
const cache = new Map<string, { expiresAt: number; value: ContextResponse }>();
let status: { expiresAt: number; value: StatusResponse } | null = null;
function token(): string { return GM_getValue<string>(TOKEN_KEY, ""); }
function showDiagnostic(text: string): void {
  const host = document.createElement("div"), shadow = host.attachShadow({ mode: "open" }), style = document.createElement("style"), backdrop = document.createElement("div"), panel = document.createElement("div"), area = document.createElement("textarea"), hint = document.createElement("p"), close = document.createElement("button");
  style.textContent = `:host{position:fixed;inset:0;z-index:2147483647;font:16px system-ui;color:#18212f}.backdrop{position:absolute;inset:0;background:#0008;display:grid;place-items:center}.panel{background:white;padding:20px;border-radius:10px;width:min(700px,90vw)}textarea{box-sizing:border-box;width:100%;height:55vh}button{padding:8px 14px}`; backdrop.className = "backdrop"; panel.className = "panel"; area.readOnly = true; area.value = text; hint.textContent = "Copialo con Ctrl+C y mandáselo al equipo"; close.textContent = "Cerrar"; close.addEventListener("click", () => host.remove()); panel.append(area, hint, close); backdrop.append(panel); shadow.append(style, backdrop); document.body.append(host); area.focus(); area.select();
}
function toast(text: string): void { const host = document.createElement("div"), shadow = host.attachShadow({ mode: "open" }), style = document.createElement("style"), message = document.createElement("div"); style.textContent = `:host{position:fixed;right:20px;bottom:144px;z-index:2147483647;font:14px system-ui}.toast{background:#18212f;color:white;padding:10px 14px;border-radius:8px}`; message.className = "toast"; message.textContent = text; shadow.append(style, message); document.body.append(host); window.setTimeout(() => host.remove(), 2400); }
function refresh(): void { cache.clear(); status = null; lastFingerprint = ""; void update(); }
function saveToken(value: string): void { GM_setValue(TOKEN_KEY, value); refresh(); }
function copyChatDiagnostic(): void { void copyDiagnostic(redactedSnapshot(), navigator.clipboard, showDiagnostic, () => toast("Diagnóstico copiado.")); }
function registerMenu(): void {
  GM_registerMenuCommand("Configurar token", () => { openSettings(); lastFingerprint = ""; void update(); });
  GM_registerMenuCommand("Borrar token", () => saveToken(""));
  GM_registerMenuCommand("Copiar diagnóstico del chat", copyChatDiagnostic);
}
async function resolveContext(code: string | null, phone: string | null): Promise<ContextResponse | null> {
  const query = code ? (phone ? { code, phone } : { code }) : phone ? { phone } : null; if (!query || !token()) return null;
  const key = JSON.stringify(query), cached = cache.get(key); if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchContext(BASE, query, token()); cache.set(key, { value, expiresAt: Date.now() + 60_000 }); return value;
}
/** Connection and versions without an open chat, so Ajustes and the update notice work from the start. Failures stay quiet: a chat retries. */
async function resolveStatus(): Promise<{ context: ContextResponse | null; requiredVersion: string | null }> {
  if (!token()) return { context: null, requiredVersion: null };
  try { if (!status || status.expiresAt <= Date.now()) status = { value: await fetchStatus(BASE, token()), expiresAt: Date.now() + 5 * 60_000 }; return { context: { ...status.value, matches: [] }, requiredVersion: null }; }
  catch (cause) { return { context: null, requiredVersion: cause instanceof ApiError && cause.status === 426 ? cause.minVersion || "última" : null }; }
}
const UPDATE_CHECK_MS = 30 * 60_000;
function promptUpdate(latest: string | null | undefined, required: string | null): void { showUpdatePrompt({ installed: USERSCRIPT_VERSION, latest, required, crmBase: BASE, dark: isDark() }); }
/** Asks the CRM for its published version on load and every half hour, so a release reaches the seller without opening the panel. */
async function checkForUpdate(): Promise<void> { status = null; const known = await resolveStatus(); if (known.context || known.requiredVersion) promptUpdate(known.context?.latestVersion, known.requiredVersion); }
/** The open chat. Only when neither the saved name (`· H123`) nor the title gives a phone, WhatsApp's internal state is read for it. */
function currentChat(): ChatRead {
  const chat = readChat(document);
  if (!chat.ok || chat.code || chat.phone) return chat;
  const internal = internalChat(pageHeader());
  if (internal?.group) return { ok: false, reason: "unsupported-group" };
  return internal?.phone ? { ...chat, phone: internal.phone } : chat;
}
function setChoice(phone: string | null, match: Match): void { GM_setValue(choicesKey(phone), match.accountId); }
/** What every render shares: the launcher and its settings work with or without an open chat. */
function baseOptions(): UiOptions {
  return { crmBase: BASE, version: USERSCRIPT_VERSION, onSaveToken: saveToken, onClearToken: () => saveToken(""), onCopyDiagnostic: copyChatDiagnostic, onSelect: () => {}, register: null, context: null, selected: null,badgePreference:badgePreference(),badgeError,onBadgePreference:enabled=>{const pane=enabled?document.querySelector<HTMLElement>('#pane-side'):null;badgePane=pane; if(chatBadges)toggleBadgePreference(enabled,chatBadges,pane);else if(!enabled)document.querySelectorAll('[data-hospeda-badge-host]').forEach(node=>node.remove());lastFingerprint="";void update();} };
}
async function update(): Promise<void> {
  const main = getConversationPanel(), chat = main ? currentChat() : null;
  const nextKey = chat?.ok ? `${chat.title}:${chat.phone || ""}` : "";
  if (isEditing() && nextKey === activeChat) return;
  if (!chat || !chat.ok) {
    const state = !chat ? "none" : chat.reason;
    if (state === lastFingerprint && document.getElementById("hospeda-userscript-banner")) return;
    lastFingerprint = state; activeChat = ""; previewOpen = false;autoController?.stop();autoController=null;autoMessage="";
    const known = await resolveStatus(); if (lastFingerprint !== state || isEditing()) return;
    renderBanner({ ...baseOptions(), ...known, unreadable: state === "unreadable", group: state === "unsupported-group" });
    return;
  }
  const fingerprint = messageFingerprint(chat.title, chat.messages), chatKey = `${chat.title}:${chat.phone || ""}`;
  if (chatKey === activeChat && previewOpen) { lastFingerprint = fingerprint; return; }
  if (fingerprint === lastFingerprint && document.getElementById("hospeda-userscript-banner")) return;
  const changedChat = activeChat !== chatKey; if (changedChat) { autoController?.stop();autoController=null;autoMessage="";previewOpen = false; if (isAutoOpen()) setPanelOpen(true); } activeChat = chatKey; lastFingerprint = fingerprint;
  const code = parseCode(chat.title); let context: ContextResponse | null = null, error: string | undefined, requiredVersion: string | null = null;
  try { context = await resolveContext(code, chat.phone); }
  catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) { cache.clear(); error = "Token inválido o revocado. Conectá uno nuevo desde Ajustes."; }
    else if (cause instanceof ApiError && cause.status === 426) { requiredVersion = cause.minVersion || "última"; error = "Esta versión del script ya no funciona con el CRM."; }
    else { error = "No se pudo consultar el CRM. Reintentando en el próximo cambio."; const existing = document.getElementById("hospeda-userscript-banner"); if (existing && !changedChat) { const status = existing.shadowRoot?.querySelector<HTMLElement>(".body > [aria-live]"); if (status) status.textContent = error; return; } }
  }
  // The lookup is async: by now the seller may be in another chat or typing in Ajustes. A late answer must not paint over either.
  if (activeChat !== chatKey || isEditing()) return;
  // A failed lookup says nothing about versions: keep whatever prompt is showing.
  if (context || requiredVersion) promptUpdate(context?.latestVersion, requiredVersion);
  const matches = context?.matches || [], chosenId = GM_getValue<string>(choicesKey(chat.phone), "");
  const selected = matches.find(match => match.accountId === chosenId) || (matches.length === 1 ? matches[0] : null);
  // The server keeps the seller's preference (it may change from the CRM or another computer).
  if (typeof context?.autoRegister === "boolean" && context.autoRegister !== autoPreference) { autoPreference = context.autoRegister; GM_setValue("hospeda-userscript-auto-register", autoPreference); }
  const auto=autoEligibility(selected,matches,autoPreference);
  const autoTodayCount=autoCount&&autoCount.accountId===selected?.accountId&&autoCount.expiresAt>Date.now()?autoCount.value:0;
  if(auto.active&&selected?.autoRegister?.since&&token()&&!autoController){autoController=new AutoRegisterController(BASE,token(),selected.accountId,selected.autoRegister.since,chatKey,()=>activeChat,message=>{autoMessage=message;lastFingerprint="";void update();},()=>chatBadges?.refreshChat(chat.title,chat.phone));autoController.start();}else if(!auto.active){autoController?.stop();autoController=null;}
  const controller = token() ? new RegisterController(BASE, token()) : null, lastRegister = GM_getValue<string | null>("hospeda-userscript-last-register", null);
  renderBanner({ ...baseOptions(), context, selected, error, requiredVersion, register: controller, title: chat.title, phone: chat.phone,
    isCurrentChat: () => { const current = currentChat(); return current.ok && `${current.title}:${current.phone || ""}` === chatKey; },
    readMessages: () => { const current = currentChat(); return current.ok ? current.messages : []; },
    lastRegistered: lastRegister ? new Date(lastRegister).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : null,
    onPreviewChange: open => { previewOpen = open; if (!open) { lastFingerprint = ""; void update(); } },onRegistered:()=>chatBadges?.refreshChat(chat.title,chat.phone),
    autoStatus: autoMessage||auto.message,autoTodayCount,autoPreference,autoDisabled:selected?.autoRegister?.reason==="global_disabled",onAutoPreference:async enabled=>{const previous=autoPreference;try{if(token())await saveAutoRegisterPreference(BASE,token(),enabled);autoPreference=enabled;GM_setValue("hospeda-userscript-auto-register",enabled);lastFingerprint="";}catch(error){autoPreference=previous;throw error;}}, onSelect: match => { setChoice(chat.phone, match); lastFingerprint = ""; void update(); } });
  if(auto.active&&selected&&token()&&(!autoCount||autoCount.accountId!==selected.accountId||autoCount.expiresAt<=Date.now()))void fetchAutoRegistrations(BASE,token(),selected.accountId).then(({registrations})=>{if(activeChat!==chatKey)return;const today=new Date().toLocaleDateString("en-CA",{timeZone:"America/Argentina/Buenos_Aires"}),count=registrations.filter(item=>new Date(item.sentAt||item.receivedAt||0).toLocaleDateString("en-CA",{timeZone:"America/Argentina/Buenos_Aires"})===today).length;autoCount={accountId:selected!.accountId,value:count,expiresAt:Date.now()+60_000};lastFingerprint="";void update();}).catch(()=>{});
}
function schedule(): void { window.clearTimeout(timer); timer = window.setTimeout(() => { void update(); }, 500); }
/** WhatsApp switches theme by toggling a class on <body>; the system preference covers the moment before it does. */
function watchTheme(): void { new MutationObserver(applyTheme).observe(document.body, { attributes: true, attributeFilter: ["class"] }); matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); }
function start(): void {
  const site = siteFor(location);
  // Instagram (spec 97 §5.3–5.4): the handoff and the chat page's panel. GM only through the Instagram store (token read-only, handoff,
  // panel state) and the CRM only through the allowlisted calls; no WhatsApp module, no page events, no clipboard read.
  if (site === "instagram") { const store = gmInstagramStore(); startInstagramApp({ store, api: instagramApi({ base: BASE, token: store.token }), base: BASE, version: USERSCRIPT_VERSION }); return; }
  // On the CRM's own page the script says it is here, accepts the Instagram handoff from the page and publishes whether its token works
  // (spec 96 §3.1: one status request, only the state and the token owner's email reach the page), and since 1.5.1 takes a new token from
  // «Conectar este navegador». No WhatsApp logic.
  if (site === "crm") { announceInstalled(document); listenForInstagramHandoff(); const connection = watchConnection({ doc: document, readToken: token, fetchStatus: value => fetchStatus(BASE, value) }); listenForToken({ doc: document, verify: async value => { await fetchStatus(BASE, value); return true; }, save: value => GM_setValue(TOKEN_KEY, value), recheck: () => void connection.check() }); return; }
  autoPreference = GM_getValue<boolean>("hospeda-userscript-auto-register", true);
  registerMenu(); watchTheme();
  chatBadges=new ChatBadges(BASE,token, message=>{badgeError=message;lastFingerprint="";void update();},()=>{badgeError="Token inválido o revocado. Conectá uno nuevo desde Ajustes.";lastFingerprint="";void update();},()=>{badgeError="Esta versión del script ya no funciona con el CRM. Actualizá desde el aviso del script.";void checkForUpdate();lastFingerprint="";void update();});
  const badgesRootObserver=new MutationObserver(records=>{if(records.every(record=>[...record.addedNodes,...record.removedNodes].every(node=>node instanceof HTMLElement&&node.hasAttribute('data-hospeda-badge-host'))))return;const pane=document.querySelector<HTMLElement>('#pane-side');if(pane&&pane!==badgePane&&badgePreference()){badgePane=pane;chatBadges?.start(pane);}});badgesRootObserver.observe(document.body,{subtree:true,childList:true});
  // On load, every half hour, and when the seller comes back to the WhatsApp tab (at most every two minutes).
  const check = throttled(() => { void checkForUpdate(); }, 2 * 60_000); check(); window.setInterval(check, UPDATE_CHECK_MS);
  const stopVisibility = listenForVisibility(document, () => { cache.clear(); lastFingerprint = ""; void update(); check(); }); const root = getAppRoot(); observer = new MutationObserver(schedule); observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-id", "title", "data-pre-plain-text"] }); void update(); window.addEventListener("pagehide", () => {observer?.disconnect();chatBadges?.stop();badgesRootObserver.disconnect();stopVisibility();}, { once: true }); }
start();
