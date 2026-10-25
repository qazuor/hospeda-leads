import { normalizePhone, parseCode } from "./parse";

export type ChatMessage = { externalId: string; direction: "in" | "out"; text: string; sentAt: string | null; author: string | null };
export type ChatRead = { ok: true; title: string; phone: string | null; code: string | null; group: false; messages: ChatMessage[] } | { ok: false; reason: "unsupported-group" | "unreadable" };

export function getConversationPanel(doc: Document = document): HTMLElement | null { return doc.querySelector<HTMLElement>("#main"); }
export function getAppRoot(doc: Document = document): HTMLElement { return doc.querySelector<HTMLElement>("#app") || doc.body; }
export function getConversationHeader(doc: Document = document): HTMLElement | null { return getConversationPanel(doc)?.querySelector<HTMLElement>("header") || null; }
export function getConversationHeaderBottom(doc: Document = document): number { const header = getConversationHeader(doc); if (!header) return 64; const bottom = header.getBoundingClientRect().bottom; return Number.isFinite(bottom) && bottom > 0 ? Math.ceil(bottom + 4) : 64; }

/** Attributes that describe structure, not content: their values are kept (digit runs masked) so selectors can be fixed from a diagnostic. */
const STRUCTURAL_ATTRS = new Set(["data-testid", "data-icon", "role", "dir", "data-tab", "data-virtualized"]);

export function redactedSnapshot(doc: Document = document): string {
  const main = getConversationPanel(doc);
  if (!main) return "No hay un chat abierto.";
  const snapshot = (node: Element): unknown => ({
    tag: node.tagName.toLowerCase(), classes: [...node.classList],
    attrs: [...node.attributes].map(attr => ({
      name: attr.name,
      value: attr.name === "data-id" ? attr.value.replace(/\d{4,}/g, digits => `${"*".repeat(digits.length - 3)}${digits.slice(-3)}`).replace(/_[^_]+$/, "_…") : attr.name === "data-pre-plain-text" ? "[redactado]" : attr.name === "title" ? `${attr.value.length} caracteres` : STRUCTURAL_ATTRS.has(attr.name) ? attr.value.replace(/\d{4,}/g, digits => "*".repeat(digits.length)).slice(0, 80) : attr.name,
      length: attr.name === "data-pre-plain-text" || attr.name === "title" ? attr.value.length : undefined,
    })),
    children: [...node.children].slice(0, 100).map(snapshot),
    textLength: [...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).reduce((length, child) => length + (child.textContent || "").length, 0),
  });
  return JSON.stringify(snapshot(main), null, 2);
}

/** The message bubble body: WhatsApp keeps the time/author attribute and the text on an inner `.copyable-text` node, not on the row. */
function copyable(row: HTMLElement): HTMLElement { return row.matches("[data-pre-plain-text]") ? row : row.querySelector<HTMLElement>("[data-pre-plain-text]") || row; }

function textOf(row: HTMLElement): string {
  // Only the message's own selectable text: `span[dir]` also matched the bubble time, and a quoted reply carries the original's text.
  const nodes = [...copyable(row).querySelectorAll<HTMLElement>("[data-testid='selectable-text'], .selectable-text")].filter(node => !node.closest("[data-testid^='quoted'], [aria-label*='citado' i]"));
  const outer = nodes.filter(node => !nodes.some(other => other !== node && other.contains(node)));
  const parts = [...new Set(outer.map(node => (node.innerText || node.textContent || "").trim()).filter(Boolean))];
  if (parts.length) return parts.join(" ").trim();
  const media = row.querySelector<HTMLElement>("[data-testid*='image'], [data-testid*='audio'], [data-testid*='video'], [data-testid*='document'], [data-testid*='sticker'], [data-testid*='location'], img, video, audio");
  if (!media) return "";
  const label = `${media.getAttribute("data-testid") || ""} ${media.getAttribute("aria-label") || ""}`.toLowerCase();
  if (/audio|voice/.test(label) || media.tagName === "AUDIO") {
    const duration = row.querySelector("[data-duration]")?.getAttribute("data-duration");
    return `[audio${duration ? ` ${duration}` : ""}]`;
  }
  if (/video/.test(label) || media.tagName === "VIDEO") return "[video]";
  if (/document|file/.test(label)) return `[documento: ${media.getAttribute("aria-label") || "archivo"}]`;
  if (/sticker/.test(label)) return "[sticker]";
  if (/location|map/.test(label)) return "[ubicación]";
  return "[imagen]";
}

