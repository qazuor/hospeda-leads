/**
 * Spec 94 §2.1: the fragment the CRM adds to the desktop profile URL of «Abrir Instagram». A constant with no personal data:
 * the username is already in the path and the message is only in the clipboard. Shared with the CRM (`instagramTarget`).
 */
export const INSTAGRAM_PASTE_MARKER = "hospeda";

type MarkerLocation = Pick<Location, "hash" | "pathname" | "search">;
type MarkerHistory = Pick<History, "state" | "replaceState">;

/** True when `hash` is exactly the marker (`#hospeda`). */
export function hasPasteMarker({ hash }: { hash: string }): boolean { return hash === `#${INSTAGRAM_PASTE_MARKER}`; }

/**
 * Removes the marker from the address bar with `replaceState`, keeping Instagram's history state, path and query, so a reload, Back
 * or a re-render never sees it again. Returns whether there was a marker to consume: a run starts only when this is true.
 */
export function consumePasteMarker({ location, history }: { location: MarkerLocation; history: MarkerHistory }): boolean {
  if (!hasPasteMarker(location)) return false;
  history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  return true;
}
