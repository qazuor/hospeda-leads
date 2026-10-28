import { consumePasteMarker } from "./marker";
import { checkHandoff, parseHandoff } from "./handoff";
import { pollFor, runPasteFlow, type FlowDeps, type FlowResult } from "./flow";
import { FAILURE_NOTICES, PASTED_NOTICE, pasteShortcut, showNotice } from "./notice";

/**
 * Spec 94: entry of the Instagram module of the shared «Hospeda CRM» script (`main.ts` routes `www.instagram.com` here). Isolated on
 * purpose (§2.4): it imports only its own files, never calls the CRM or the network, and reads only the one-time handoff through the
 * injected `store` (never the token). Without a valid marker it does nothing beyond this check and a `hashchange` listener.
 */

/** The pending handoff, as stored by the script on the CRM page. `clear` makes it single use. */
export type HandoffStore = { readonly read: () => unknown; readonly clear: () => void };

export type InstagramStartDeps = {
  readonly store: HandoffStore;
  readonly win?: Window & typeof globalThis;
  readonly flow?: Partial<Omit<FlowDeps, "doc" | "expectedTextHash">>;
  /** How long to wait for the handoff to reach this tab (GM storage syncs between tabs asynchronously). */
  readonly handoffWaitMs?: number;
  readonly onResult?: (result: FlowResult | { readonly ok: false; readonly reason: "unauthorized" }) => void;
};

/** Starts the module: one run per authorized marker, never two at once. */
export function startInstagram({ store, win = window, flow = {}, handoffWaitMs = 3000, onResult }: InstagramStartDeps): void {
  let running = false;
  const check = async () => {
    // The marker is consumed first, so a re-render, Back or a second event never starts another run for it.
    const nonce = consumePasteMarker({ location: win.location, history: win.history });
    if (!nonce || running) return;
    running = true;
    try {
      const handoff = await pollFor({ find: () => { const value = parseHandoff({ value: store.read() }); return value?.nonce === nonce ? value : null; }, timeoutMs: handoffWaitMs, intervalMs: flow.intervalMs });
      // Single use: a matching handoff is deleted before anything else, whatever the verdict. A foreign nonce leaves a pending one alone.
      if (handoff) store.clear();
      const verdict = checkHandoff({ handoff, nonce, pathname: win.location.pathname });
      if (!handoff || verdict !== "ok") { win.console.debug(`[Hospeda] Instagram: marker ignored (${verdict}).`); onResult?.({ ok: false, reason: "unauthorized" }); return; }
      const doc = win.document, platform = win.navigator.platform || win.navigator.userAgent || "";
      const result = await runPasteFlow({ doc, readClipboard: () => win.navigator.clipboard.readText(), ...flow, expectedTextHash: handoff.textHash }).catch((): FlowResult => ({ ok: false, reason: "insert-failed", composer: null }));
      if (result.ok) showNotice({ doc, text: PASTED_NOTICE, tone: "success" });
      else { result.composer?.focus(); showNotice({ doc, text: pasteShortcut({ text: FAILURE_NOTICES[result.reason], platform }), tone: "warning" }); }
      onResult?.(result);
    } finally { running = false; }
  };
  win.addEventListener("hashchange", () => void check());
  void check();
}
