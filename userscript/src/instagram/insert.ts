import { composerText } from "./finders";

/**
 * Spec 94 §2.2 (D3): puts the handoff text into Instagram's DM editor without ever sending. First a synthetic `paste`
 * event carrying a `DataTransfer` (Instagram's Lexical editor handles it like a real paste, line breaks included); if the editor
 * stayed empty, `document.execCommand('insertText')`. No key events are dispatched, so there is no path to Enter.
 */

/** Text compared without whitespace: the editor renders line breaks as `<br>` or paragraphs, which `textContent` drops. */
const squash = (text: string) => text.replace(/\s+/g, "");
/** True when the composer shows exactly `text` (whitespace ignored): no more, no less. */
export function composerHas({ composer, text }: { composer: HTMLElement; text: string }): boolean {
  const expected = squash(text);
  return expected.length > 0 && squash(composerText(composer)) === expected;
}
/** True when the composer has no text (an empty Lexical editor is `<p><br></p>`). */
export function composerEmpty(composer: HTMLElement): boolean { return squash(composerText(composer)) === ""; }

/** A `paste` event with `text/plain`. Uses the browser's `ClipboardEvent` + `DataTransfer`; without them, a plain event with a minimal `clipboardData`. */
export function pasteEvent({ text, view }: { text: string; view: Window & typeof globalThis }): Event {
  try {
    const data = new view.DataTransfer(); data.setData("text/plain", text);
    const event = new view.ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
    if (event.clipboardData?.getData("text/plain") === text) return event;
  } catch { /* falls through to the minimal event */ }
  const event = new view.Event("paste", { bubbles: true, cancelable: true });
  const data = { types: ["text/plain"], files: [], items: [], getData: (type: string) => (type === "text/plain" || type === "text" ? text : "") };
  Object.defineProperty(event, "clipboardData", { value: data });
  return event;
}

/** Focuses the composer and puts the caret at its end, so the editor has a selection to paste into. */
export function focusComposer(composer: HTMLElement): void {
  composer.focus();
  const doc = composer.ownerDocument, selection = doc.getSelection?.();
  if (!selection || composer.tagName === "TEXTAREA") return;
  const range = doc.createRange(); range.selectNodeContents(composer); range.collapse(false);
  selection.removeAllRanges(); selection.addRange(range);
}

export type InsertMethod = "paste" | "insertText";
export type InsertResult = { readonly ok: true; readonly method: InsertMethod } | { readonly ok: false; readonly reason: "failed" | "different" };

/**
 * Inserts `text` into an empty, focused composer. `settle` waits for the editor to update its DOM. A second method only runs when the
 * first left the composer empty: if it left anything else, trying again would duplicate the text, and the failure is `different`
 * (the editor transformed or truncated the text): the seller must review it, not paste again.
 */
export async function insertIntoComposer({ composer, text, settle }: { composer: HTMLElement; text: string; settle: () => Promise<void> }): Promise<InsertResult> {
  const doc = composer.ownerDocument, view = doc.defaultView as (Window & typeof globalThis) | null;
  if (view) { composer.dispatchEvent(pasteEvent({ text, view })); await settle(); }
  if (composerHas({ composer, text })) return { ok: true, method: "paste" };
  if (!composerEmpty(composer)) return { ok: false, reason: "different" };
  focusComposer(composer);
  try { doc.execCommand?.("insertText", false, text); } catch { /* reported below */ }
  await settle();
  if (composerHas({ composer, text })) return { ok: true, method: "insertText" };
  return { ok: false, reason: composerEmpty(composer) ? "failed" : "different" };
}
