import { USERSCRIPT_VERSION } from "./version";

/** Attribute and event the CRM page reads. A string attribute crosses Tampermonkey's sandbox; event details may not. */
export const INSTALLED_ATTRIBUTE = "data-hospeda-userscript";
export const INSTALLED_EVENT = "hospeda-userscript-installed";
/** Spec 96 §3.1: whether the script's token works with the CRM (`connected | missing-token | rejected | outdated | unknown`). Never the token. */
export const CONNECTION_ATTRIBUTE = "data-hospeda-userscript-connection";
/** Spec 96 §10.3: the email of the CRM user that owns the token, only while connected. Not a secret; the token never reaches the page. */
export const USER_ATTRIBUTE = "data-hospeda-userscript-user";
/** The page asks the script to check its connection again («Verificar de nuevo»). */
export const RECHECK_EVENT = "hospeda-userscript-recheck";

/** Tells the CRM's user-script page which version is installed in this browser. */
export function announceInstalled(doc: Document): void {
  doc.documentElement.setAttribute(INSTALLED_ATTRIBUTE, USERSCRIPT_VERSION);
  doc.dispatchEvent(new Event(INSTALLED_EVENT));
}

/**
 * Owner review of spec 96 (1.5.1): «Conectar este navegador». The CRM page dispatches TOKEN_EVENT with a JSON string detail
 * `{"token","nonce"}` (a string crosses the sandbox, like the Instagram handoff); the script saves the token, acks with the nonce on
 * TOKEN_ACK_ATTRIBUTE + TOKEN_ACK_EVENT and checks its connection again. The token is never written to the page.
 */
export const TOKEN_EVENT = "hospeda-userscript-token";
export const TOKEN_ACK_ATTRIBUTE = "data-hospeda-userscript-token-ack";
export const TOKEN_ACK_EVENT = "hospeda-userscript-token-ack";
/** First version that accepts TOKEN_EVENT. */
export const TOKEN_BRIDGE_VERSION = "1.5.1";
/** Shape of a CRM user-script token (`hcu_` + 32 random bytes in base64url). */
export const isUserscriptToken = (value: unknown): value is string => typeof value === "string" && /^hcu_[A-Za-z0-9_-]{43}$/.test(value);
