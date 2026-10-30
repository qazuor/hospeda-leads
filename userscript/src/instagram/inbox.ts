import { CONVERSATION_LIST, FLOATING } from "./finders";

/**
 * Spec 97 §15 with the live findings of §9.1 item 9: Instagram's conversation list. Its rows are `div[role="button"]` with no link, no thread id
 * and no username: only the display name, the last message preview and an avatar `img` (alt «user-profile-picture»). Pure reads; the badge view
 * lives in `instagramApp/inboxBadges.ts`.
 */

/** Marks the script's own badge hosts so the name reader never reads them back. */
export const INBOX_BADGE_ATTRIBUTE = "data-hospeda-inbox-badge";
const AVATAR_ALTS = ["user-profile-picture"];
/** Buttons in the list that are not chats: the notes tray, whose text ends with «Tu nota» (live: "…Tu nota"). */
const NOT_CHAT_TEXT = /(?:tu nota|your note)$/i;

/**
 * Decision §15 asks for an exact match: only case and spacing are ignored. Accents count («José» ≠ «Jose») and ñ ≠ n. Invisible format
 * characters (zero-width joiners, direction marks) are dropped. The CRM normalizes stored names the same way (`instagramInboxThreads`).
 */
export function normalizeDisplayName(text: string): string {
  return text.normalize("NFC").replace(/\p{Cf}/gu, "").replace(/\p{Cc}/gu, " ").toLowerCase().replace(/\s+/g, " ").trim();
}

/** The visible conversation list, or null when there is none or more than one (never guess). */
export function conversationList({ doc }: { doc: Document }): HTMLElement | null {
  const lists = [...doc.querySelectorAll<HTMLElement>(CONVERSATION_LIST)].filter(list => !list.closest(FLOATING));
  return lists.length === 1 ? lists[0] : null;
}

export type InboxRow = { readonly row: HTMLElement; readonly nameEl: HTMLElement; readonly name: string };

/** The first non-empty text of `row` (the display name; the preview comes after it), skipping the script's own badges. */
function firstText(doc: Document, row: HTMLElement): { el: HTMLElement; text: string } | null {
  const walker = doc.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement; if (!el || el.closest(`[${INBOX_BADGE_ATTRIBUTE}]`)) continue;
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim(); if (text) return { el, text };
  }
  return null;
}

/**
 * The chat rows of the conversation list with their display names. A chat row is a `role="button"` with the profile-picture avatar, outside any
 * tablist, without an `aria-label` («Más opciones», «Nuevo mensaje» are labelled buttons), not wrapping another chat row, not the notes tray, and
 * not the account switcher (its text starts with the logged-in username). Anything else is skipped.
 */
export function inboxChatRows({ doc, ownUsername }: { doc: Document; ownUsername?: string | null }): InboxRow[] {
  const list = conversationList({ doc }); if (!list) return [];
  const own = ownUsername?.toLowerCase() ?? null, rows: InboxRow[] = [];
  const isCandidate = (el: HTMLElement) => !el.closest('[role="tablist"]') && !el.hasAttribute("aria-label") && [...el.querySelectorAll("img")].some(img => AVATAR_ALTS.includes((img.getAttribute("alt") ?? "").toLowerCase()));
  const candidates = [...list.querySelectorAll<HTMLElement>('[role="button"]')].filter(isCandidate);
  for (const row of candidates) {
    if (candidates.some(other => other !== row && row.contains(other))) continue;
    const text = (row.textContent ?? "").replace(/\s+/g, " ").trim();
    if (NOT_CHAT_TEXT.test(text) || (own && text.toLowerCase().startsWith(own))) continue;
    const first = firstText(doc, row); if (!first) continue;
    rows.push({ row, nameEl: first.el, name: first.text });
  }
  return rows;
}

/**
 * Decision §15: a row is marked only when its normalized name matches exactly one learned thread. Names shared by two learned threads map to
 * null (marked as none), so a homonym is never badged with the wrong business.
 */
export function uniqueByName<T extends { readonly displayName: string }>(threads: readonly T[]): Map<string, T | null> {
  const map = new Map<string, T | null>(); if (!Array.isArray(threads)) return map;
  for (const thread of threads) { if (typeof thread?.displayName !== "string") continue;
    const key = normalizeDisplayName(thread.displayName); if (!key) continue; map.set(key, map.has(key) ? null : thread); }
  return map;
}
