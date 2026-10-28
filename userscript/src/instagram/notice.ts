import type { FlowFailure } from "./flow";

/**
 * Spec 94 §2.3: the small notice shown on Instagram. Built with DOM APIs and inline style properties inside a shadow root (no
 * `innerHTML`, no `<style>`), so Instagram's Content-Security-Policy and Trusted Types cannot block it.
 */
export const NOTICE_ID = "hospeda-instagram-notice";
export const NOTICE_MS = 8000;
export const PASTED_NOTICE = "Mensaje pegado. Revisalo y envialo vos.";
export const FAILURE_NOTICES: Readonly<Record<FlowFailure, string>> = {
  "no-button": 'No encontré el botón "Enviar mensaje". Abrí el chat y pegá el mensaje con Ctrl+V.',
  "navigated-away": "Cambiaste de página antes de que se abriera el chat, así que no pegué nada. Pegá el mensaje con Ctrl+V.",
  "composer-timeout": "No se abrió el chat a tiempo. Cuando se abra, pegá el mensaje con Ctrl+V.",
  "thread-unverified": "No pude confirmar que el chat abierto sea el de este perfil, así que no pegué nada. Pegá el mensaje con Ctrl+V.",
  "composer-busy": "El chat ya tenía texto escrito, así que no pegué nada. Si hace falta, pegá el mensaje con Ctrl+V.",
  "insert-failed": "No pude pegar el mensaje: pegalo con Ctrl+V.",
};
/** Spec 94 M3: a well-formed marker without a valid handoff (missing, expired, for another profile or superseded). Fixed text: no click, no read. */
export const UNCONFIRMED_NOTICE = 'No pude confirmar que lo abrió el CRM: tocá "Enviar mensaje" y pegá el mensaje (Ctrl+V).';

/** «Ctrl+V» becomes «⌘V» on macOS. */
export function pasteShortcut({ text, platform }: { text: string; platform: string }): string {
  return /Mac|iPhone|iPad/i.test(platform) ? text.replace(/Ctrl\+V/g, "⌘V") : text;
}

/** Shows (or replaces) the notice for `NOTICE_MS`, with a close button. Returns its host element. */
export function showNotice({ doc, text, tone }: { doc: Document; text: string; tone: "success" | "warning" }): HTMLElement {
  doc.getElementById(NOTICE_ID)?.remove();
  const host = doc.createElement("hospeda-instagram-notice"), shadow = host.attachShadow({ mode: "open" });
  host.id = NOTICE_ID;
  Object.assign(host.style, { position: "fixed", left: "50%", bottom: "24px", transform: "translateX(-50%)", zIndex: "2147483647" });
  const box = doc.createElement("div");
  box.setAttribute("role", tone === "warning" ? "alert" : "status");
  Object.assign(box.style, { display: "flex", alignItems: "center", gap: "12px", maxWidth: "min(440px, calc(100vw - 32px))", padding: "10px 12px 10px 14px", borderRadius: "10px", background: "#18212f", color: "#fff", font: "14px/1.4 system-ui, sans-serif", boxShadow: "0 10px 28px -10px #000a", borderLeft: `4px solid ${tone === "warning" ? "#f5a524" : "#2fb67c"}` });
  const message = doc.createElement("span"); message.textContent = text;
  const close = doc.createElement("button"); close.type = "button"; close.textContent = "×"; close.setAttribute("aria-label", "Cerrar aviso");
  Object.assign(close.style, { background: "transparent", border: "0", color: "#fff", font: "20px/1 system-ui, sans-serif", cursor: "pointer", padding: "0 2px" });
  const timer = setTimeout(() => host.remove(), NOTICE_MS);
  close.addEventListener("click", () => { clearTimeout(timer); host.remove(); });
  box.append(message, close); shadow.append(box); (doc.body ?? doc.documentElement).append(host);
  return host;
}
