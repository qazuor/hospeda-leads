import { PANEL_CSS } from "../styles";
import { LOGO_SRC } from "../logo";
import { compareSemver } from "../parse";
import type { InstagramMatch } from "../api";
import type { PanelTheme } from "./storage";
import { bodyKind, chatUsername, contactBlockReason, launcherState, selectedMatch, type AppState } from "./state";

/**
 * Spec 97 §4.3: the Hospeda panel on Instagram's chat page. Same look as the WhatsApp panel (`PANEL_CSS`, launcher + card), on an own custom
 * element with an open shadow root outside Instagram's tree. Built node by node (Trusted Types: no innerHTML); the stylesheet is a constructable
 * one adopted by the shadow root (9.1 item 6). Only the fields of §4.3 are rendered: anything here is readable by Instagram's page JS (§5.4.8).
 */
export const PANEL_ID = "hospeda-instagram-panel";
export const NOT_CONTACT_NOTE = "Este negocio pidió no ser contactado. No le escribas desde Instagram.";
export const CONNECT_FROM_CRM = "Conectá el script desde el CRM: User script → Conectar este navegador.";
/** Instagram's composer and send button sit at the bottom of the conversation: the launcher stays above them (position to verify live). */
const INSTAGRAM_CSS = `.launcher{bottom:96px;right:16px}.panel{top:72px;bottom:156px}.hlogo{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:var(--hc-primary);color:var(--hc-primary-text);font-weight:700;flex:none}`;

export type PanelActions = {
  /** Instagram's JS cannot drive the panel: every action that calls the CRM or writes into the composer requires a trusted event (§5.4.4). */
  readonly trusted: (event: Event) => boolean;
  readonly toggle: () => void;
  readonly view: (view: "main" | "settings") => void;
  readonly select: (accountId: string) => void;
  readonly retry: () => void;
  readonly confirmChat: () => void;
  readonly rejectChat: () => void;
  readonly compose: (match: InstagramMatch) => void;
  /** Spec 98 §4.1: «Enviar material», the compose view in material mode. Optional so older callers keep working. */
  readonly sendMaterial?: (match: InstagramMatch) => void;
  readonly setTheme: (theme: PanelTheme) => void;
  /** §15: the conversation-list badges switch (no CRM call, so no trusted guard). */
  readonly setBadges: (enabled: boolean) => void;
};
export type PanelInput = { readonly doc: Document; readonly state: AppState; readonly open: boolean; readonly dark: boolean; readonly theme: PanelTheme; readonly badges?: boolean; readonly base: string; readonly version: string; readonly actions: PanelActions;
  /** Fills the card in the compose view (`compose.ts`). */
  readonly mountCompose?: (card: HTMLElement, header: (title: string) => HTMLElement) => void };

type El = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => HTMLElementTagNameMap[K];
const maker = (doc: Document): El => (tag, className, text) => { const node = doc.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };

/** Applies the panel CSS: a constructable stylesheet (works under Instagram's CSP, 9.1), else a `<style>` element. */
export function applyStyles({ root, doc, css }: { root: ShadowRoot; doc: Document; css: string }): void {
  try {
    const View = doc.defaultView as (Window & typeof globalThis) | null; if (!View) throw new Error("no view");
    const sheet = new View.CSSStyleSheet(); sheet.replaceSync(css); root.adoptedStyleSheets = [sheet]; return;
  } catch { /* falls back to a style element */ }
  const style = doc.createElement("style"); style.textContent = css; root.prepend(style);
}

/** Renders (or re-renders) the launcher and, when open, the card. Returns the host. `mountCompose` fills the card in the compose view. */
export function renderPanel(input: PanelInput): HTMLElement {
  const { doc } = input, el = maker(doc);
  let host = doc.getElementById(PANEL_ID);
  if (!host) { host = doc.createElement("hospeda-instagram"); host.id = PANEL_ID; applyStyles({ root: host.attachShadow({ mode: "open" }), doc, css: PANEL_CSS + INSTAGRAM_CSS }); }
  host.classList.toggle("dark", input.dark);
  const root = host.shadowRoot!, style = root.querySelector("style");
  root.replaceChildren(...(style ? [style] : []), launcher(input, el));
  if (input.open) root.append(card(input, el));
  if (!host.isConnected) (doc.body ?? doc.documentElement).append(host);
  return host;
}
/** Removes the panel (any page that is not a chat page). */
export function removePanel({ doc }: { doc: Document }): void { doc.getElementById(PANEL_ID)?.remove(); }