/** Parses `[14:05, 23/10/2026] Name: ` and the 12-hour variant `[2:05 p. m., 23/10/26] Name: ` as local time. Day comes before month. */
export function parsePrePlainText(raw: string | null): { sentAt: string | null; author: string | null } {
  const match = raw?.match(/^\[(\d{1,2}):(\d{2})(?:\s*([ap])\.?\s*m\.?)?,\s*(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\]\s*(.*?):\s*$/i);
  if (!match) return { sentAt: null, author: null };
  const [, rawHour, minute, meridiem, day, month, rawYear, author] = match;
  let hour = Number(rawHour);
  if (meridiem) hour = meridiem.toLowerCase() === "p" ? (hour % 12) + 12 : hour % 12;
  const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
  const date = new Date(year, Number(month) - 1, Number(day), hour, Number(minute));
  const valid = !Number.isNaN(date.getTime()) && date.getDate() === Number(day) && date.getMonth() === Number(month) - 1 && hour < 24;
  return { sentAt: valid ? date.toISOString() : null, author: author.trim() || null };
}

function metadata(row: HTMLElement): { sentAt: string | null; author: string | null } { return parsePrePlainText(copyable(row).getAttribute("data-pre-plain-text")); }

/**
 * Message direction. The legacy id carried it (`true_`/`false_`); current WhatsApp ids are bare, so the bubble tail decides. Only the
 * first bubble of a run has a tail: the rest fall back to the side of the panel the bubble sits on. Null when nothing tells.
 */
function directionOf(row: HTMLElement, externalId: string, main: HTMLElement): "in" | "out" | null {
  if (externalId.startsWith("true_")) return "out";
  if (externalId.startsWith("false_")) return "in";
  const tail = row.querySelector("[data-icon^='tail-']")?.getAttribute("data-icon");
  if (tail === "tail-out") return "out";
  if (tail === "tail-in") return "in";
  if (row.classList.contains("message-out") || row.querySelector(".message-out")) return "out";
  if (row.classList.contains("message-in") || row.querySelector(".message-in")) return "in";
  const bubble = row.querySelector<HTMLElement>("[data-testid='msg-container']")?.getBoundingClientRect(), panel = main.getBoundingClientRect();
  if (!bubble || !bubble.width || !panel.width) return null;
  return bubble.left - panel.left > panel.right - bubble.right ? "out" : "in";
}

/** The chat name in the header. A bare `[title]` is avoided: the first one is the avatar button («Información del perfil»). */
function chatTitle(header: HTMLElement | null): string {
  if (!header) return "";
  for (const selector of ["[data-testid='conversation-info-header-chat-title']", "span[dir='auto']", "span[title]"]) {
    const node = header.querySelector<HTMLElement>(selector);
    const value = (node?.getAttribute("title") || node?.innerText || node?.textContent || "").trim();
    if (value) return value;
  }
  return "";
}

export function readChat(doc: Document = document): ChatRead {
  try {
    const main = getConversationPanel(doc);
    const title = chatTitle(getConversationHeader(doc));
    if (!main || !title) return { ok: false, reason: "unreadable" };
    const rows = [...main.querySelectorAll<HTMLElement>("[data-id]")].filter(row => !row.parentElement?.closest("[data-id]"));
    const ids = rows.map(row => row.getAttribute("data-id") || "");
    if (ids.some(id => /@g\.us_/i.test(id))) return { ok: false, reason: "unsupported-group" };
    const numberTitle = /^\+?[\d\s().-]{8,}$/.test(title) ? title : null;
    const phoneId = ids.map(id => id.match(/^(?:true|false)_(\d+)@c\.us_/i)?.[1]).find(Boolean);
    const phone = normalizePhone(numberTitle || phoneId || "");
    const messages: ChatMessage[] = rows.flatMap(row => {
      // Without WhatsApp's message id there is no idempotency key: skip the row instead of failing the whole batch.
      const externalId = (row.getAttribute("data-id") || "").slice(0, 300);
      if (!externalId) return [];
      const direction = directionOf(row, externalId, main);
      if (!direction) return [];
      const { sentAt, author } = metadata(row);
      return [{ externalId, direction, text: textOf(row).slice(0, 10000), sentAt, author: author?.slice(0, 200) ?? null }];
    });
    // Current ids no longer name the chat: several different senders among received messages means a group.
    if (new Set(messages.filter(message => message.direction === "in" && message.author).map(message => message.author)).size > 1) return { ok: false, reason: "unsupported-group" };
    return { ok: true, title, phone, code: parseCode(title), group: false, messages };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
