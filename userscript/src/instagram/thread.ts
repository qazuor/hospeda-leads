import { CONVERSATION_LIST, FLOATING, accessibleName, conversationPane, normalizeName } from "./finders";
import { threadIdFromPath } from "./handoff";

/**
 * Spec 97 §4.4–4.5 with the live findings of §9.1: who the open chat is with, and which Instagram account is logged in. Pure reads of
 * Instagram's own `href`s and labels, never class names, never the message list's text. A display name or a message reading «@x» is never proof.
 */
export { threadIdFromPath };

/** Single-segment paths that are Instagram pages, not profiles. */
const RESERVED = new Set(["direct", "explore", "reels", "reel", "accounts", "stories", "p", "tv", "about", "legal", "developer", "web", "emails", "challenge", "session", "privacy", "help", "api", "graphql", "oauth", "invites", "topics", "locations", "tags", "notifications", "settings", "threads", "meta", "lite", "nametag", "your_activity"]);

/** The lowercase username of a profile link (`/<name>/`, trailing slash optional, relative or on www.instagram.com); null for anything else. */
export function profileHrefUsername(href: string | null | undefined): string | null {
  if (!href) return null;
  let path: string;
  try { const url = new URL(href, "https://www.instagram.com/"); if (url.hostname !== "www.instagram.com" && url.hostname !== "instagram.com") return null; path = url.pathname; } catch { return null; }
  const match = /^\/([A-Za-z0-9._]{1,30})\/?$/.exec(path); if (!match) return null;
  const name = match[1].toLowerCase(); return RESERVED.has(name) ? null : name;
}

/** 9.1 item 1: the header and the avatars are labelled in both languages, even with the Spanish UI. Normalized (no accents). */
const PROFILE_LABEL = /^(?:abrir la pagina del perfil de|open the profile page of) ([a-z0-9._]{1,30})$/;
/** The username a profile link's label names, or null. */
export function profileLabelUsername(el: Element): string | null { const match = PROFILE_LABEL.exec(normalizeName(el.getAttribute("aria-label"))); return match ? match[1] : null; }
/** Defensive group signal (no group was observed live yet): a participant count in the chat's header region, never in the messages. */
const GROUP_COUNT = /(?:^|\D)\d+\s+(?:miembros|members|participantes|participants|personas|people)\b/i;
/** Parts of the pane that hold messages or the composer: their text is the other person's or the seller's, never a header. */
const NOT_HEADER = `[role="grid"], [role="row"], [role="log"], [role="list"], [role="listitem"], [contenteditable="true"], [role="textbox"], ${CONVERSATION_LIST}`;

/**
 * The header region's text: below the pane's single-child wrappers, the children that hold no message list and no composer. A message such as
 * «cabaña para 4 personas» is never read. An unexpected layout yields less header text (no group signal), never message text.
 */
export function headerText(pane: Element): string {
  let root: Element = pane;
  while (root.children.length === 1 && !root.children[0].matches(NOT_HEADER)) root = root.children[0];
  return [...root.children].filter(child => !child.matches(NOT_HEADER) && !child.querySelector(NOT_HEADER)).map(child => child.textContent ?? "").join(" ");
}

export type ProofFailure = "path" | "no-pane" | "no-links" | "several" | "no-header" | "group" | "path-changed";
/** A failed proof carries the usernames the pane named, so a caller can tell evidence against a user from plain ambiguity. */
export type ThreadProof = { readonly ok: true; readonly threadId: string; readonly username: string } | { readonly ok: false; readonly reason: ProofFailure; readonly names: readonly string[] };

/**
 * Spec 97 §4.4: the open chat is proven for one username only when the path is `/direct/t/<id>/`, the conversation pane's profile links name
 * exactly one distinct username (the live page has several links for the same user: header and one per avatar; unlabelled links such as «Ver perfil»
 * or the author of a shared post are ignored), at least one of them is
 * labelled «Abrir la página del perfil de <x>» / «Open the profile page of <x>» for that same user, there is no group signal, and the path did not
 * change while checking. A label naming somebody other than its `href` counts as a second user. Links inside floating chats never count.
 */
