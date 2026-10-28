import { TOKEN_ACK_ATTRIBUTE, TOKEN_ACK_EVENT, TOKEN_EVENT, isUserscriptToken } from "./announce";

/** Longest `detail` accepted: a token and a nonce fit in well under this. */
const MAX_DETAIL = 1_000;

type TokenBridgeDeps = { doc: Document; save: (token: string) => void; recheck: () => void };

/**
 * On the CRM page (owner review of spec 96, 1.5.1): saves a token the page hands over with «Conectar este navegador», acks it with its
 * nonce and checks the connection again, so the page shows «Conectado» without pasting anything in WhatsApp Web. Malformed, oversized
 * or non-string details, and anything that is not a CRM token, are ignored and never acked.
 */
export function listenForToken({ doc, save, recheck }: TokenBridgeDeps): () => void {
  const onToken = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (typeof detail !== "string" || detail.length > MAX_DETAIL) return;
    let value: { token?: unknown; nonce?: unknown };
    try { value = JSON.parse(detail) as typeof value; } catch { return; }
    if (!value || !isUserscriptToken(value.token) || typeof value.nonce !== "string" || !/^[0-9a-f]{32}$/.test(value.nonce)) return;
    save(value.token);
    doc.documentElement.setAttribute(TOKEN_ACK_ATTRIBUTE, value.nonce);
    doc.dispatchEvent(new Event(TOKEN_ACK_EVENT));
    recheck();
  };
  doc.addEventListener(TOKEN_EVENT, onToken);
  return () => doc.removeEventListener(TOKEN_EVENT, onToken);
}