/** The logo is a `data:` URI; if Instagram's `img-src` blocks it, the «H» dot of the chat badges replaces it. */
function logo(el: El, className: string): HTMLElement {
  const image = el("img", className); image.src = LOGO_SRC; image.alt = "";
  image.addEventListener("error", () => image.replaceWith(el("span", "hlogo", "H")), { once: true });
  return image;
}
function button(el: El, text: string, className: string, onClick: (event: MouseEvent) => void, disabled = false): HTMLButtonElement {
  const node = el("button", className, text); node.type = "button"; node.disabled = disabled; node.addEventListener("click", onClick); return node;
}
/**
 * Spec 98 §17: «Buscar o crear en el CRM» from a chat without a business. Opens Negocios searching the username (the CRM search does not read
 * `@`) and carries it as the creation prefill; the CRM never creates anything by itself. Only the href changes: no API call.
 */
export function instagramSearchOrCreateUrl({ base, username }: { base: string; username: string }): string {
  const user = username.replace(/^@/, "");
  return `${base}/accounts?${new URLSearchParams({ q: user, createInstagram: user })}`;
}
function link(el: El, text: string, href: string, className = "btn"): HTMLAnchorElement { const node = el("a", className, text); node.href = href; node.target = "_blank"; node.rel = "noopener noreferrer"; return node; }
/** Two-glyph icons (gear, close) as text, so no SVG markup is needed. */
function iconButton(el: El, label: string, glyph: string, onClick: () => void): HTMLButtonElement { const node = button(el, glyph, "icon", onClick); node.setAttribute("aria-label", label); node.title = label; return node; }

function launcher(input: PanelInput, el: El): HTMLButtonElement {
  const { label, tone } = launcherState(input.state), node = el("button", "launcher");
  node.type = "button"; node.setAttribute("aria-expanded", String(input.open)); node.setAttribute("aria-label", `Hospeda CRM: ${label}. ${input.open ? "Ocultar" : "Mostrar"} panel`); node.title = `Hospeda CRM: ${label}`;
  node.append(logo(el, "logo"), el("span", "label", label), el("span", `dot ${tone}`)); node.addEventListener("click", () => input.actions.toggle());
  return node;
}

function header(input: PanelInput, el: El, title: string, subtitle?: string): HTMLElement {
  const bar = el("div", "bar"), heading = el("div", "title"); heading.append(el("strong", undefined, title)); if (subtitle) heading.append(el("span", undefined, subtitle));
  const brand = el("div", "brand"); brand.append(logo(el, "mark"), heading);
  const actions = el("div", "actions");
  if (input.state.view === "main") actions.append(iconButton(el, "Ajustes", "⚙", () => input.actions.view("settings")));
  actions.append(iconButton(el, "Ocultar panel", "×", () => input.actions.toggle()));
  bar.append(brand, actions); return bar;
}

function card(input: PanelInput, el: El): HTMLElement {
  const wrap = el("div", "panel"), node = el("section", "card"); node.setAttribute("aria-label", "Hospeda CRM en Instagram"); wrap.append(node);
  if (input.state.view === "settings") node.append(header(input, el, "Ajustes"), settings(input, el));
  else if (input.state.view === "compose" && input.mountCompose) input.mountCompose(node, title => header(input, el, title));
  else node.append(header(input, el, "Hospeda CRM", input.state.threadId ? "Chat de Instagram" : undefined), main(input, el));
  return wrap;
}

const crmLink = (input: PanelInput, el: El) => link(el, "Abrir User script en el CRM", `${input.base}/userscript`);
const trustedClick = (input: PanelInput, run: () => void) => (event: MouseEvent) => { if (input.actions.trusted(event)) run(); };

