import type { FlowFailure } from "./flow";

/**
 * Spec 94 §2.3: the small notice shown on Instagram. Built with DOM APIs and inline style properties inside a shadow root (no
 * `innerHTML`, no `<style>`), so Instagram's Content-Security-Policy and Trusted Types cannot block it.
 */
export const NOTICE_ID = "hospeda-instagram-notice";
export const NOTICE_MS = 8000;
export const PASTED_NOTICE = "Mensaje pegado. Revisalo y envialo vos.";
/** Spec 94 §2.3 and spec 97 §4.6: one notice per failure. `thread-contradicted` names the username, so it is built by `failureNotice`. */
export const FAILURE_NOTICES: Readonly<Record<Exclude<FlowFailure, "thread-contradicted">, string>> = {
  "no-button": 'No encontré el botón "Enviar mensaje". Abrí el chat y pegá el mensaje con Ctrl+V.',
  "navigated-away": "Cambiaste de página antes de que se abriera el chat, así que no pegué nada. Pegá el mensaje con Ctrl+V.",
  "floating-no-link": "Instagram abrió un chat flotante. Abrilo en pantalla completa y pego el mensaje.",
  "thread-unproven": "No pude confirmar con quién es este chat, así que no pegué nada. Pegá el mensaje con Ctrl+V.",
  "other-account": "Estás con otra cuenta de Instagram. Entrá con la de Hospeda y pegá el mensaje con Ctrl+V.",
  "account-unknown": "No pude comprobar que estés con la cuenta de Instagram de Hospeda, así que no pegué nada. Pegá el mensaje con Ctrl+V.",
  "composer-timeout": "No se abrió el chat a tiempo. Cuando se abra, pegá el mensaje con Ctrl+V.",
  "composer-busy": "El chat ya tenía texto escrito, así que no pegué nada. Si hace falta, pegá el mensaje con Ctrl+V.",
  "insert-failed": "No pude pegar el mensaje: pegalo con Ctrl+V.",
  // No Ctrl+V here: the editor already holds (a version of) the text, pasting again would duplicate it.
  "text-differs": "Se insertó un texto distinto: revisalo antes de enviar.",
};
/** The notice of a failure; a contradicted chat names the username the CRM opened. */
export function failureNotice({ reason, username }: { reason: FlowFailure; username: string }): string {
  return reason === "thread-contradicted" ? `Este chat ya no es de @${username}. Abrí el perfil y tocá "Enviar mensaje"; el mensaje está copiado.` : FAILURE_NOTICES[reason];
}
/** Spec 94 M3: a well-formed marker without a valid handoff (missing, expired, for another profile or superseded). Fixed text: no click, no read. */
export const UNCONFIRMED_NOTICE = 'No pude confirmar que lo abrió el CRM: tocá "Enviar mensaje" y pegá el mensaje (Ctrl+V).';

/** «Ctrl+V» becomes «⌘V» on macOS. */
export function pasteShortcut({ text, platform }: { text: string; platform: string }): string {
  return /Mac|iPhone|iPad/i.test(platform) ? text.replace(/Ctrl\+V/g, "⌘V") : text;
}

/** Shows (or replaces) the notice for `NOTICE_MS`, with a close button. Returns its host element. */
/** An optional link of a notice: only Instagram profile URLs built by the script (`https://www.instagram.com/<user>/`). */
export type NoticeLink = { readonly text: string; readonly href: string };
const PROFILE_URL = /^https:\/\/www\.instagram\.com\/[a-z0-9._]{1,30}\/$/;

export function showNotice({ doc, text, tone, link }: { doc: Document; text: string; tone: "success" | "warning"; link?: NoticeLink }): HTMLElement {
  doc.getElementById(NOTICE_ID)?.remove();
  const host = doc.createElement("hospeda-instagram-notice"), shadow = host.attachShadow({ mode: "open" });
  host.id = NOTICE_ID;
  Object.assign(host.style, { position: "fixed", left: "50%", bottom: "24px", transform: "translateX(-50%)", zIndex: "2147483647" });
  const box = doc.createElement("div");
  box.setAttribute("role", tone === "warning" ? "alert" : "status");
  Object.assign(box.style, { display: "flex", alignItems: "center", gap: "12px", maxWidth: "min(440px, calc(100vw - 32px))", padding: "10px 12px 10px 14px", borderRadius: "10px", background: "#18212f", color: "#fff", font: "14px/1.4 system-ui, sans-serif", boxShadow: "0 10px 28px -10px #000a", borderLeft: `4px solid ${tone === "warning" ? "#f5a524" : "#2fb67c"}` });
  const message = doc.createElement("span"); message.textContent = text;
  if (link && PROFILE_URL.test(link.href)) {
    const anchor = doc.createElement("a"); anchor.href = link.href; anchor.textContent = link.text; anchor.rel = "noopener noreferrer";
    Object.assign(anchor.style, { color: "#9cc3ff", marginLeft: "6px", fontWeight: "600" }); message.append(" ", anchor);
  }
  const close = doc.createElement("button"); close.type = "button"; close.textContent = "×"; close.setAttribute("aria-label", "Cerrar aviso");
  Object.assign(close.style, { background: "transparent", border: "0", color: "#fff", font: "20px/1 system-ui, sans-serif", cursor: "pointer", padding: "0 2px" });
  const timer = setTimeout(() => host.remove(), NOTICE_MS);
  close.addEventListener("click", () => { clearTimeout(timer); host.remove(); });
  box.append(message, close); shadow.append(box); (doc.body ?? doc.documentElement).append(host);
  return host;
}
