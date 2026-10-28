/**
 * Spec 94 §2.2: finds the profile's «Enviar mensaje» button and the DM composer by role and accessible name, never by Instagram's
 * obfuscated class names or generated ids. Pure DOM queries, testable against the fixtures in `userscript/fixtures/instagram-*.html`.
 */

/** Lowercase, no accents, collapsed spaces, no trailing ellipsis: «Mensaje…» and «mensaje...» compare equal. */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase().replace(/(…|\.{2,})$/, "").trim();
}

/** Accessible names of the profile's message button, normalized (Spanish and English). «Mensajes» / «Messages» never match. */
export const MESSAGE_BUTTON_NAMES: readonly string[] = ["enviar mensaje", "message", "mensaje"];
/** Accessible labels of the DM composer, normalized. The search box («Buscar» / «Search») never matches. */
export const COMPOSER_LABELS: readonly string[] = ["mensaje", "message", "escribe un mensaje", "escribi un mensaje", "envia un mensaje", "write a message", "send a message"];

/** Hidden by attribute, `inert` or inline/computed style on the element or an ancestor. Layout-free, so it also works in tests. */
export function isHidden(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true" || node.hasAttribute("inert")) return true;
    const style = view?.getComputedStyle(node);
    if (style && (style.display === "none" || style.visibility === "hidden")) return true;
  }
  return false;
}

function labelledBy(el: Element): string {
  const ids = el.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
  return ids.map(id => el.ownerDocument.getElementById(id)?.textContent ?? "").join(" ");
}

/** `aria-label`, else `aria-labelledby`, else the visible text. */
export function accessibleName(el: Element): string {
  return normalizeName(el.getAttribute("aria-label") || labelledBy(el) || el.textContent);
}

/** The label of an editable element: `aria-label`, `aria-placeholder`, `placeholder` or `aria-labelledby`, whichever is set first. */
export function composerLabel(el: Element): string {
  return normalizeName(el.getAttribute("aria-label") || el.getAttribute("aria-placeholder") || el.getAttribute("placeholder") || labelledBy(el));
}

/** The visible «Enviar mensaje» / «Message» button of the profile, inside `main` when there is one; null when there is none yet. */
export function findMessageButton({ doc }: { doc: Document }): HTMLElement | null {
  const scope: ParentNode = doc.querySelector("main") ?? doc;
  for (const el of scope.querySelectorAll<HTMLElement>('button, [role="button"], a')) {
    if (MESSAGE_BUTTON_NAMES.includes(accessibleName(el)) && !isHidden(el)) return el;
  }
  return null;
}

/** The visible DM composer (contenteditable, textbox or textarea) labelled «Mensaje» / «Message»; null while it has not appeared. */
export function findComposer({ doc }: { doc: Document }): HTMLElement | null {
  for (const el of doc.querySelectorAll<HTMLElement>('[contenteditable="true"], [role="textbox"], textarea')) {
    if (COMPOSER_LABELS.includes(composerLabel(el)) && !isHidden(el)) return el;
  }
  return null;
}

/** The composer's text (a textarea's value, else its text content). */
export function composerText(el: HTMLElement): string {
  return el.tagName === "TEXTAREA" ? (el as HTMLTextAreaElement).value : el.textContent ?? "";
}
