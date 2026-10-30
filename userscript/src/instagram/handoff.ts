/**
 * Spec 94 §2.1–2.2 (security, D6–D7): the one-time handoff that authorizes a paste. A bare marker would let any site link to
 * `instagram.com/<attacker>/#hospeda` and get text into a DM with the attacker. So, on «Abrir Instagram», the CRM page generates a
 * random nonce and hands `{nonce, username, expiresAt, text}` to the user script running on the CRM page (a `CustomEvent` on `document`
 * with a JSON string, the same way `announce.ts` crosses Tampermonkey's sandbox). The script stores it under its own GM key and acks with
 * an attribute; only then does the URL carry `#hospeda=<nonce>`. The Instagram module acts only when nonce, expiry and profile username
 * match, deletes the handoff (compare-and-delete) and inserts the handoff text. It never reads the clipboard (D7). Shared with the CRM.
 */
import { INSTAGRAM_PASTE_MARKER } from "./marker";

/** GM storage key of the pending handoff. The only key the Instagram module reads (never the token). */
export const HANDOFF_STORAGE_KEY = "hospeda-instagram-handoff";
/** Event the CRM page dispatches on `document`; `detail` is the handoff as a JSON string (strings cross the sandbox, objects may not). */
export const HANDOFF_EVENT = "hospeda-instagram-handoff";
/** Attribute on `<html>` where the script on the CRM page acks a stored handoff with its nonce, plus the event that announces it. */
export const HANDOFF_ACK_ATTRIBUTE = "data-hospeda-instagram-ack";
export const HANDOFF_ACK_EVENT = "hospeda-instagram-handoff-ack";
/** A handoff is valid for two minutes after «Abrir Instagram». */
export const HANDOFF_TTL_MS = 2 * 60_000;
/**
 * Longest text handed to the script. Instagram does not publish a limit for Instagram Web's composer and the CRM composer does not cap
 * Instagram drafts (50 000 like every body); 4000 characters covers every real message. A longer text gets no handoff: plain profile,
 * manual paste from the clipboard.
 */
export const HANDOFF_TEXT_MAX = 4000;

/**
 * What the CRM hands to the script. `text` is the saved final text that the CRM also copied to the clipboard. Since spec 97 (§4.1), `threadId`
 * is the chat page the CRM opened (`/direct/t/<threadId>/`), sent only to scripts 1.6.0+ and only when the CRM knows the thread.
 */
export type InstagramHandoff = { readonly nonce: string; readonly username: string; readonly expiresAt: number; readonly text: string; readonly threadId?: string };

/** The pending handoff, as stored by the script on the CRM page. `clear` is compare-and-delete: only the handoff of that nonce. */
export type HandoffStore = { readonly read: () => unknown; readonly clear: (input: { readonly nonce: string }) => void };

const NONCE = /^[0-9a-f]{32}$/, USERNAME = /^[a-z0-9._]{1,30}$/, THREAD = /^[0-9]{1,40}$/;

/** Spec 97 §4.4: the thread id of a chat page path (`/direct/t/<digits>/`, trailing slash optional, as seen live); null for any other page. */
export function threadIdFromPath(pathname: string): string | null {
  const match = /^\/direct\/t\/([0-9]{1,40})\/?$/.exec(pathname); return match ? match[1] : null;
}

/** 128 random bits as 32 lowercase hex chars. */
export function newNonce({ random = globalThis.crypto }: { random?: Pick<Crypto, "getRandomValues"> } = {}): string {
  return [...random.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** The URL fragment (without `#`) that carries a nonce. */
export function handoffFragment({ nonce }: { nonce: string }): string { return `${INSTAGRAM_PASTE_MARKER}=${nonce}`; }

/** True for text the CRM may hand over: not blank and at most `HANDOFF_TEXT_MAX` characters. */
export function handoffTextAllowed(text: string): boolean { return text.trim().length > 0 && [...text].length <= HANDOFF_TEXT_MAX; }

/** A stored or dispatched value as a handoff, or null when anything is malformed, the text is too long or it expires too far ahead. */
export function parseHandoff({ value, now = Date.now() }: { value: unknown; now?: number }): InstagramHandoff | null {
  if (!value || typeof value !== "object") return null;
  const { nonce, username, expiresAt, text, threadId } = value as Record<string, unknown>;
  if (typeof nonce !== "string" || !NONCE.test(nonce) || typeof username !== "string" || !USERNAME.test(username) || typeof text !== "string" || !handoffTextAllowed(text)) return null;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt > now + HANDOFF_TTL_MS + 5_000) return null;
  if (threadId !== undefined && (typeof threadId !== "string" || !THREAD.test(threadId))) return null;
  return { nonce, username, expiresAt, text, ...(typeof threadId === "string" ? { threadId } : {}) };
}

/** The profile username of an Instagram path (`/<user>/`), lowercase; null for any other page. */
export function profileUsername({ pathname }: { pathname: string }): string | null {
  const match = /^\/([A-Za-z0-9._]{1,30})\/?$/.exec(pathname); return match ? match[1].toLowerCase() : null;
}

export type HandoffCheck = "ok" | "missing" | "nonce" | "expired" | "username" | "thread";
/**
 * Whether a stored handoff authorizes this page: same nonce, not expired, and the page is the one the CRM opened. On a chat page (spec 97 §4.2)
 * the handoff must name that thread id; on a profile, the username. The chat page's username is proven later from the page (`thread.ts`).
 */
export function checkHandoff({ handoff, nonce, pathname, now = Date.now() }: { handoff: InstagramHandoff | null; nonce: string; pathname: string; now?: number }): HandoffCheck {
  if (!handoff) return "missing";
  if (handoff.nonce !== nonce) return "nonce";
  if (handoff.expiresAt <= now) return "expired";
  const thread = threadIdFromPath(pathname);
  if (thread) return handoff.threadId === thread ? "ok" : "thread";
  return profileUsername({ pathname }) === handoff.username ? "ok" : "username";
}
