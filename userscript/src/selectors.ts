import { normalizePhone, parseCode } from "./parse";

export type ChatMessage = { externalId: string; direction: "in" | "out"; text: string; sentAt: string | null; author: string | null };
export type ChatRead = { ok: true; title: string; phone: string | null; code: string | null; group: false; messages: ChatMessage[] } | { ok: false; reason: "unsupported-group" | "unreadable" };

export function getConversationPanel(doc: Document = document): HTMLElement | null { return doc.querySelector<HTMLElement>("#main"); }
export function getAppRoot(doc: Document = document): HTMLElement { return doc.querySelector<HTMLElement>("#app") || doc.body; }
export function getConversationHeader(doc: Document = document): HTMLElement | null { return getConversationPanel(doc)?.querySelector<HTMLElement>("header") || null; }
export function getConversationHeaderBottom(doc: Document = document): number { const header = getConversationHeader(doc); if (!header) return 64; const bottom = header.getBoundingClientRect().bottom; return Number.isFinite(bottom) && bottom > 0 ? Math.ceil(bottom + 4) : 64; }

export function redactedSnapshot(doc: Document = document): string {
  const main = getConversationPanel(doc);
  if (!main) return "No hay un chat abierto.";
  const snapshot = (node: Element): unknown => ({
    tag: node.tagName.toLowerCase(), classes: [...node.classList],
    attrs: [...node.attributes].map(attr => ({
      name: attr.name,
      value: attr.name === "data-id" ? attr.value.replace(/(true|false)_(\d+)@/, (_, direction: string, digits: string) => `${direction}_${"*".repeat(Math.max(0, digits.length - 3))}${digits.slice(-3)}@`).replace(/_[^_]+$/, "_…") : attr.name === "data-pre-plain-text" ? "[redactado]" : attr.name === "title" ? `${attr.value.length} caracteres` : attr.name,
      length: attr.name === "data-pre-plain-text" || attr.name === "title" ? attr.value.length : undefined,
    })),
    children: [...node.children].slice(0, 100).map(snapshot),
    textLength: [...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).reduce((length, child) => length + (child.textContent || "").length, 0),
  });
  return JSON.stringify(snapshot(main), null, 2);
}

function textOf(row: HTMLElement): string {
  const parts = [...new Set([...row.querySelectorAll<HTMLElement>(".selectable-text, span[dir]")].map(node => (node.innerText || node.textContent || "").trim()).filter(Boolean))];
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

function metadata(row: HTMLElement): { sentAt: string | null; author: string | null } {
  const raw = row.getAttribute("data-pre-plain-text");
  if (!raw) return { sentAt: null, author: null };
  const match = raw.match(/^\[(\d{1,2}:\d{2}),\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\]\s*(.*?):\s*$/);
  if (!match) return { sentAt: null, author: null };
  const [, time, day, month, year, author] = match;
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(Number(year), Number(month) - 1, Number(day), hour, minute);
  return { sentAt: Number.isNaN(date.getTime()) ? null : date.toISOString(), author: author.trim() || null };
}

export function readChat(doc: Document = document): ChatRead {
  try {
    const main = getConversationPanel(doc);
    const header = getConversationHeader(doc);
    const titleNode = header?.querySelector<HTMLElement>("[title], span[dir='auto'], [data-testid='conversation-info-header-chat-title']");
    const title = (titleNode?.getAttribute("title") || titleNode?.innerText || titleNode?.textContent || "").trim();
    if (!main || !title) return { ok: false, reason: "unreadable" };
    const rows = [...main.querySelectorAll<HTMLElement>("[data-id]")];
    const ids = rows.map(row => row.getAttribute("data-id") || "");
    const group = ids.some(id => /@g\.us_/i.test(id));
    if (group) return { ok: false, reason: "unsupported-group" };
    const numberTitle = /^\+?[\d\s().-]{8,}$/.test(title) ? title : null;
    const phoneId = ids.map(id => id.match(/^(?:true|false)_(\d+)@c\.us_/i)?.[1]).find(Boolean);
    const phone = normalizePhone(numberTitle || phoneId || "");
    const messages: ChatMessage[] = rows.flatMap(row => {
      // Without WhatsApp's message id there is no idempotency key: skip the row instead of failing the whole batch.
      const externalId = (row.getAttribute("data-id") || "").slice(0, 300);
      if (!externalId) return [];
      const direction = externalId.startsWith("true_") ? "out" : externalId.startsWith("false_") ? "in" : row.classList.contains("message-out") ? "out" : row.classList.contains("message-in") ? "in" : null;
      if (!direction) return [];
      const { sentAt, author } = metadata(row);
      return [{ externalId, direction, text: textOf(row).slice(0, 10000), sentAt, author: author?.slice(0, 200) ?? null }];
    });
    return { ok: true, title, phone, code: parseCode(title), group: false, messages };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
