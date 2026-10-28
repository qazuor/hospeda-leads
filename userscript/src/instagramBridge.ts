import { HANDOFF_ACK_ATTRIBUTE, HANDOFF_ACK_EVENT, HANDOFF_EVENT, HANDOFF_STORAGE_KEY, parseHandoff } from "./instagram/handoff";
import type { HandoffStore } from "./instagram/start";

/**
 * Spec 94 (D6): the GM side of the Instagram handoff, kept outside `instagram/` so that module never touches GM storage itself. It crosses
 * Tampermonkey's sandbox the way `announce.ts` does: the CRM page dispatches an event on `document` whose `detail` is a JSON string, and
 * the script acks through an attribute on `<html>`. No object identity (`event.source`) is involved, so it works with `@grant` set.
 */

/** The handoff key and nothing else: the Instagram module gets this, never the token or any other value. */
export function gmHandoffStore(): HandoffStore {
  return {
    read: () => GM_getValue<unknown>(HANDOFF_STORAGE_KEY, null),
    // Compare-and-delete: a tab only removes the handoff of its own nonce, never a newer one another «Abrir Instagram» stored.
    clear: ({ nonce }) => { const current = GM_getValue<{ nonce?: unknown } | null>(HANDOFF_STORAGE_KEY, null); if (current?.nonce === nonce) GM_setValue(HANDOFF_STORAGE_KEY, null); },
  };
}

/** Longest `detail` accepted: the handoff text is capped at 4000 characters, so anything much larger is not a handoff. */
const MAX_DETAIL = 40_000;

/**
 * On the CRM page: stores a valid handoff dispatched on this document (a new one replaces the previous: the latest «Abrir Instagram»
 * wins) and acks it with its nonce. Malformed, oversized or non-string details are ignored and never acked.
 */
export function listenForInstagramHandoff({ doc = document, save = (value: unknown) => GM_setValue(HANDOFF_STORAGE_KEY, value) }: { doc?: Document; save?: (value: unknown) => void } = {}): void {
  doc.addEventListener(HANDOFF_EVENT, event => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (typeof detail !== "string" || detail.length > MAX_DETAIL) return;
    let value: unknown;
    try { value = JSON.parse(detail); } catch { return; }
    const handoff = parseHandoff({ value });
    if (!handoff) return;
    save({ ...handoff });
    doc.documentElement.setAttribute(HANDOFF_ACK_ATTRIBUTE, handoff.nonce);
    doc.dispatchEvent(new Event(HANDOFF_ACK_EVENT));
  });
}
