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

/**
 * The visible «Enviar mensaje» / «Message» button of the profile header (`main header`, else the first `header`); null when there is
 * none yet. Buttons are preferred over links, and nothing outside the header counts, so a story highlight or a post titled «Mensaje»
 * cannot match.
 */
export function findMessageButton({ doc }: { doc: Document }): HTMLElement | null {
  const header = doc.querySelector("main header") ?? doc.querySelector("header");
  if (!header) return null;
  for (const selector of ['button, [role="button"]', "a"]) {
    for (const el of header.querySelectorAll<HTMLElement>(selector)) if (MESSAGE_BUTTON_NAMES.includes(accessibleName(el)) && !isHidden(el)) return el;
  }
  return null;
}

/** Every visible DM composer (contenteditable, textbox or textarea) labelled «Mensaje» / «Message», in document order. */
export function findComposers({ doc }: { doc: Document }): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>('[contenteditable="true"], [role="textbox"], textarea')].filter(el => COMPOSER_LABELS.includes(composerLabel(el)) && !isHidden(el));
}
/** The first visible DM composer, or null. */
export function findComposer({ doc }: { doc: Document }): HTMLElement | null { return findComposers({ doc })[0] ?? null; }

/** A DM thread page: `/direct/t/<id>/`. */
export const isThreadPath = (pathname: string): boolean => /^\/direct\/t\/[^/]+\/?$/.test(pathname);
const FLOATING = '[role="dialog"], aside, [role="complementary"]';

/** Normalized words of a label, without a leading «@»: «Chat con @Hotel.Sol» → [chat, con, hotel.sol]. */
const labelWords = (value: string | null | undefined) => normalizeName(value).split(" ").map(word => word.replace(/^@/, ""));
/** Message lists and bubbles: their text is written by other people and never identifies a chat. */
const MESSAGE_CONTENT = '[role="grid"], [role="log"], [role="list"], [role="listitem"], [role="row"], [role="gridcell"], [role="article"]';

/**
 * True when a floating chat box is labelled for `username` by its own label or header: the box's `aria-label` / `aria-labelledby`, or
 * a heading (`header`, `[role="heading"]`, `h1`–`h3`) outside the message list. Message content never counts, so a chat with somebody who
 * sends «@<target>» cannot pass as the target's chat.
 */
function labelledFor({ box, username }: { box: Element; username: string }): boolean {
  if (labelWords(box.getAttribute("aria-label")).includes(username) || labelWords(labelledBy(box)).includes(username)) return true;
  for (const heading of box.querySelectorAll('header, [role="heading"], h1, h2, h3')) {
    if (heading.closest(MESSAGE_CONTENT)) continue;
    if (normalizeName(heading.textContent).replace(/^@/, "") === username) return true;
  }
  return false;
}

/**
 * Spec 94 M2: the composer of the thread that the click on «Enviar mensaje» just opened for `username`, or null while it cannot be
 * verified. When the click moved the page to `/direct/t/<id>/`, only the page's own (non-floating) composer is accepted: never a
 * floating mini-chat. Without that URL signal, only a floating chat box whose own label or header names `username` is accepted. Anything
 * else is not pasted into (the flow shows a notice).
 */
export function findThreadComposer({ doc, pathname, startPath, username }: { doc: Document; pathname: string; startPath: string; username: string }): HTMLElement | null {
  const composers = findComposers({ doc });
  if (pathname !== startPath && isThreadPath(pathname)) return composers.find(composer => !composer.closest(FLOATING)) ?? null;
  for (const composer of composers) {
    const box = composer.closest(FLOATING);
    if (box && labelledFor({ box, username })) return composer;
  }
  return null;
}

/** The composer's text (a textarea's value, else its text content). */
export function composerText(el: HTMLElement): string {
  return el.tagName === "TEXTAREA" ? (el as HTMLTextAreaElement).value : el.textContent ?? "";
}
