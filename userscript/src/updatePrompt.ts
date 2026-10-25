import { PANEL_CSS } from "./styles";
import { LOGO_SRC } from "./logo";
import { compareSemver } from "./parse";

export const UPDATE_PROMPT_ID = "hospeda-userscript-update";
const SNOOZE_KEY = "hospeda-userscript-update-snooze", SNOOZE_MS = 24 * 60 * 60_000;
const PROMPT_CSS = `
.prompt{position:fixed;left:72px;bottom:24px;z-index:2147483001;width:min(340px,calc(100vw - 88px));display:flex;flex-direction:column;gap:10px;padding:14px;background:var(--hc-bg);border:1px solid var(--hc-border);border-radius:14px;box-shadow:0 12px 32px -12px #000a}
.prompt.required{border-color:var(--hc-amber)}
.head{display:flex;align-items:center;gap:10px}
.head img{width:28px;height:28px;border-radius:50%;object-fit:cover;flex:none}
.head strong{font-size:14px}
.prompt .actions .btn{flex:1}
`;
let dismissedThisPage = "";

/** A snooze lasts a day and only for the version it was given for: a newer release asks again. */
function snoozed(version: string): boolean {
  const value = GM_getValue<string>(SNOOZE_KEY, ""), [snoozedVersion, until] = value.split("|");
  return snoozedVersion === version && Number(until) > Date.now();
}
export function updateTarget(input: { installed: string; latest?: string | null; required?: string | null }): string | null {
  if (input.required) return input.required;
  return input.latest && compareSemver(input.latest, input.installed) > 0 ? input.latest : null;
}

/**
 * Tells the seller about a newer script without waiting for the panel to be opened. A version the server already rejects cannot be snoozed
 * for a day, only hidden until the next page load, because nothing works until it is updated.
 */
export function showUpdatePrompt(input: { installed: string; latest?: string | null; required?: string | null; crmBase: string; dark: boolean }): HTMLElement | null {
  const target = updateTarget(input), existing = document.getElementById(UPDATE_PROMPT_ID);
  if (!target || dismissedThisPage === target || (!input.required && snoozed(target))) { existing?.remove(); return null; }
  if (existing?.dataset.version === target && existing.dataset.required === String(!!input.required)) { existing.classList.toggle("dark", input.dark); return existing; }
  existing?.remove();
  const host = document.createElement("hospeda-crm-update"), shadow = host.attachShadow({ mode: "open" }), el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
  host.id = UPDATE_PROMPT_ID; host.dataset.version = target; host.dataset.required = String(!!input.required); host.classList.toggle("dark", input.dark);
  const style = el("style"); style.textContent = PANEL_CSS + PROMPT_CSS;
  const box = el("section", `prompt${input.required ? " required" : ""}`); box.setAttribute("role", "status"); box.setAttribute("aria-label", "Actualización de Hospeda CRM");
  const head = el("div", "head"), logo = el("img"); logo.src = LOGO_SRC; logo.alt = ""; head.append(logo, el("strong", undefined, input.required ? "Actualizá el script de Hospeda" : "Hay una versión nueva de Hospeda"));
  const text = el("p", "muted", input.required ? `La versión ${input.installed} ya no funciona con el CRM. Instalá la ${target} para seguir registrando mensajes.` : `Tenés la ${input.installed}; la nueva es la ${target}. Después de actualizar, recargá WhatsApp.`);
  const actions = el("div", "actions"), update = el("a", "btn primary", "Actualizar"), later = el("button", "btn", "Más tarde");
  update.href = `${input.crmBase}/userscripts/hospeda-crm.user.js`; update.target = "_blank"; update.rel = "noopener noreferrer";
  update.addEventListener("click", () => { dismissedThisPage = target; host.remove(); });
  later.type = "button"; later.addEventListener("click", () => { dismissedThisPage = target; if (!input.required) GM_setValue(SNOOZE_KEY, `${target}|${Date.now() + SNOOZE_MS}`); host.remove(); });
  actions.append(update, later); box.append(head, text, actions); shadow.append(style, box); document.body.append(host); return host;
}
/** Runs `check` at most once per `gapMs`, so flipping between tabs does not hit the CRM on every switch. */
export function throttled(check: () => void, gapMs: number, now: () => number = Date.now): () => void {
  let last = -Infinity; return () => { const at = now(); if (at - last < gapMs) return; last = at; check(); };
}
/** Test hook: a new page load forgets what was hidden on this one. */
export function resetUpdatePrompt(): void { dismissedThisPage = ""; document.getElementById(UPDATE_PROMPT_ID)?.remove(); }