export function proveThread({ doc, readPath }: { doc: Document; readPath: () => string }): ThreadProof {
  const path = readPath(), threadId = threadIdFromPath(path);
  if (!threadId) return { ok: false, reason: "path", names: [] };
  const pane = conversationPane({ doc }); if (!pane) return { ok: false, reason: "no-pane", names: [] };
  const names = new Set<string>(); let labelled = false;
  for (const link of pane.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (link.closest(FLOATING) || link.closest(CONVERSATION_LIST)) continue;
    // Only Instagram's own labelled links (header, message avatars) name a participant. Unlabelled profile links are message content: a shared
    // post or reel shows its author as a plain link (live chat, 29/10/2026), and «Ver perfil» repeats the header.
    const name = profileHrefUsername(link.getAttribute("href")), label = profileLabelUsername(link); if (!name || !label) continue;
    names.add(name); names.add(label); if (label === name) labelled = true;
  }
  const found = [...names];
  if (GROUP_COUNT.test(headerText(pane))) return { ok: false, reason: "group", names: found };
  if (!names.size) return { ok: false, reason: "no-links", names: found };
  if (names.size > 1) return { ok: false, reason: "several", names: found };
  if (!labelled) return { ok: false, reason: "no-header", names: found };
  if (readPath() !== path) return { ok: false, reason: "path-changed", names: found };
  return { ok: true, threadId, username: [...names][0] };
}

const PROFILE_NAV_NAMES = ["perfil", "profile"];
/** «Foto del perfil de <x>» / «<x>'s profile picture», normalized; the username or null. */
function avatarAltUsername(alt: string): string | null {
  const text = normalizeName(alt), match = /^foto del perfil de ([a-z0-9._]{1,30})$/.exec(text) ?? /^([a-z0-9._]{1,30})'s profile picture$/.exec(text);
  return match ? match[1] : null;
}

/**
 * Spec 97 §4.5 with 9.1 item 5: the logged-in account. The navigation's «Perfil» / «Profile» link (it is not inside `nav`) must point to exactly
 * one username, and an avatar `img` with the alt «Foto del perfil de <same>» / «<same>'s profile picture» must agree. Anything else is null
 * (unknown): no paste, no report.
 */
export function loggedInUsername({ doc }: { doc: Document }): string | null {
  const names = new Set<string>();
  for (const link of doc.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (link.closest(FLOATING) || !PROFILE_NAV_NAMES.includes(accessibleName(link))) continue;
    const name = profileHrefUsername(link.getAttribute("href")); if (name) names.add(name);
  }
  if (names.size !== 1) return null;
  const name = [...names][0];
  return [...doc.querySelectorAll<HTMLImageElement>("img[alt]")].some(img => avatarAltUsername(img.getAttribute("alt") ?? "") === name) ? name : null;
}

const HEADING_SKIP = `[role="grid"], [role="row"], [role="log"], [role="listitem"], [role="dialog"], ${FLOATING}, ${CONVERSATION_LIST}`;
/** Whitespace collapsed and trimmed; null when empty or longer than the CRM keeps (100). */
const cleanName = (text: string | null | undefined): string | null => { const value = (text ?? "").normalize("NFC").replace(/\p{Cf}/gu, "").replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim(); return value && value.length <= 100 ? value : null; };

/**
 * Spec 97 §15 with the live findings of §9.1 item 9: the display name of a chat with `username`, for the conversation-list badges. Read only
 * when the pane has Instagram's labelled header link for that same username (review H2): a heading is never trusted on its own, so a chat that
 * changed under the script, or a seller-confirmed chat without that link, yields null. The pane's single `h1`/`h2` holds the name alone; when
 * there is not exactly one, the labelled link's text («Leandro Asrilevich» + «qaz.uor») is used with the username part removed. Headings and
 * links inside messages, the conversation list or floating chats never count. Null when unclear.
 */
export function headerDisplayName({ doc, username }: { doc: Document; username: string }): string | null {
  const pane = conversationPane({ doc }); if (!pane) return null;
  const isUser = (text: string) => text.toLowerCase() === username.toLowerCase();
  const links = [...pane.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(link => !link.closest(HEADING_SKIP) && profileLabelUsername(link) === username && profileHrefUsername(link.getAttribute("href")) === username);
  if (!links.length) return null;
  const headings = new Set([...pane.querySelectorAll("h1, h2")].filter(h => !h.closest(HEADING_SKIP)).map(h => cleanName(h.textContent)).filter((t): t is string => !!t && !isUser(t)));
  if (headings.size === 1) return [...headings][0];
  if (headings.size > 1) return null;
  for (const link of links) {
    const parts: string[] = []; const walker = doc.createTreeWalker(link, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) { const text = cleanName(node.textContent); if (text) parts.push(text); }
    const named = parts.filter(part => !isUser(part));
    if (parts.length > 1 && named.length === 1) return named[0];
    const whole = cleanName(parts.join(""));
    if (whole && whole.toLowerCase().endsWith(username.toLowerCase())) { const rest = cleanName(whole.slice(0, whole.length - username.length)); if (rest) return rest; }
  }
  return null;
}
