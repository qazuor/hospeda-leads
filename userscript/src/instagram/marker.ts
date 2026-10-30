/**
 * Spec 94 §2.1: the fragment the CRM adds to the desktop profile URL of «Abrir Instagram»: `#hospeda=<nonce>`. The nonce is random
 * and single use (see `handoff.ts`); a bare `#hospeda` authorizes nothing. No personal data: the username is already in the path and
 * the message is only in the clipboard. Shared with the CRM.
 */
export const INSTAGRAM_PASTE_MARKER = "hospeda";

type MarkerLocation = Pick<Location, "hash" | "pathname" | "search">;
type MarkerHistory = Pick<History, "state" | "replaceState">;

/** The nonce of a well-formed `#hospeda=<32 hex>` fragment; null for anything else, including a bare `#hospeda`. */
export function pasteMarkerNonce({ hash }: { hash: string }): string | null {
  const match = /^#hospeda=([0-9a-f]{32})$/.exec(hash); return match ? match[1] : null;
}

/**
 * Removes a well-formed marker from the address bar with `replaceState`, keeping Instagram's history state, path and query, so a
 * reload, Back or a re-render never sees it again. Returns its nonce, or null when there was none (nothing is touched then).
 */
export function consumePasteMarker({ location, history }: { location: MarkerLocation; history: MarkerHistory }): string | null {
  const nonce = pasteMarkerNonce(location); if (!nonce) return null;
  history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  return nonce;
}
