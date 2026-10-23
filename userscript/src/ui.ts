import type { Match, ContextResponse, RegisterResult } from "./api";
import type { ChatMessage } from "./selectors";
import { getConversationHeaderBottom } from "./selectors";
import { filterCached, RegisterController, summarizeResults } from "./register";

const ID = "hospeda-userscript-banner";
const MIN_KEY = "hospeda-userscript-minimized";
// Messages are bound to the chat the banner was rendered for; a chat switch must never register them to the previous business.
const CHAT_CHANGED = "El chat cambió. Volvé a abrir «Registrar en CRM» en este chat.";
export type UiOptions = { isCurrentChat?: () => boolean; context: ContextResponse | null; selected: Match | null; unreadable?: boolean; error?: string; onSelect: (match: Match) => void; register: RegisterController | null; title?: string; phone?: string | null; readMessages?: () => ChatMessage[]; lastRegistered?: string | null; onPreviewChange?: (open: boolean) => void };
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] { const node = document.createElement(tag); if (text) node.textContent = text; return node; }
export function renderBanner(options: UiOptions): HTMLElement {
  let host = document.getElementById(ID) as HTMLElement | null;
  if (!host) { host = element("div"); host.id = ID; host.attachShadow({ mode: "open" }); }
  const root = host.shadowRoot!; root.replaceChildren();
  const top = getConversationHeaderBottom();
  const style = element("style", `:host{all:initial;position:fixed;top:${top}px;right:12px;width:min(460px,calc(100vw - 24px));max-height:calc(100vh - ${top + 12}px);overflow:auto;z-index:9999;font:14px system-ui;color:#18212f}section{background:#fff;border:1px solid #d6dce5;border-radius:8px;padding:12px;margin:4px;box-shadow:0 2px 8px #0002}header{display:flex;justify-content:space-between;gap:12px}a,button{color:#1459a6}button{padding:6px 10px;cursor:pointer}.warn{color:#9b1c1c;background:#fff0f0;padding:8px}.muted{color:#596579}.preview{max-height:220px;overflow:auto}label{display:block;margin:5px 0}[aria-live]{min-height:1.3em}.pill{border-radius:18px;padding:7px 12px;font-weight:600}.dot{color:#c21b27;margin-right:5px}`);
  const minimized = GM_getValue<boolean>(MIN_KEY, false);
  if (minimized) {
    const pill = element("button"); pill.className = "pill"; pill.setAttribute("aria-label", "Mostrar Hospeda CRM");
    if (options.selected?.doNotContact || options.selected?.restrictionActive) { const dot = element("span", "● "); dot.className = "dot"; pill.append(dot); }
    pill.append(document.createTextNode(options.selected ? `Hospeda · ${options.selected.code}` : "Hospeda · Sin asociar"));
    pill.addEventListener("click", () => { GM_setValue(MIN_KEY, false); renderBanner(options); }); root.append(style, pill); return host;
  }
  const section = element("section"); section.setAttribute("aria-label", "Hospeda CRM");
  const h = element("header"), title = options.selected ? `${options.selected.name} · ${options.selected.code}` : "Sin asociar"; h.append(element("strong", title));
  const actions = element("span"), minimize = element("button", "Minimizar"); minimize.addEventListener("click", () => { GM_setValue(MIN_KEY, true); renderBanner(options); }); actions.append(minimize);
  if (options.selected) { const link = element("a", "Abrir en CRM"); link.href = options.selected.url; link.target = "_blank"; link.rel = "noopener noreferrer"; actions.append(link); } h.append(actions); section.append(h);
  const matches = options.context?.matches || [];
  if (matches.length > 1) { const select = element("select"); select.setAttribute("aria-label", "Elegir negocio"); for (const match of matches) { const opt = element("option", `${match.name} · ${match.code}`); opt.value = match.accountId; opt.selected = match.accountId === options.selected?.accountId; select.append(opt); } select.addEventListener("change", () => { const match = matches.find(item => item.accountId === select.value); if (match) options.onSelect(match); }); section.append(select); }
  if (options.selected) { section.append(element("p", `Responsable: ${options.selected.assignedUserName || "Sin asignar"}`), element("p", `Gestiones abiertas: ${options.selected.leads.map(lead => `${lead.name} (${lead.stage})`).join(", ") || "Ninguna"}`)); if (options.selected.doNotContact || options.selected.restrictionActive) { const warning = element("p", "Este negocio pidió no ser contactado."); warning.className = "warn"; section.append(warning); } }
  section.append(element("p", `Conectado como ${options.context?.user.displayName || "—"}`)); if (options.lastRegistered) section.append(element("p", `Último registro: ${options.lastRegistered}`));
  const status = element("p", options.unreadable ? "No pude leer este chat. Registrá a mano desde el CRM." : options.error || ""); status.setAttribute("aria-live", "polite"); section.append(status);
  if (!GM_getValue<string>("hospeda-userscript-token", "")) section.append(element("p", "Configurá el token desde el menú de Tampermonkey"));
  if (options.selected && options.register && options.readMessages) {
    const button = element("button", "Registrar en CRM"); section.append(button);
    button.addEventListener("click", () => { if (options.isCurrentChat && !options.isCurrentChat()) { status.textContent = CHAT_CHANGED; return; } const fresh = filterCached(options.readMessages!()); if (!fresh.length) { status.textContent = "No hay mensajes nuevos para registrar."; return; } options.onPreviewChange?.(true); showPreview(fresh, options, button, status); });
  }
  root.append(style, section);
  return host;
}
/** Warns that a sent message completes the WhatsApp the seller opened from "Contactar" instead of being recorded twice; null when none is open. */
export function openWhatsappNotice(open: readonly { openedAt: string }[] | undefined, messages: readonly ChatMessage[]): string | null {
  if (!open?.length || !messages.some(message => message.direction === "out")) return null;
  const first = new Date(open[0]!.openedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  const count = open.length === 1 ? "un WhatsApp abierto" : `${open.length} WhatsApp abiertos`;
  return `Tenés ${count} desde el CRM para este número (el primero, ${first}). El mensaje enviado lo completa en el CRM y no se registra dos veces.`;
}
function showPreview(messages: ChatMessage[], options: UiOptions, button: HTMLButtonElement, status: HTMLElement): void {
  const box = element("div"); box.className = "preview"; const inputs: HTMLInputElement[] = [];
  const list = element("div");
  const renderLines = () => { list.replaceChildren(); inputs.length = 0; for (const message of messages) { const label = element("label"), input = element("input"); input.type = "checkbox"; input.checked = true; inputs.push(input); const time = message.sentAt ? new Date(message.sentAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "Sin hora"; label.append(input, document.createTextNode(` ${message.direction === "out" ? "Saliente" : "Entrante"} · ${time} · ${message.text.slice(0, 120)}`)); list.append(label); } };
  renderLines(); const all = element("button", "Seleccionar todos"), none = element("button", "Ninguno"), cancel = element("button", "Cancelar"), confirm = element("button", "Confirmar registro");
  all.addEventListener("click", () => inputs.forEach(input => input.checked = true)); none.addEventListener("click", () => inputs.forEach(input => input.checked = false));
  const close = () => { box.remove(); options.onPreviewChange?.(false); };
  cancel.addEventListener("click", close);
  confirm.addEventListener("click", async () => { const selected = messages.filter((_, index) => inputs[index].checked); if (!selected.length || options.register?.isSubmitting) return; if (options.isCurrentChat && !options.isCurrentChat()) { status.textContent = CHAT_CHANGED; close(); return; } confirm.disabled = true; button.disabled = true; status.textContent = "Registrando…";
    try { const results = await options.register!.submit(options.selected!.accountId, { title: options.title || "", phone: options.phone || null }, selected); status.textContent = summarizeResults(results); const rejected = results.filter(item => item.status === "rejected"); for (const item of rejected) { const original = messages.find(message => message.externalId === item.externalId); const row = element("p", `${original?.sentAt ? new Date(original.sentAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "Sin hora"} · ${(original?.text || "").slice(0, 120)} · ${item.reason || "Motivo no informado"}`); box.append(row); } confirm.remove(); cancel.textContent = "Cerrar"; } catch (error) { status.textContent = `${error instanceof Error ? error.message : "Error al registrar."} Podés reintentar.`; confirm.disabled = false; button.disabled = false; }
  });
  const notice = openWhatsappNotice(options.selected?.openWhatsapp, messages); if (notice) { const note = element("p", notice); note.setAttribute("role", "note"); box.append(note); }
  box.append(all, none, cancel, confirm, list); button.after(box);
}
