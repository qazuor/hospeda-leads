import type { Match, ContextResponse, RegisterResult } from "./api";
import type { ChatMessage } from "./selectors";
import { filterCached, RegisterController, summarizeResults } from "./register";
import { sentMatchesPrepared } from "./textMatch";
import { PANEL_CSS } from "./styles";
import { LOGO_SRC } from "./logo";
import { compareSemver } from "./parse";
import { UPDATE_PROMPT_ID } from "./updatePrompt";
import { openCompose } from "./compose";
import { openAutoList } from "./autoList";

const ID = "hospeda-userscript-banner";
const OPEN_KEY = "hospeda-userscript-open", AUTO_OPEN_KEY = "hospeda-userscript-auto-open", TOKEN_KEY = "hospeda-userscript-token", THEME_KEY = "hospeda-userscript-theme";
// Messages are bound to the chat the panel was rendered for; a chat switch must never register them to the previous business.
const CHAT_CHANGED = "El chat cambió. Volvé a abrir «Registrar mensajes» en este chat.";
export const NO_MATCH = "En el CRM usá «Copiar nombre para agendar» y agendá el contacto con ese nombre. También lo reconozco si el número está cargado en el negocio.";
export const NO_CHAT = "Abrí un chat individual para ver su negocio y registrar mensajes.";
const UNREADABLE = "No pude leer este chat. Registrá a mano desde el CRM y copiá el diagnóstico para el equipo.";
const GROUP = "Los chats grupales no se registran en el CRM.";
const DO_NOT_CONTACT = "Este negocio pidió no ser contactado. Los mensajes enviados no se van a registrar.";
const NEW_STATUS = "En estado Nuevo solo se registran los mensajes recibidos. Revisá el negocio en el CRM para registrar los enviados.";

