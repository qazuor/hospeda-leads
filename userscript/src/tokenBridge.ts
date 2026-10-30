import { TOKEN_ACK_ATTRIBUTE, TOKEN_ACK_EVENT, TOKEN_EVENT, isUserscriptToken } from "./announce";

/** Longest `detail` accepted: a token and a nonce fit in well under this. */
const MAX_DETAIL = 1_000;

type TokenBridgeDeps = { doc: Document; verify: (token: string) => Promise<boolean>; save: (token: string) => void; recheck: () => void };

/**
 * On the CRM page (owner review of spec 96, 1.5.1): takes a token the page hands over with «Conectar este navegador». The token is
 * checked against the CRM first (`verify`) and saved only when it works, so page code can never replace the saved token with a dead or
 * foreign-server one; then the nonce is acked and the connection checked again. A token that does not work is acked as
 * `<nonce>:rejected` and nothing is saved. Malformed, oversized or non-string details, and anything that is not a CRM token, are
 * ignored and never acked.
 */
export function listenForToken({ doc, verify, save, recheck }: TokenBridgeDeps): () => void {
  const onToken = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (typeof detail !== "string" || detail.length > MAX_DETAIL) return;
    let value: { token?: unknown; nonce?: unknown };
    try { value = JSON.parse(detail) as typeof value; } catch { return; }
    if (!value || !isUserscriptToken(value.token) || typeof value.nonce !== "string" || !/^[0-9a-f]{32}$/.test(value.nonce)) return;
    const { token, nonce } = { token: value.token, nonce: value.nonce };
    const ack = (result: string) => { doc.documentElement.setAttribute(TOKEN_ACK_ATTRIBUTE, result); doc.dispatchEvent(new Event(TOKEN_ACK_EVENT)); };
    void verify(token).catch(() => false).then(works => {
      if (!works) { ack(`${nonce}:rejected`); return; }
      save(token); ack(nonce); recheck();
    });
  };
  doc.addEventListener(TOKEN_EVENT, onToken);
  return () => doc.removeEventListener(TOKEN_EVENT, onToken);
}
