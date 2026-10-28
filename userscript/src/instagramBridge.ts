import { HANDOFF_MESSAGE_TYPE, HANDOFF_STORAGE_KEY, parseHandoff } from "./instagram/handoff";
import type { HandoffStore } from "./instagram/start";

/**
 * Spec 94 (D6): the GM side of the Instagram handoff, kept outside `instagram/` so that module never touches GM storage itself. On the
 * CRM page the script accepts the handoff message from the same window and origin only; on Instagram it exposes just that one key.
 */

/** The handoff key and nothing else: the Instagram module gets this, never the token or any other value. */
export function gmHandoffStore(): HandoffStore {
  return { read: () => GM_getValue<unknown>(HANDOFF_STORAGE_KEY, null), clear: () => GM_setValue(HANDOFF_STORAGE_KEY, null) };
}

/** On the CRM page: stores a valid handoff posted by the page itself. Messages from frames, other windows or other origins are ignored. */
export function listenForInstagramHandoff({ win = window, save = (value: unknown) => GM_setValue(HANDOFF_STORAGE_KEY, value) }: { win?: Window; save?: (value: unknown) => void } = {}): void {
  win.addEventListener("message", event => {
    if (event.source !== win || event.origin !== win.location.origin) return;
    const data = event.data as { type?: unknown } | null;
    if (!data || data.type !== HANDOFF_MESSAGE_TYPE) return;
    const handoff = parseHandoff({ value: data });
    if (handoff) save({ ...handoff });
  });
}
