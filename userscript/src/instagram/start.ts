import { consumePasteMarker } from "./marker";
import { runPasteFlow, type FlowDeps, type FlowResult } from "./flow";
import { FAILURE_NOTICES, PASTED_NOTICE, pasteShortcut, showNotice } from "./notice";

/**
 * Spec 94: entry of the Instagram module of the shared «Hospeda CRM» script (`main.ts` routes `www.instagram.com` here). Isolated on
 * purpose (§2.4): it imports only its own files, never reads or writes GM storage, never calls the CRM or `GM_xmlhttpRequest`, and
 * does nothing on a page without the marker beyond this check and a `hashchange` listener that repeats it.
 */
export type InstagramStartDeps = {
  readonly win?: Window & typeof globalThis;
  readonly flow?: Partial<Omit<FlowDeps, "doc">>;
  readonly onResult?: (result: FlowResult) => void;
};

/** Starts the module: one run per marker, never two at once. */
export function startInstagram({ win = window, flow = {}, onResult }: InstagramStartDeps = {}): void {
  let running = false;
  const check = () => {
    // The marker is consumed first, so a re-render, Back or a second event never starts another run for it.
    if (!consumePasteMarker({ location: win.location, history: win.history }) || running) return;
    running = true;
    const doc = win.document, platform = win.navigator.platform || win.navigator.userAgent || "";
    void runPasteFlow({ doc, readClipboard: () => win.navigator.clipboard.readText(), ...flow }).catch((): FlowResult => ({ ok: false, reason: "insert-failed", composer: null })).then(result => {
      if (result.ok) showNotice({ doc, text: PASTED_NOTICE, tone: "success" });
      else { result.composer?.focus(); showNotice({ doc, text: pasteShortcut({ text: FAILURE_NOTICES[result.reason], platform }), tone: "warning" }); }
      onResult?.(result);
    }).finally(() => { running = false; });
  };
  win.addEventListener("hashchange", check);
  check();
}
