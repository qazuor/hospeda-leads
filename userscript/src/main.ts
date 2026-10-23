import { fetchContext, type ContextResponse, type Match, ApiError } from "./api";
import { parseCode } from "./parse";
import { getAppRoot, getConversationPanel, readChat, redactedSnapshot } from "./selectors";
import { recalledAccount, rememberOpenedAccount } from "./session";
import { messageFingerprint, RegisterController } from "./register";
import { copyDiagnostic } from "./diagnostic";
import { renderBanner } from "./ui";

const BASE = (import.meta as ImportMeta & { env: { USERSCRIPT_CRM_BASE_URL?: string } }).env.USERSCRIPT_CRM_BASE_URL || "https://crm.hospeda.com.ar";
const TOKEN_KEY = "hospeda-userscript-token", choicesKey = (phone: string | null) => `hospeda-userscript-choice:${phone || "unknown"}`;
let observer: MutationObserver | null = null, timer = 0, lastFingerprint = "", activeChat = "", previewOpen = false;
const cache = new Map<string, { expiresAt: number; value: ContextResponse }>();
function token(): string { return GM_getValue<string>(TOKEN_KEY, ""); }
function showDialog(title: string, inputType = "text", initial = "", hint = ""): Promise<string | null> {
  return new Promise(resolve => {
    const host = document.createElement("div"), shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style"); style.textContent = `:host{position:fixed;inset:0;z-index:2147483647;font:16px system-ui;color:#18212f}.backdrop{position:absolute;inset:0;background:#0008;display:grid;place-items:center}.panel{background:#fff;padding:20px;border-radius:10px;width:min(420px,90vw)}input{box-sizing:border-box;width:100%;padding:9px;margin:12px 0}button{padding:8px 14px;margin-right:8px}textarea{box-sizing:border-box;width:100%;min-height:50vh;margin:12px 0}`;
    const backdrop = document.createElement("div"), panel = document.createElement("form"), heading = document.createElement("h2"), input = document.createElement("input"), save = document.createElement("button"), cancel = document.createElement("button");
    backdrop.className = "backdrop"; panel.className = "panel"; heading.textContent = title; input.type = inputType; input.value = initial; input.required = true; save.textContent = "Guardar"; save.type = "submit"; cancel.textContent = "Cancelar"; cancel.type = "button";
    panel.append(heading, input); if (hint) { const tip = document.createElement("p"); tip.textContent = hint; panel.append(tip); } panel.append(save, cancel); backdrop.append(panel); shadow.append(style, backdrop); document.body.append(host); input.focus();
    const finish = (value: string | null) => { resolve(value); host.remove(); };
    panel.addEventListener("submit", event => { event.preventDefault(); finish(input.value.trim()); }); cancel.addEventListener("click", () => finish(null));
    host.addEventListener("keydown", event => { if (event.key === "Escape") finish(null); });
  });
}
function showDiagnostic(text: string): void {
  const host = document.createElement("div"), shadow = host.attachShadow({ mode: "open" }), style = document.createElement("style"), backdrop = document.createElement("div"), panel = document.createElement("div"), area = document.createElement("textarea"), hint = document.createElement("p"), close = document.createElement("button");
  style.textContent = `:host{position:fixed;inset:0;z-index:2147483647;font:16px system-ui;color:#18212f}.backdrop{position:absolute;inset:0;background:#0008;display:grid;place-items:center}.panel{background:white;padding:20px;border-radius:10px;width:min(700px,90vw)}textarea{box-sizing:border-box;width:100%;height:55vh}button{padding:8px 14px}`; backdrop.className = "backdrop"; panel.className = "panel"; area.readOnly = true; area.value = text; hint.textContent = "Copialo con Ctrl+C y mandáselo al equipo"; close.textContent = "Cerrar"; close.addEventListener("click", () => host.remove()); panel.append(area, hint, close); backdrop.append(panel); shadow.append(style, backdrop); document.body.append(host); area.focus(); area.select();
}
function toast(text: string): void { const host = document.createElement("div"), shadow = host.attachShadow({ mode: "open" }), style = document.createElement("style"), message = document.createElement("div"); style.textContent = `:host{position:fixed;right:20px;bottom:20px;z-index:2147483647;font:14px system-ui}.toast{background:#18212f;color:white;padding:10px 14px;border-radius:8px}`; message.className = "toast"; message.textContent = text; shadow.append(style, message); document.body.append(host); window.setTimeout(() => host.remove(), 2400); }
function diagnostic(): string { return redactedSnapshot(); }
function registerMenu(): void {
  GM_registerMenuCommand("Configurar token", async () => { const value = await showDialog("Configurar token de Hospeda CRM", "password", "", "Lo creás en el CRM → User script de WhatsApp"); if (value) { GM_setValue(TOKEN_KEY, value); cache.clear(); lastFingerprint = ""; void update(); } });
  GM_registerMenuCommand("Borrar token", () => { GM_setValue(TOKEN_KEY, ""); cache.clear(); lastFingerprint = ""; void update(); });
  GM_registerMenuCommand("Copiar diagnóstico del chat", async () => { await copyDiagnostic(diagnostic(), navigator.clipboard, showDiagnostic, () => toast("Diagnóstico copiado.")); });
}
async function resolveContext(code: string | null, phone: string | null): Promise<ContextResponse | null> {
  const query = code ? { code } : phone ? { phone } : null; if (!query || !token()) return null;
  const key = JSON.stringify(query), cached = cache.get(key); if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchContext(BASE, query, token()); cache.set(key, { value, expiresAt: Date.now() + 60_000 }); return value;
}
function setChoice(phone: string | null, match: Match): void { GM_setValue(choicesKey(phone), match.accountId); }
async function update(): Promise<void> {
  const main = getConversationPanel();
  if (!main) { document.getElementById("hospeda-userscript-banner")?.remove(); lastFingerprint = ""; activeChat = ""; previewOpen = false; return; }
  const chat = readChat(document);
  if (!chat.ok) {
    if (chat.reason === "unreadable" && main) { const host = renderBanner({ context: null, selected: null, unreadable: true, register: null, onSelect: () => {} }); main.prepend(host); }
    else document.getElementById("hospeda-userscript-banner")?.remove();
    return;
  }
  const fingerprint = messageFingerprint(chat.title, chat.messages), chatKey = `${chat.title}:${chat.phone || ""}`;
  if (chatKey === activeChat && previewOpen) { lastFingerprint = fingerprint; return; }
  if (fingerprint === lastFingerprint && document.getElementById("hospeda-userscript-banner")) return;
  const changedChat = activeChat !== chatKey; if (changedChat) previewOpen = false; activeChat = chatKey; lastFingerprint = fingerprint;
  const code = parseCode(chat.title); let context: ContextResponse | null = null, error: string | undefined;
  const sessionAccount = recalledAccount(chat.phone);
  try { context = sessionAccount ? await resolveContext(`H${sessionAccount}`, null) : await resolveContext(code, chat.phone); }
  catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) { cache.clear(); error = "Token inválido o revocado. Configurá uno nuevo desde el menú de Tampermonkey."; }
    else if (cause instanceof ApiError && cause.status === 426) error = "Actualizá el script desde el menú de Tampermonkey";
    else { error = "No se pudo consultar el CRM. Reintentando en el próximo cambio."; const existing = document.getElementById("hospeda-userscript-banner"); if (existing && !changedChat) { const status = existing.shadowRoot?.querySelector<HTMLElement>("[aria-live]"); if (status) status.textContent = error; return; } }
  }
  const matches = context?.matches || [], chosenId = GM_getValue<string>(choicesKey(chat.phone), "");
  const selected = matches.find(match => match.accountId === (sessionAccount || chosenId)) || (matches.length === 1 ? matches[0] : null);
  const controller = token() ? new RegisterController(BASE, token()) : null, lastRegister = GM_getValue<string | null>("hospeda-userscript-last-register", null);
  const host = renderBanner({ context, selected, error, register: controller, title: chat.title, phone: chat.phone, readMessages: () => { const current = readChat(document); return current.ok ? current.messages : []; }, lastRegistered: lastRegister ? new Date(lastRegister).toLocaleString("es-AR") : null, onPreviewChange: open => { previewOpen = open; if (!open) { lastFingerprint = ""; void update(); } }, onSelect: match => { setChoice(chat.phone, match); lastFingerprint = ""; void update(); } });
  main.prepend(host);
}
function schedule(): void { window.clearTimeout(timer); timer = window.setTimeout(() => { void update(); }, 500); }
function start(): void { rememberOpenedAccount(location.search); registerMenu(); const root = getAppRoot(); observer = new MutationObserver(schedule); observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-id", "title", "data-pre-plain-text"] }); void update(); window.addEventListener("pagehide", () => observer?.disconnect(), { once: true }); }
start();