function main(input: PanelInput, el: El): HTMLElement {
  const { state } = input, body = el("div", "body"), kind = bodyKind(state), username = chatUsername(state) ?? state.confirm?.username ?? "";
  const note = (text: string, tone = "warn") => el("p", `note ${tone}`, text);
  const retry = () => button(el, state.busy ? "Procesando…" : "Reintentar", "btn", trustedClick(input, input.actions.retry), state.busy);
  switch (kind) {
    case "no-token": body.append(note(CONNECT_FROM_CRM, "info"), crmLink(input, el)); break;
    case "rejected": body.append(note(`Token inválido o revocado. ${CONNECT_FROM_CRM}`), crmLink(input, el)); break;
    case "outdated": body.append(note("Esta versión del script ya no funciona con el CRM."), link(el, "Actualizar", `${input.base}/userscripts/hospeda-crm.user.js`, "btn primary")); break;
    case "connection": body.append(note("No se pudo consultar el CRM."), retry()); break;
    case "loading": body.append(el("p", "muted", "Conectando con el CRM…")); break;
    case "unconfigured": body.append(note("Falta configurar la cuenta de Instagram de Hospeda en el CRM.")); break;
    case "mismatch": body.append(note(`Estás con la cuenta @${state.loggedIn}. Entrá con la cuenta de Instagram de Hospeda para usar el script.`)); break;
    case "account-unknown": body.append(note("No pude leer con qué cuenta de Instagram estás. Recargá la página y volvé a intentar.")); break;
    case "confirm": {
      body.append(el("p", "name", `¿Este chat es con @${username}?`), el("p", "muted", "No pude confirmarlo solo. Si es el chat de ese negocio, confirmalo y pego el mensaje que copió el CRM."));
      if (state.error) body.append(note(state.error));
      const actions = el("div", "actions");
      actions.append(button(el, state.busy ? "Procesando…" : "Sí, es este chat · pegar", "btn primary", trustedClick(input, input.actions.confirmChat), state.busy), button(el, "No es este chat", "btn", trustedClick(input, input.actions.rejectChat), state.busy));
      body.append(actions); break;
    }
    case "unproven": body.append(note("No pude confirmar con quién es este chat.", "info")); break;
    case "searching": body.append(el("p", "muted", "Buscando el negocio…")); break;
    case "none": body.append(el("p", undefined, `No encontré un negocio con @${username} en el CRM.`), link(el, "Buscar o crear en el CRM", instagramSearchOrCreateUrl({ base: input.base, username }))); break;
    case "hidden": body.append(note("Este Instagram está en un negocio que no podés ver. Consultá a un administrador antes de escribirle.")); break;
    case "multiple": {
      const matches = state.context?.kind === "ok" ? state.context.value.matches : [], field = el("label", "field", "Hay varios negocios con este Instagram"), select = el("select");
      const placeholder = el("option", undefined, "Elegí el negocio"); placeholder.value = ""; select.append(placeholder);
      for (const match of matches) { const option = el("option", undefined, `${match.code} · ${match.name}`); option.value = match.accountId; select.append(option); }
      select.addEventListener("change", event => { if (select.value && input.actions.trusted(event)) input.actions.select(select.value); });
      field.append(select); body.append(field); break;
    }
    case "business": body.append(...business(input, el, selectedMatch(state)!, username)); break;
  }
  return body;
}