export type UiOptions = {
  context: ContextResponse | null; selected: Match | null; onSelect: (match: Match) => void; register: RegisterController | null;
  unreadable?: boolean; group?: boolean; error?: string; title?: string; phone?: string | null; isCurrentChat?: () => boolean; readMessages?: () => ChatMessage[];
  lastRegistered?: string | null; onPreviewChange?: (open: boolean) => void; crmBase?: string; version?: string;
  onSaveToken?: (token: string) => void; onClearToken?: () => void; onCopyDiagnostic?: () => void;
  /** Set when the server rejected this version (HTTP 426): updating is the only way forward. */
  requiredVersion?: string | null;
  autoStatus?:string;
  autoTodayCount?:number;
  autoPreference?:boolean;autoDisabled?:boolean;onAutoPreference?:(enabled:boolean)=>Promise<void>|void;
};
type View = "chat" | "settings" | "preview" | "compose" | "autoList";
let view: View = "chat", editingToken = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
type Shape = readonly [string, Record<string, string>];
/** Icons are built node by node: WhatsApp may enforce Trusted Types, where assigning markup to innerHTML throws. */
function icon(label: string, shapes: readonly Shape[], onClick: () => void): HTMLButtonElement {
  const button = el("button", "icon"), ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"); button.type = "button"; button.setAttribute("aria-label", label); button.title = label;
  for (const [name, value] of Object.entries({ width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(name, value);
  for (const [tag, attrs] of shapes) { const shape = document.createElementNS(ns, tag); for (const [name, value] of Object.entries(attrs)) shape.setAttribute(name, value); svg.append(shape); }
  button.append(svg); button.addEventListener("click", onClick); return button;
}
const GEAR: Shape[] = [["path", { d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" }], ["circle", { cx: "12", cy: "12", r: "3" }]], MINUS: Shape[] = [["path", { d: "M5 12h14" }]], CLOSE: Shape[] = [["path", { d: "M18 6 6 18M6 6l12 12" }]], BACK: Shape[] = [["path", { d: "m15 18-6-6 6-6" }]];
const hasToken = () => !!GM_getValue<string>(TOKEN_KEY, "");
const freshMessages = (options: UiOptions) => options.readMessages ? filterCached(options.readMessages()) : [];
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const timeOf = (message: ChatMessage) => message.sentAt ? new Date(message.sentAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "Sin hora";

export type Theme = "auto" | "light" | "dark";
const THEMES: readonly [Theme, string][] = [["auto", "Automático (como WhatsApp)"], ["light", "Claro"], ["dark", "Oscuro"]];
export function getTheme(): Theme { const value = GM_getValue<string>(THEME_KEY, "auto"); return value === "light" || value === "dark" ? value : "auto"; }
/** Auto follows WhatsApp's own theme (`body.dark`); before WhatsApp sets it, the system preference decides. */
export function isDark(theme: Theme = getTheme()): boolean {
  if (theme !== "auto") return theme === "dark";
  if (document.body.classList.contains("dark")) return true;
  if (document.body.classList.contains("light")) return false;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}
/** Re-applies the theme without re-rendering, so a WhatsApp theme switch never wipes what the seller is doing in the panel. */
export function applyTheme(): void { for (const id of [ID, UPDATE_PROMPT_ID]) document.getElementById(id)?.classList.toggle("dark", isDark()); }
/** Back to the chat view with nothing being edited, as on a fresh page load. */
export function resetPanelState(): void { view = "chat"; editingToken = false; }
export function isAutoOpen(): boolean { return GM_getValue<boolean>(AUTO_OPEN_KEY, true); }
export function setPanelOpen(open: boolean): void { GM_setValue(OPEN_KEY, open); }
/** Opens the settings view (the extension menu's "Configurar token" lands here). */
export function openSettings(): void { view = "settings"; editingToken = true; setPanelOpen(true); }
/** True while the seller is typing in the panel: re-rendering then would wipe what they wrote. */
export function isEditing(): boolean { const active = document.getElementById(ID)?.shadowRoot?.activeElement; return !!active && ["INPUT", "SELECT"].includes(active.tagName) && (active as HTMLInputElement).type !== "checkbox"; }

/** Renders the always-visible launcher and, when open, the panel. Lives on `document.body`, outside WhatsApp's React tree. */
export function renderBanner(options: UiOptions): HTMLElement {
  let host = document.getElementById(ID) as HTMLElement | null;
  // An own tag, not a div: WhatsApp's element selectors and variables must not style the host.
  if (!host) { host = document.createElement("hospeda-crm"); host.id = ID; host.attachShadow({ mode: "open" }); }
  if (view === "preview" || view === "compose" || view === "autoList") view = "chat"; // detail views belong to the chat they were opened from
  host.classList.toggle("dark", isDark());
  const root = host.shadowRoot!, open = GM_getValue<boolean>(OPEN_KEY, true);
  root.replaceChildren(el("style", undefined, PANEL_CSS), launcher(options, open));
  if (open) root.append(panel(options));
  if (!host.isConnected) document.body.append(host);
  return host;
}

const logo = (className: string) => { const image = el("img", className); image.src = LOGO_SRC; image.alt = ""; return image; };
/**
 * WhatsApp's left rail, read only for its position: the launcher is laid over it (fixed, on our own host) instead of being inserted
 * into WhatsApp's React tree, which would remove or trip over a foreign node. Null when the rail is not on screen.
 */
function railSlot(): { left: number; top: number } | null {
  const footer = document.querySelector("[data-testid='navbar-footer-section']")?.getBoundingClientRect();
  // While WhatsApp animates its loading screen the rail is drawn off screen; only a fully visible rail counts.
  return footer && footer.width > 0 && footer.left >= 0 && footer.top > 120 && footer.top + 40 <= window.innerHeight ? { left: Math.round(footer.left), top: Math.round(footer.top - 52) } : null;
}
let resizeBound = false, railTimer = 0, railDeadline = Date.now() + 15_000;
/** How long the launcher stays hidden waiting for WhatsApp's rail before it falls back to floating. Starts at page load. */
export function waitForRail(ms: number): void { railDeadline = Date.now() + ms; }
/**
 * WhatsApp draws its rail seconds after the script starts. Until it shows up (or the wait runs out) the launcher stays hidden and re-checks,
 * so it appears straight in the rail instead of floating bottom-right and jumping there.
 */
function placeLauncher(button: HTMLElement): void {
  const slot = railSlot(), waiting = !slot && Date.now() < railDeadline;
  button.classList.toggle("rail", !!slot); button.classList.toggle("waiting", waiting); button.style.left = slot ? `${slot.left}px` : ""; button.style.top = slot ? `${slot.top}px` : "";
  // Keeps following the rail: WhatsApp moves it without any event we could listen to (loading animation, layout changes).
  window.clearTimeout(railTimer);
  railTimer = window.setTimeout(() => { const current = document.getElementById(ID)?.shadowRoot?.querySelector<HTMLElement>(".launcher"); if (current) placeLauncher(current); }, waiting ? 250 : document.hidden ? 5000 : 1000);
}
function launcher(options: UiOptions, open: boolean): HTMLButtonElement {
  const fresh = freshMessages(options).length;
  const [label, tone] = !hasToken() ? ["Falta el token", "warn"] : options.unreadable ? ["No pude leer el chat", "error"] : options.error ? ["Revisá la conexión", "error"]
    : options.selected ? [`${options.selected.code}${fresh ? ` · ${plural(fresh, "nuevo", "nuevos")}` : ""}`, options.selected.doNotContact || options.selected.restrictionActive ? "error" : "ok"]
    : pendingUpdate(options) ? ["Hay una actualización", "warn"] : ["Hospeda", options.context ? "ok" : ""];
  const button = el("button", "launcher"); button.type = "button"; button.setAttribute("aria-expanded", String(open)); button.setAttribute("aria-label", `Hospeda CRM: ${label}. ${open ? "Ocultar" : "Mostrar"} panel`);
  button.title = `Hospeda CRM: ${label}`; button.append(logo("logo"), el("span", "label", label), el("span", `dot ${tone}`)); placeLauncher(button);
  if (!resizeBound) { resizeBound = true; window.addEventListener("resize", () => { const current = document.getElementById(ID)?.shadowRoot?.querySelector<HTMLElement>(".launcher"); if (current) placeLauncher(current); }); }
  button.addEventListener("click", () => { setPanelOpen(!open); const wasPreview = view === "preview" || view === "compose"; view = "chat"; if (wasPreview && options.onPreviewChange) options.onPreviewChange(false); else renderBanner(options); });
  return button;
}

function bar(options: UiOptions, title?: { main: string; sub?: string }): HTMLElement {
  const header = el("div", "bar");
  if (title) { const box = el("div", "title"); box.append(el("strong", undefined, title.main)); if (title.sub) box.append(el("span", undefined, title.sub)); header.append(box); }
  else { const brand = el("div", "brand"); brand.append(logo("mark"), document.createTextNode("Hospeda CRM")); header.append(brand); }
  const actions = el("div", "actions");
  if (view === "settings" && hasToken()) actions.append(icon("Volver al chat", BACK, () => { view = "chat"; editingToken = false; renderBanner(options); }));
  else if (view === "compose" || view === "autoList") actions.append(icon("Volver al negocio", BACK, () => { const wasList = view === "autoList"; view = "chat"; if (wasList && options.onPreviewChange) options.onPreviewChange(false); else if (options.onPreviewChange) options.onPreviewChange(false); else renderBanner(options); }));
  else if (view === "chat") actions.append(icon("Ajustes", GEAR, () => { view = "settings"; renderBanner(options); }));
  actions.append(icon("Minimizar", MINUS, () => { setPanelOpen(false); renderBanner(options); }));
  header.append(actions); return header;
}

function panel(options: UiOptions): HTMLElement {
  const wrap = el("div", "panel"), card = el("section", "card"); card.setAttribute("aria-label", "Hospeda CRM"); wrap.append(card);
  if (!hasToken()) { view = "settings"; editingToken = true; }
  if (view === "settings") card.append(bar(options, { main: "Ajustes de Hospeda CRM" }), settings(options));
  else if (view === "compose") card.append(bar(options, { main: "Mandar un mensaje", sub: options.selected?.name }), el("div", "body"));
  else if (view === "autoList" && options.selected) openAutoList(card, options, options.selected, () => { view = "chat"; if (options.onPreviewChange) options.onPreviewChange(false); else renderBanner(options); }, title => bar(options, { main: title, sub: options.selected?.name }));
  else card.append(bar(options), chat(options, card));
  return wrap;
}

/** The version to update to: the one the server requires, else a newer published one. Null when the installed script is current. */
export function pendingUpdate(options: Pick<UiOptions, "context" | "version" | "requiredVersion">): string | null {
  if (options.requiredVersion) return options.requiredVersion;
  const latest = options.context?.latestVersion;
  return latest && options.version && compareSemver(latest, options.version) > 0 ? latest : null;
}
/** Opening the served script hands it to Tampermonkey, which shows its update page; the seller confirms there with one click. */
function updateNotice(options: UiOptions): HTMLElement | null {
  const next = pendingUpdate(options); if (!next || !options.crmBase) return null;
  const box = el("div", `note ${options.requiredVersion ? "warn" : "info"} update`), text = el("span", undefined, options.requiredVersion ? `Esta versión ya no funciona con el CRM. Actualizá a la ${next}.` : `Hay una versión nueva del script (${next}).`);
  const link = el("a", "btn small", "Actualizar"); link.href = `${options.crmBase}/userscripts/hospeda-crm.user.js`; link.target = "_blank"; link.rel = "noopener noreferrer";
  box.append(text, link); return box;
}
function chat(options: UiOptions, card: HTMLElement): HTMLElement {
  const body = el("div", "body"), status = el("p", "muted"); status.setAttribute("aria-live", "polite");
  const update = updateNotice(options); if (update) body.append(update);
  if (options.group) body.append(el("p", "muted", GROUP));
  else if (options.unreadable) { body.append(el("p", "note warn", UNREADABLE)); const copy = el("button", "btn small", "Copiar diagnóstico del chat"); copy.type = "button"; copy.addEventListener("click", () => options.onCopyDiagnostic?.()); body.append(copy); }
  else if (!options.title) body.append(el("p", "muted", NO_CHAT));
  else {
    const matches = options.context?.matches || [], selected = options.selected;
    if (matches.length > 1) {
      const field = el("label", "field", "Hay varios negocios con este número"), select = el("select"); select.setAttribute("aria-label", "Elegir negocio");
      if (!selected) { const placeholder = el("option", undefined, "Elegí el negocio"); placeholder.value = ""; select.append(placeholder); }
      for (const match of matches) { const option = el("option", undefined, `${match.name} · ${match.code}`); option.value = match.accountId; option.selected = match.accountId === selected?.accountId; select.append(option); }
      select.addEventListener("change", () => { const match = matches.find(item => item.accountId === select.value); if (match) options.onSelect(match); }); field.append(select); body.append(field);
    }
    if (selected) business(options, selected, body, card, status);
    else if (!options.error && matches.length < 2) {
      body.append(el("span", "eyebrow", "SIN ASOCIAR"), el("span", "name", options.title), el("p", "note info", `No encontré el negocio de este chat. ${NO_MATCH}`));
      if (options.crmBase) { const link = el("a", "btn", "Buscar en Negocios del CRM"); link.href = `${options.crmBase}/accounts`; link.target = "_blank"; link.rel = "noopener noreferrer"; body.append(link); }
    }
  }
  if (options.error) status.textContent = options.error;
  body.append(status); return body;
}

function business(options: UiOptions, selected: Match, body: HTMLElement, card: HTMLElement, status: HTMLElement): void {
  body.append(el("span", "eyebrow", `${selected.code}${selected.city ? ` · ${selected.city}` : ""}`), el("span", "name", selected.name));
  if(options.autoStatus) { const line=el("div","meta");const label=options.autoStatus.startsWith("Registro automático activo")?`${options.autoStatus} · ${options.autoTodayCount??0} registrados hoy`:options.autoStatus;line.append(el("span","muted",label));if(options.autoStatus.startsWith("Registro automático activo")){const see=el("button","btn small","Ver");see.type="button";see.addEventListener("click",()=>{view="autoList";options.onPreviewChange?.(true);openAutoList(card,options,selected,()=>{view="chat";options.onPreviewChange?.(false);},title=>bar(options,{main:title,sub:selected.name}));});line.append(see);}body.append(line); }
  const chips = el("div", "chips"); chips.append(el("span", "chip", `Responsable: ${selected.assignedUserName || "Sin asignar"}`));
  if (selected.statusLabel) chips.append(el("span", "chip", selected.statusLabel));
  chips.append(el("span", "chip", selected.leads.length ? plural(selected.leads.length, "gestión abierta", "gestiones abiertas") : "Sin gestiones abiertas")); body.append(chips);
  if (selected.leads.length) { const box = el("div", "box"); box.append(el("span", "label", selected.leads.length === 1 ? "Gestión abierta" : "Gestiones abiertas")); for (const lead of selected.leads.slice(0, 3)) box.append(el("span", undefined, `${lead.name} · ${lead.stage}`)); body.append(box); }
  if (selected.doNotContact || selected.restrictionActive) body.append(el("p", "note danger", DO_NOT_CONTACT));
  if (selected.status === "new") body.append(el("p", "note warn", NEW_STATUS));
  const fresh = freshMessages(options).length, meta = el("div", "meta");
  meta.append(el("span", undefined, fresh ? `${plural(fresh, "mensaje nuevo", "mensajes nuevos")} en este chat` : "Sin mensajes nuevos"), el("span", undefined, options.lastRegistered ? `Último registro: ${options.lastRegistered}` : ""));
  body.append(meta);
  const actions = el("div", "actions grid");
  if (options.register && options.readMessages) {
    const button = el("button", "btn primary", "Registrar mensajes"); button.type = "button";
    button.addEventListener("click", () => {
      if (options.isCurrentChat && !options.isCurrentChat()) { status.textContent = CHAT_CHANGED; return; }
      const messages = filterCached(options.readMessages!()); if (!messages.length) { status.textContent = "No hay mensajes nuevos para registrar."; return; }
      view = "preview"; options.onPreviewChange?.(true); showPreview(card, messages, options, selected);
    });
    actions.append(button);
  }
  const link = el("a", "btn", "Abrir en CRM"); link.href = selected.url; link.target = "_blank"; link.rel = "noopener noreferrer"; actions.append(link);
  // Spec 84: the same rules as «Contactar» in the CRM; the server checks them again when preparing.
  const blockedReason = !options.crmBase || !hasToken() ? "Conectá el script para usar los modelos." : selected.status === "new" ? NEW_STATUS : selected.doNotContact || selected.restrictionActive ? DO_NOT_CONTACT : !selected.leads.length ? "No hay gestiones abiertas para preparar un mensaje." : "";
  const send = el("button", "btn", "Mandar un mensaje"); send.type = "button"; send.disabled = !!blockedReason; send.title = blockedReason || "Elegí un modelo del CRM y pegalo en el chat";
  send.addEventListener("click", () => { view = "compose"; options.onPreviewChange?.(true); openCompose(card, options, selected, () => { view = "chat"; options.onPreviewChange?.(false); }, title => bar(options, { main: title, sub: `${selected.name} · ${selected.code}` })); });
  actions.insertBefore(send, link);
  body.append(actions);
}

function settings(options: UiOptions): HTMLElement {
  const body = el("div", "body"), connection = el("div", "section"); connection.append(el("h3", undefined, "CONEXIÓN"));
  if (editingToken || !hasToken()) connection.append(tokenForm(options));
  else {
    const state = el("div", "status"), user = options.context?.user.displayName;
    state.append(el("span", `dot ${options.error ? "error" : user ? "ok" : ""}`), document.createTextNode(options.error ? options.error : user ? `Conectado como ${user}` : "Token guardado"));
    connection.append(state); if (options.crmBase) connection.append(el("span", "muted", new URL(options.crmBase).host));
    const actions = el("div", "actions"), change = el("button", "btn small", "Cambiar token"), clear = el("button", "btn small danger", "Desconectar"); change.type = clear.type = "button";
    change.addEventListener("click", () => { editingToken = true; renderBanner(options); }); clear.addEventListener("click", () => { editingToken = true; options.onClearToken?.(); });
    actions.append(change, clear); connection.append(actions);
  }
  const script = el("div", "section"), toggle = el("label", "toggle", "Abrir el panel al entrar a un chat"), auto = el("input"); auto.type = "checkbox"; auto.checked = isAutoOpen();
  auto.addEventListener("change", () => GM_setValue(AUTO_OPEN_KEY, auto.checked)); toggle.append(auto);
  const themeField = el("label", "field", "Tema"), theme = el("select"); theme.setAttribute("aria-label", "Tema");
  for (const [value, label] of THEMES) { const option = el("option", undefined, label); option.value = value; option.selected = value === getTheme(); theme.append(option); }
  theme.addEventListener("change", () => { GM_setValue(THEME_KEY, theme.value); applyTheme(); }); themeField.append(theme);
  const update = updateNotice(options), installed = el("span", undefined, `Versión ${options.version || "—"}${update ? "" : options.context ? " · al día" : ""}`);
  const autoSection=el("div","section"),autoToggle=el("label","toggle","Registrar solo los chats seguros"),autoInput=el("input"),autoError=el("p","note warn");autoInput.type="checkbox";autoInput.checked=options.autoPreference??false;autoInput.disabled=options.autoDisabled??false;autoInput.title=autoInput.disabled?"Desactivado por un administrador":"";autoToggle.append(autoInput);autoInput.addEventListener("change",()=>{const before=!!options.autoPreference,next=autoInput.checked;autoInput.disabled=true;autoError.textContent="";void Promise.resolve(options.onAutoPreference?.(next)).catch(error=>{autoInput.checked=before;autoError.textContent=error instanceof Error?error.message:"No se pudo guardar la preferencia.";}).finally(()=>{autoInput.disabled=options.autoDisabled??false;});});autoSection.append(autoToggle);if(autoInput.disabled)autoSection.append(el("span","muted","Desactivado por un administrador"));autoSection.append(autoError);
  const reasons=el("span","muted",["Registrados solos","Era de otro negocio","No era de esta gestión","Mensaje personal","Otro"].join(" · "));
  script.append(el("h3", undefined, "SCRIPT"), installed); if (update) script.append(update); script.append(themeField, toggle,autoSection,reasons);
  const help = el("div", "section"), copy = el("button", "btn small", "Copiar diagnóstico del chat"); copy.type = "button"; copy.addEventListener("click", () => options.onCopyDiagnostic?.());
  help.append(el("h3", undefined, "AYUDA"), copy);
  if (options.crmBase) { const guide = el("a", undefined, "Guía de instalación y problemas frecuentes"); guide.href = `${options.crmBase}/guide?topic=whatsapp-userscript&article=install-userscript`; guide.target = "_blank"; guide.rel = "noopener noreferrer"; help.append(guide); }
  body.append(connection, script, help); return body;
}

function tokenForm(options: UiOptions): HTMLFormElement {
  const form = el("form", "section"), field = el("label", "field", "Token"), input = el("input"), error = el("p", "note danger"); error.setAttribute("aria-live", "polite");
  input.type = "password"; input.placeholder = "hcu_…"; input.autocomplete = "off"; input.required = true; field.append(input);
  const actions = el("div", "actions"), save = el("button", "btn primary", "Conectar"); save.type = "submit"; actions.append(save);
  if (hasToken()) { const cancel = el("button", "btn", "Cancelar"); cancel.type = "button"; cancel.addEventListener("click", () => { editingToken = false; renderBanner(options); }); actions.prepend(cancel); }
  form.append(el("p", "muted", "Creá un token en el CRM, en «User script de WhatsApp», y pegalo acá. Se guarda solo en este navegador."), field, error, actions);
  form.addEventListener("submit", event => { event.preventDefault(); const value = input.value.trim(); if (!/^hcu_[\w-]+$/.test(value)) { error.textContent = "El token empieza con hcu_. Copialo de nuevo desde el CRM."; return; } editingToken = false; view = "chat"; options.onSaveToken?.(value); });
  return form;
}

/** Same window the CRM uses to complete an opened WhatsApp: prepared at most 24 h before the send and at most 10 min after it. */
const OPENED_WINDOW_MS = 24 * 60 * 60_000, OPENED_SKEW_MS = 10 * 60_000;
/**
 * Warns that a sent message completes the WhatsApp the seller opened from "Contactar" instead of being recorded twice. Only attempts a
 * previewed sent message can actually complete count (a message without time is treated as sent now, as the CRM does); null when none.
 */
export function openWhatsappNotice(open: readonly { openedAt: string; body?: string | null }[] | undefined, messages: readonly ChatMessage[], now = Date.now()): string | null {
  const sends = messages.filter(message => message.direction === "out").map(message => ({ at: message.sentAt ? new Date(message.sentAt).getTime() : now, text: message.text }));
  const matching = (open || []).filter(item => { const opened = new Date(item.openedAt).getTime(); return sends.some(sent => opened >= sent.at - OPENED_WINDOW_MS && opened <= sent.at + OPENED_SKEW_MS && sentMatchesPrepared(item.body, sent.text)); });
  if (!matching.length) return null;
  const first = new Date(matching[0]!.openedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  const count = matching.length === 1 ? "un WhatsApp abierto" : `${matching.length} WhatsApp abiertos`;
  return `Tenés ${count} desde el CRM para este número (el primero, ${first}). El mensaje enviado lo completa en el CRM y no se registra dos veces.`;
}

function showPreview(card: HTMLElement, messages: ChatMessage[], options: UiOptions, selected: Match): void {
  const close = () => { view = "chat"; if (options.onPreviewChange) options.onPreviewChange(false); else renderBanner(options); };
  const header = el("div", "bar"), title = el("div", "title"); title.append(el("strong", undefined, "Registrar en el CRM"), el("span", undefined, `${selected.name} · ${selected.code}`)); header.append(title, icon("Cerrar vista previa", CLOSE, close));
  const inputs: HTMLInputElement[] = [], list = el("div", "list"); list.setAttribute("role", "group"); list.setAttribute("aria-label", "Mensajes a registrar");
  for (const message of messages) {
    const row = el("label", "row"), input = el("input"), content = el("span", "content"), meta = el("span", "meta"); input.type = "checkbox"; input.checked = true; inputs.push(input);
    meta.append(el("span", `dir ${message.direction}`, message.direction === "out" ? "Enviado" : "Recibido"), el("span", undefined, timeOf(message)));
    content.append(meta, el("span", "text", message.text.slice(0, 280))); row.append(input, content); list.append(row);
  }
  const sent = messages.filter(message => message.direction === "out").length, head = el("div", "selectall"), all = el("label"), toggle = el("input"), counter = el("span");
  toggle.type = "checkbox"; toggle.checked = true; all.append(toggle, counter); const chips = el("span", "chips"); chips.append(el("span", "chip sent", plural(sent, "enviado", "enviados")), el("span", "chip received", plural(messages.length - sent, "recibido", "recibidos"))); head.append(all, chips);
  const footer = el("div", "footer"), status = el("p", "muted"), actions = el("div", "actions"), cancel = el("button", "btn", "Cancelar"), confirm = el("button", "btn primary"); status.setAttribute("aria-live", "polite"); cancel.type = confirm.type = "button";
  const sync = () => { const count = inputs.filter(input => input.checked).length; counter.textContent = `${count} de ${messages.length} seleccionados`; toggle.checked = count === messages.length; toggle.indeterminate = count > 0 && count < messages.length; confirm.textContent = `Registrar ${plural(count, "mensaje", "mensajes")}`; confirm.disabled = !count; };
  toggle.addEventListener("change", () => { inputs.forEach(input => input.checked = toggle.checked); sync(); }); inputs.forEach(input => input.addEventListener("change", sync)); sync();
  cancel.addEventListener("click", close);
  confirm.addEventListener("click", async () => {
    const chosen = messages.filter((_, index) => inputs[index]!.checked); if (!chosen.length || options.register?.isSubmitting) return;
    if (options.isCurrentChat && !options.isCurrentChat()) { status.textContent = CHAT_CHANGED; return; }
    confirm.disabled = cancel.disabled = true; confirm.textContent = "Registrando…"; status.textContent = "";
    try {
      const results: RegisterResult[] = await options.register!.submit(selected.accountId, { title: options.title || "", phone: options.phone || null }, chosen);
      status.textContent = summarizeResults(results);
      for (const item of results.filter(result => result.status === "rejected")) { const original = messages.find(message => message.externalId === item.externalId); footer.insertBefore(el("p", "note warn", `${original ? timeOf(original) : "Sin hora"} · ${(original?.text || "").slice(0, 80)} · ${item.reason || "Motivo no informado"}`), actions); }
      inputs.forEach(input => input.disabled = true); toggle.disabled = true; confirm.remove(); cancel.disabled = false; cancel.textContent = "Cerrar";
    } catch (error) { status.textContent = `${error instanceof Error ? error.message : "Error al registrar."} Podés reintentar.`; cancel.disabled = false; sync(); }
  });
  actions.append(cancel, confirm); footer.append(status);
  const notice = openWhatsappNotice(selected.openWhatsapp, messages); if (notice) { const note = el("p", "note info", notice); note.setAttribute("role", "note"); footer.append(note); }
  footer.append(actions); card.replaceChildren(header, head, list, footer);
}
