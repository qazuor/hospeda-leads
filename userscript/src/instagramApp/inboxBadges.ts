import type { InstagramInboxBadge, InstagramInboxThread } from "../api";
import { INBOX_BADGE_ATTRIBUTE, conversationList, inboxChatRows, normalizeDisplayName, uniqueByName } from "../instagram/inbox";

/**
 * Spec 97 §15: the CRM badge next to a chat's name in Instagram's conversation list, like WhatsApp's chat badges (spec 86). Purely informational:
 * no link, no click handler, so a click on it is a click on Instagram's row. Built with `textContent` in a shadow root (adoptedStyleSheets, or a
 * `<style>` element where constructable sheets are unavailable); never `innerHTML`. Re-applied on every poll, so a re-rendered or recycled row is
 * corrected within one tick.
 */
const CSS = ":host{all:initial;display:inline-flex;vertical-align:middle;margin-left:6px;font:600 10px/16px system-ui,-apple-system,sans-serif}.pill{display:inline-flex;align-items:center;gap:4px;height:16px;padding:0 6px 0 2px;border-radius:999px;border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;white-space:nowrap;cursor:inherit}.dot{width:12px;height:12px;border-radius:50%;display:grid;place-items:center;background:#2563eb;color:#fff;font-size:8px}.pill.red{background:#fee2e2;border-color:#fca5a5;color:#991b1b}.red .dot{background:#dc2626}.pill.amber{background:#fef3c7;border-color:#fcd34d;color:#92400e}.amber .dot{background:#d97706}:host(.dark) .pill{background:#13283f;border-color:#1e3a8a;color:#bfdbfe}:host(.dark) .pill.red{background:#3b1414;border-color:#7f1d1d;color:#fecaca}:host(.dark) .pill.amber{background:#3a2a12;border-color:#78350f;color:#fde68a}";
const sheets = new WeakMap<Document, CSSStyleSheet | null>();

function styleRoot(doc: Document, root: ShadowRoot): void {
  if (!sheets.has(doc)) {
    try { const View = doc.defaultView as (Window & typeof globalThis) | null; if (!View) throw new Error("no view"); const sheet = new View.CSSStyleSheet(); sheet.replaceSync(CSS); sheets.set(doc, sheet); }
    catch { sheets.set(doc, null); }
  }
  const sheet = sheets.get(doc);
  if (sheet) { try { root.adoptedStyleSheets = [sheet]; return; } catch { /* falls back below */ } }
  const style = doc.createElement("style"); style.textContent = CSS; root.append(style);
}

/** Pill text: the code (and «No contactar» when it applies), or how many businesses share that Instagram. */
export function inboxBadgeText(badge: InstagramInboxBadge): string {
  if (badge.kind === "multiple") return `${badge.businesses.length} negocios`;
  return badge.doNotContact || badge.restricted ? `${badge.code} · No contactar` : badge.code;
}
/** The tooltip and accessible label: spec 86's side card as plain text. */
export function inboxBadgeDetail(badge: InstagramInboxBadge): string {
  if (badge.kind === "multiple") return ["Varios negocios del CRM tienen este Instagram:", ...badge.businesses.map(b => `${b.code} · ${b.name} · ${b.statusLabel || "Sin estado"}`)].join("\n");
  return [`${badge.code} · ${badge.city || "Sin ciudad"}`, badge.name, ...(badge.doNotContact || badge.restricted ? ["No contactar"] : []), `${badge.statusLabel || "Sin estado"} · ${badge.assignedUserName || "Sin responsable"}`, badge.openManagement ? `${badge.openManagement.stageLabel}${badge.openManagement.typeLabel ? ` · ${badge.openManagement.typeLabel}` : ""}` : "Sin gestión abierta"].join("\n");
}

function badgeHost(doc: Document, badge: InstagramInboxBadge, dark: boolean, fingerprint: string): HTMLElement {
  const host = doc.createElement("span"); host.setAttribute(INBOX_BADGE_ATTRIBUTE, "1"); host.dataset.fingerprint = fingerprint;
  if (dark) host.className = "dark";
  const root = host.attachShadow({ mode: "open" }); styleRoot(doc, root);
  const tone = badge.kind === "multiple" ? "amber" : badge.doNotContact || badge.restricted ? "red" : "";
  const pill = doc.createElement("span"), dot = doc.createElement("span"), detail = inboxBadgeDetail(badge);
  pill.className = `pill ${tone}`.trim(); dot.className = "dot"; dot.textContent = "H";
  pill.append(dot, doc.createTextNode(inboxBadgeText(badge))); pill.title = detail; pill.setAttribute("role", "note"); pill.setAttribute("aria-label", `CRM: ${detail.replace(/\n/g, ". ")}`);
  root.append(pill); return host;
}

/** Removes every badge the script added to the page. */
export function removeInboxBadges({ doc }: { doc: Document }): void { lastApplied.delete(doc); for (const host of doc.querySelectorAll(`[${INBOX_BADGE_ATTRIBUTE}]`)) host.remove(); }

/** The last applied input per document: a poll whose list text, badge count, data and theme did not change does no row work (review L4). */
const lastApplied = new WeakMap<Document, { list: Element; text: string; hosts: number; threads: readonly InstagramInboxThread[]; dark: boolean; own: string | null; marked: number }>();

/**
 * Marks the list rows whose name matches exactly one learned thread and appears in exactly one visible row (decision §15, review M1), and
 * removes every other badge, including ones left on a row Instagram recycled for another chat. Returns how many rows carry a badge.
 */
export function applyInboxBadges({ doc, threads, dark, ownUsername }: { doc: Document; threads: readonly InstagramInboxThread[]; dark: boolean; ownUsername?: string | null }): number {
  const list = conversationList({ doc }), own = ownUsername ?? null;
  if (!list) { removeInboxBadges({ doc }); lastApplied.delete(doc); return 0; }
  const text = list.textContent ?? "", hosts = doc.querySelectorAll(`[${INBOX_BADGE_ATTRIBUTE}]`).length, last = lastApplied.get(doc);
  if (last && last.list === list && last.text === text && last.hosts === hosts && last.threads === threads && last.dark === dark && last.own === own) return last.marked;
  const byName = uniqueByName(threads), keep = new Set<Element>(), rows = inboxChatRows({ doc, ownUsername });
  const seen = new Map<string, number>(); for (const { name } of rows) { const key = normalizeDisplayName(name); seen.set(key, (seen.get(key) ?? 0) + 1); }
  for (const { row, nameEl, name } of rows) {
    const key = normalizeDisplayName(name), thread = seen.get(key) === 1 ? byName.get(key) ?? null : null; if (!thread) continue;
    const fingerprint = JSON.stringify([thread.username, thread.badge, dark]);
    const current = row.querySelector<HTMLElement>(`[${INBOX_BADGE_ATTRIBUTE}]`);
    if (current && current.dataset.fingerprint === fingerprint && current.previousElementSibling === nameEl) { keep.add(current); continue; }
    const host = badgeHost(doc, thread.badge, dark, fingerprint); nameEl.insertAdjacentElement("afterend", host); keep.add(host);
  }
  for (const host of doc.querySelectorAll(`[${INBOX_BADGE_ATTRIBUTE}]`)) if (!keep.has(host)) host.remove();
  lastApplied.set(doc, { list, text: list.textContent ?? "", hosts: keep.size, threads, dark, own, marked: keep.size });
  return keep.size;
}