function business(input: PanelInput, el: El, match: InstagramMatch, username: string): HTMLElement[] {
  const { state } = input, nodes: HTMLElement[] = [];
  const matches = state.context?.kind === "ok" ? state.context.value.matches : [];
  if (matches.length > 1) {
    const field = el("label", "field", "Hay varios negocios con este Instagram"), select = el("select");
    for (const item of matches) { const option = el("option", undefined, `${item.code} · ${item.name}`); option.value = item.accountId; option.selected = item.accountId === match.accountId; select.append(option); }
    select.addEventListener("change", event => { if (input.actions.trusted(event)) input.actions.select(select.value); }); field.append(select); nodes.push(field);
  }
  nodes.push(el("div", "eyebrow", [match.code, match.city].filter(Boolean).join(" · ")), el("div", "name", match.name));
  const chips = el("div", "chips");
  if (match.assignedUserName) chips.append(el("span", "chip", `Responsable: ${match.assignedUserName}`));
  if (match.statusLabel) chips.append(el("span", "chip", match.statusLabel));
  chips.append(el("span", "chip", match.leads.length === 1 ? "1 gestión abierta" : `${match.leads.length} gestiones abiertas`));
  nodes.push(chips);
  const seller = state.sellerConfirmed && state.sellerConfirmed.threadId === state.threadId && !(state.proof?.ok) ? state.sellerConfirmed.by : null;
  nodes.push(el("p", "muted", seller ? `@${username} · confirmado por ${seller}` : `@${username} · chat verificado`));
  if (match.doNotContact) nodes.push(el("p", "note danger", NOT_CONTACT_NOTE));
  const reason = contactBlockReason(match), actions = el("div", "actions");
  const send = button(el, "Mandar un mensaje", "btn primary", trustedClick(input, () => input.actions.compose(match)), !!reason);
  if (reason) send.title = reason;
  actions.append(send);
  if (input.actions.sendMaterial) { const sendMaterial = input.actions.sendMaterial, material = button(el, "Enviar material", "btn", trustedClick(input, () => sendMaterial(match)), !!reason); if (reason) material.title = reason; actions.append(material); }
  actions.append(link(el, "Abrir en CRM", match.url)); nodes.push(actions);
  if (reason && !match.doNotContact) nodes.push(el("p", "note warn", reason));
  return nodes;
}

function settings(input: PanelInput, el: El): HTMLElement {
  const { state } = input, body = el("div", "body");
  const connection = el("div", "section"); connection.append(el("h3", undefined, "CONEXIÓN"));
  if (!state.token) connection.append(el("p", "muted", CONNECT_FROM_CRM), crmLink(input, el));
  else if (state.status.kind === "ok") connection.append(el("p", undefined, `Conectado como ${state.status.value.user.displayName}`));
  else if (state.status.kind === "rejected") connection.append(el("p", "note warn", `Token inválido o revocado. ${CONNECT_FROM_CRM}`), crmLink(input, el));
  else if (state.status.kind === "outdated") connection.append(el("p", "note warn", "Esta versión del script ya no funciona con el CRM."));
  else if (state.status.kind === "error") connection.append(el("p", "note warn", state.status.message));
  else connection.append(el("p", "muted", "Conectando con el CRM…"));
  const script = el("div", "section"); script.append(el("h3", undefined, "SCRIPT"));
  const latest = state.status.kind === "ok" ? state.status.value.latestVersion : undefined;
  if (latest && compareSemver(latest, input.version) > 0) { const box = el("div", "note update"); box.append(el("span", undefined, `Hay una versión nueva del script (${latest})`), link(el, "Actualizar", `${input.base}/userscripts/hospeda-crm.user.js`)); script.append(box); }
  else script.append(el("p", undefined, `Versión ${input.version}${latest ? " · al día" : ""}`));
  const theme = el("div", "section"), field = el("label", "field", "Tema"), select = el("select"); theme.append(el("h3", undefined, "APARIENCIA"));
  for (const [value, label] of [["auto", "Automático"], ["light", "Claro"], ["dark", "Oscuro"]] as const) { const option = el("option", undefined, label); option.value = value; option.selected = input.theme === value; select.append(option); }
  select.addEventListener("change", () => input.actions.setTheme(select.value as PanelTheme)); field.append(select); theme.append(field);
  const toggle = el("label", "field toggle", "Mostrar insignias en la lista de chats"), check = el("input"); check.type = "checkbox"; check.checked = input.badges ?? true;
  check.addEventListener("change", () => input.actions.setBadges(check.checked)); toggle.prepend(check); theme.append(toggle);
  const back = button(el, "Volver", "btn", () => input.actions.view("main"));
  body.append(connection, script, theme, back); return body;
}
