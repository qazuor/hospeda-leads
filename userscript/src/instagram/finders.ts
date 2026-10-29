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
/** Floating containers (Instagram's mini-chat and side dialogs): nothing inside them is ever read as proof or written into. */
export const FLOATING = '[role="dialog"], aside, [role="complementary"]';
const EDITABLE = '[contenteditable="true"], [role="textbox"], textarea';

/**
 * Spec 97 §4.4 / 9.1: the open conversation's pane, the page's `role="main"` (never a floating chat). Several visible ones (a re-render in
 * progress) narrow to the one holding an editor; anything still ambiguous is null, so nothing is proven or pasted.
 */
export function conversationPane({ doc }: { doc: Document }): HTMLElement | null {
  const panes = [...doc.querySelectorAll<HTMLElement>('[role="main"]')].filter(pane => !pane.closest(FLOATING) && !isHidden(pane));
  if (panes.length <= 1) return panes[0] ?? null;
  const withEditor = panes.filter(pane => pane.querySelector(EDITABLE));
  return withEditor.length === 1 ? withEditor[0] : null;
}

/**
 * Spec 97 §9.1 item 2: the chat page's own composer. Live it is one `contenteditable` Lexical editor without `aria-label`, so it is located inside
 * the conversation pane instead of by label: a visible editor that is Lexical, a textbox or labelled like spec 94's composer, outside any floating
 * container. Exactly one must exist; none or several is null (never guess between two editors).
 */
export function findPageComposer({ doc }: { doc: Document }): HTMLElement | null {
  const pane = conversationPane({ doc }); if (!pane) return null;
  const editors = [...pane.querySelectorAll<HTMLElement>(EDITABLE)].filter(el => !el.closest(FLOATING) && !isHidden(el) && (el.hasAttribute("data-lexical-editor") || el.getAttribute("role") === "textbox" || COMPOSER_LABELS.includes(composerLabel(el))));
  return editors.length === 1 ? editors[0] : null;
}

/** Accessible names of the floating chat's button that opens the full chat page (9.1 item 3; English to confirm live). */
export const EXPAND_NAMES: readonly string[] = ["expandir", "expand"];
/** Every visible «Expandir» / «Expand» button (button, `role="button"` or link) in document order. */
export function expandButtons({ doc }: { doc: Document }): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>('button, [role="button"], a')].filter(el => EXPAND_NAMES.includes(accessibleName(el)) && !isHidden(el));
}
/**
 * Spec 97 §4.2 step 3 with 9.1: the floating chat opened by the click on «Enviar mensaje» has no link to `/direct/t/<id>/`, but its «Expandir»
 * button navigates there. Only a button that was **not** on the page before the click counts (`before`), so an older floating chat with
 * somebody else is never expanded. Its composer is never used: the paste happens on the chat page after the proof.
 */
export function findFloatingExpand({ doc, before }: { doc: Document; before: ReadonlySet<Element> }): HTMLElement | null {
  return expandButtons({ doc }).find(el => !before.has(el) && !el.closest('[role="main"] header, main header')) ?? null;
}

/** The composer's text (a textarea's value, else its text content). */
export function composerText(el: HTMLElement): string {
  return el.tagName === "TEXTAREA" ? (el as HTMLTextAreaElement).value : el.textContent ?? "";
}
