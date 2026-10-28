import { consumePasteMarker } from "./marker";
import { checkHandoff, parseHandoff } from "./handoff";
import { pollFor, runPasteFlow, type FlowDeps, type FlowResult } from "./flow";
import { FAILURE_NOTICES, PASTED_NOTICE, UNCONFIRMED_NOTICE, pasteShortcut, showNotice } from "./notice";

/**
 * Spec 94: entry of the Instagram module of the shared «Hospeda CRM» script (`main.ts` routes `www.instagram.com` here). Isolated on
 * purpose (§2.4): it imports only its own files, never calls the CRM or the network, never reads the clipboard, and reads only the
 * one-time handoff through the injected `store` (never the token). Without a well-formed marker it does nothing beyond this check and a
 * `hashchange` listener.
 */

/** The pending handoff, as stored by the script on the CRM page. `clear` is compare-and-delete: only the handoff of that nonce. */
export type HandoffStore = { readonly read: () => unknown; readonly clear: (input: { readonly nonce: string }) => void };

export type InstagramStartDeps = {
  readonly store: HandoffStore;
  readonly win?: Window & typeof globalThis;
  readonly flow?: Partial<Omit<FlowDeps, "doc" | "location" | "username" | "text">>;
  /** How long to wait for the handoff to reach this tab (GM storage syncs between tabs asynchronously). */
  readonly handoffWaitMs?: number;
  readonly onResult?: (result: FlowResult | { readonly ok: false; readonly reason: "unconfirmed" }) => void;
};

/** Starts the module: one run per marker, never two at once. */
export function startInstagram({ store, win = window, flow = {}, handoffWaitMs = 3000, onResult }: InstagramStartDeps): void {
  let running = false;
  const check = async () => {
    // The marker is consumed first, so a re-render, Back or a second event never starts another run for it.
    const nonce = consumePasteMarker({ location: win.location, history: win.history });
    if (!nonce) return;
    // A marker that arrives mid-run starts nothing: its handoff is deleted (single use, never left behind) and no notice replaces the running flow's.
    if (running) { store.clear({ nonce }); return; }
    running = true;
    const doc = win.document, platform = win.navigator.platform || win.navigator.userAgent || "";
    const warn = (text: string) => showNotice({ doc, text: pasteShortcut({ text, platform }), tone: "warning" });
    try {
      const handoff = await pollFor({ find: () => { const value = parseHandoff({ value: store.read() }); return value?.nonce === nonce ? value : null; }, timeoutMs: handoffWaitMs, intervalMs: flow.intervalMs });
      // Single use: the handoff of this nonce is deleted before anything else, whatever the verdict. Another tab's handoff stays.
      if (handoff) store.clear({ nonce });
      const verdict = checkHandoff({ handoff, nonce, pathname: win.location.pathname });
      if (!handoff || verdict !== "ok") {
        // M3: fixed, neutral text. No click, no read: the seller pastes by hand, as without the script.
        win.console.debug(`[Hospeda] Instagram: marker not confirmed (${verdict}).`);
        warn(UNCONFIRMED_NOTICE); onResult?.({ ok: false, reason: "unconfirmed" }); return;
      }
      const result = await runPasteFlow({ doc, location: win.location, username: handoff.username, text: handoff.text, ...flow }).catch((): FlowResult => ({ ok: false, reason: "insert-failed", composer: null }));
      if (result.ok) showNotice({ doc, text: PASTED_NOTICE, tone: "success" });
      else { result.composer?.focus(); warn(FAILURE_NOTICES[result.reason]); }
      onResult?.(result);
    } finally { running = false; }
  };
  win.addEventListener("hashchange", () => void check());
  void check();
}
