/** Run a refresh only when the seller returns to the browser tab. */
export function listenForVisibility(doc: Document, refresh: () => void): () => void {
  const onVisibility = () => { if (doc.visibilityState === "visible") refresh(); };
  doc.addEventListener("visibilitychange", onVisibility);
  return () => doc.removeEventListener("visibilitychange", onVisibility);
}
