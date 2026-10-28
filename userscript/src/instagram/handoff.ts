/**
 * Spec 94 §2.1–2.2 (security, D6): the one-time handoff that authorizes a paste. A bare marker would let any site link to
 * `instagram.com/<attacker>/#hospeda` and paste the seller's clipboard into a DM with the attacker. So the CRM page generates a random
 * nonce on «Abrir Instagram», hands `{nonce, username, expiresAt, textHash}` to the user script running on the CRM page (window
 * `postMessage`, same origin only), the script stores it under its own GM key, and the URL carries `#hospeda=<nonce>`. The Instagram
 * module acts only when nonce, expiry and profile username match, and deletes the handoff before acting. Shared with the CRM.
 */
import { INSTAGRAM_PASTE_MARKER } from "./marker";

/** GM storage key of the pending handoff. The only key the Instagram module reads (never the token). */
export const HANDOFF_STORAGE_KEY = "hospeda-instagram-handoff";
/** `type` of the CRM page → user script message. */
export const HANDOFF_MESSAGE_TYPE = "hospeda-instagram-handoff";
/** A handoff is valid for two minutes after «Abrir Instagram». */
export const HANDOFF_TTL_MS = 2 * 60_000;

/** What the CRM hands to the script. `textHash` is the first 16 hex chars of SHA-256 over the normalized prepared text. */
export type InstagramHandoff = { readonly nonce: string; readonly username: string; readonly expiresAt: number; readonly textHash: string };

const NONCE = /^[0-9a-f]{32}$/, USERNAME = /^[a-z0-9._]{1,30}$/, HASH = /^[0-9a-f]{16}$/;

/** 128 random bits as 32 lowercase hex chars. */
export function newNonce({ random = globalThis.crypto }: { random?: Pick<Crypto, "getRandomValues"> } = {}): string {
  return [...random.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** The URL fragment (without `#`) that carries a nonce. */
export function handoffFragment({ nonce }: { nonce: string }): string { return `${INSTAGRAM_PASTE_MARKER}=${nonce}`; }

/** Line endings and surrounding blanks differ between the CRM copy and the clipboard read on some systems; they do not change the message. */
export function normalizeForHash(text: string): string { return text.replace(/\r\n?/g, "\n").trim(); }

/** First 16 hex chars of SHA-256 of the normalized text. Enough to tell «the clipboard still holds the CRM message» apart from anything else. */
export async function textHash({ text, subtle = globalThis.crypto.subtle }: { text: string; subtle?: SubtleCrypto }): Promise<string> {
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(normalizeForHash(text)));
  return [...new Uint8Array(digest)].slice(0, 8).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** A stored or posted value as a handoff, or null when anything is malformed or it expires too far in the future. */
export function parseHandoff({ value, now = Date.now() }: { value: unknown; now?: number }): InstagramHandoff | null {
  if (!value || typeof value !== "object") return null;
  const { nonce, username, expiresAt, textHash: hash } = value as Record<string, unknown>;
  if (typeof nonce !== "string" || !NONCE.test(nonce) || typeof username !== "string" || !USERNAME.test(username) || typeof hash !== "string" || !HASH.test(hash)) return null;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt > now + HANDOFF_TTL_MS + 5_000) return null;
  return { nonce, username, expiresAt, textHash: hash };
}

/** The profile username of an Instagram path (`/<user>/`), lowercase; null for any other page. */
export function profileUsername({ pathname }: { pathname: string }): string | null {
  const match = /^\/([A-Za-z0-9._]{1,30})\/?$/.exec(pathname); return match ? match[1].toLowerCase() : null;
}

export type HandoffCheck = "ok" | "missing" | "nonce" | "expired" | "username";
/** Whether a stored handoff authorizes this page: same nonce, not expired, and the profile in the path is the one the CRM opened. */
export function checkHandoff({ handoff, nonce, pathname, now = Date.now() }: { handoff: InstagramHandoff | null; nonce: string; pathname: string; now?: number }): HandoffCheck {
  if (!handoff) return "missing";
  if (handoff.nonce !== nonce) return "nonce";
  if (handoff.expiresAt <= now) return "expired";
  return profileUsername({ pathname }) === handoff.username ? "ok" : "username";
}
