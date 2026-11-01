import type { InstagramInboxBadge, InstagramInboxThread } from "../api";
import { BADGE_CSS, badgeTone, buildBadgeCard, buildPill, placeCard, type BadgeCardData } from "../badgeCard";
import { INBOX_BADGE_ATTRIBUTE, conversationList, inboxChatRows, normalizeDisplayName, uniqueByName } from "../instagram/inbox";

/**
 * Spec 97 §15: the CRM badge next to a chat's name in Instagram's conversation list, like WhatsApp's chat badges (spec 86), with the same pill
 * and hover card (`badgeCard.ts`) including «Abrir en el CRM». The card lives in one fixed layer at the end of `<body>`, so Instagram's scrolling
 * list never clips it, and it is shown on hover/focus of the pill with a short hide delay so the mouse can travel to it. Clicks and presses on the
 * pill and the card stop propagating, so they never trigger Instagram's row navigation. Built with `textContent` in shadow roots
 * (adoptedStyleSheets, or a `<style>` element where constructable sheets are unavailable); never `innerHTML`. Re-applied on every poll, so a
 * re-rendered or recycled row is corrected within one tick.
 */
const CSS = `:host{all:initial;display:inline-flex;flex-shrink:0;vertical-align:middle;margin-left:6px;font:700 11px/20px system-ui,-apple-system,sans-serif}${BADGE_CSS}`;
const CARD_ATTRIBUTE = "data-hospeda-inbox-card", HIDE_MS = 160;
/** Events that must not reach Instagram's row (or its document listeners) from the pill or the card. */
const SWALLOWED = ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend", "dblclick", "contextmenu"] as const;
const sheets = new WeakMap<Document, CSSStyleSheet | null>();

/** Spec 103 §8: short, privacy-safe explanation shown in Instagram settings and copied to the debug log. */
export function inboxBadgeDiagnostic({ enabled, connected, expectedAccount, accountMatches, listFound, known, marked }: { enabled: boolean; connected: boolean; expectedAccount: string | null; accountMatches: boolean; listFound: boolean; known: number; marked: number }): string {
  if (!enabled) return "Apagadas.";
  if (!connected) return "Sin conexión con el CRM.";
  if (expectedAccount && !accountMatches) return `No pudimos confirmar que esta sea la cuenta de Hospeda (@${expectedAccount}).`;
  if (!listFound) return "No encontramos la lista de chats en esta página.";
  if (!known) return "El CRM todavía no conoce chats con nombre: abrí cada chat una vez con el panel.";
  return `${known} chats conocidos · ${marked} marcados en esta lista.`;
}

function styleRoot(doc: Document, root: ShadowRoot): void {
  if (!sheets.has(doc)) {
    try { const View = doc.defaultView as (Window & typeof globalThis) | null; if (!View) throw new Error("no view"); const sheet = new View.CSSStyleSheet(); sheet.replaceSync(CSS); sheets.set(doc, sheet); }
    catch { sheets.set(doc, null); }
  }
  const sheet = sheets.get(doc);
  if (sheet) { try { root.adoptedStyleSheets = [sheet]; return; } catch { /* falls back below */ } }
  const style = doc.createElement("style"); style.textContent = CSS; root.append(style);
}
function swallow(node: HTMLElement): void {
  for (const type of SWALLOWED) node.addEventListener(type, event => event.stopPropagation());
  node.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.stopPropagation(); event.preventDefault(); } });
}

/** Pill text: the code (and «No contactar» when it applies), or how many businesses share that Instagram. */
export function inboxBadgeText(badge: InstagramInboxBadge): string {
  if (badge.kind === "multiple") return `${badge.businesses.length} negocios`;
  return badge.doNotContact || badge.restricted ? `${badge.code} · No contactar` : badge.code;
}
/** The accessible label: spec 86's side card as plain text. */
export function inboxBadgeDetail(badge: InstagramInboxBadge): string {
  if (badge.kind === "multiple") return ["Varios negocios del CRM tienen este Instagram:", ...badge.businesses.map(b => `${b.code} · ${b.name} · ${b.statusLabel || "Sin estado"}`)].join("\n");
  return [`${badge.code} · ${badge.city || "Sin ciudad"}`, badge.name, ...(badge.doNotContact || badge.restricted ? ["No contactar"] : []), `${badge.statusLabel || "Sin estado"} · ${badge.assignedUserName || "Sin responsable"}`, badge.openManagement ? `${badge.openManagement.stageLabel}${badge.openManagement.typeLabel ? ` · ${badge.openManagement.typeLabel}` : ""}` : "Sin gestión abierta"].join("\n");
}
/** The shared hover card's data for an Instagram badge. */
export function inboxCardData(badge: InstagramInboxBadge): BadgeCardData {
  if (badge.kind === "multiple") return { kind: "multiple", businesses: badge.businesses };
  return { kind: "single", accountId: badge.accountId, code: badge.code, name: badge.name, city: badge.city, statusLabel: badge.statusLabel, assignedUserName: badge.assignedUserName, blocked: badge.doNotContact || badge.restricted, openManagement: badge.openManagement };
}

/** The single card layer per document and the pill it currently belongs to. */
type CardLayer = { readonly host: HTMLElement; readonly slot: HTMLElement; readonly onScroll: () => void; anchor: HTMLElement | null; timer: number };
const layers = new WeakMap<Document, CardLayer>();

function cardLayer(doc: Document): CardLayer {
  const existing = layers.get(doc); if (existing && existing.host.isConnected) return existing;
  const host = doc.createElement("span"); host.setAttribute(CARD_ATTRIBUTE, "1"); host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000;overflow:visible";
  const root = host.attachShadow({ mode: "open" }); styleRoot(doc, root); const slot = doc.createElement("span"); root.append(slot);
  const layer: CardLayer = { host, slot, onScroll: () => hideCard(doc), anchor: null, timer: 0 };
  swallow(host); host.addEventListener("mouseenter", () => cancelHide(doc)); host.addEventListener("mouseleave", () => scheduleHide(doc));
  host.addEventListener("focusin", () => cancelHide(doc)); host.addEventListener("focusout", () => scheduleHide(doc));
  host.addEventListener("keydown", event => { if (event.key === "Escape") hideCard(doc); });
  doc.body.append(host); layers.set(doc, layer); return layer;
}
function cancelHide(doc: Document): void { const layer = layers.get(doc); if (layer?.timer) { doc.defaultView?.clearTimeout(layer.timer); layer.timer = 0; } }
function scheduleHide(doc: Document): void { const layer = layers.get(doc); if (!layer) return; cancelHide(doc); layer.timer = doc.defaultView?.setTimeout(() => hideCard(doc), HIDE_MS) ?? 0; }
function hideCard(doc: Document): void {
  const layer = layers.get(doc); if (!layer) return; cancelHide(doc); layer.anchor = null; layer.slot.replaceChildren();
  doc.defaultView?.removeEventListener("scroll", layer.onScroll, true);
}
function showCard(doc: Document, anchor: HTMLElement, pill: HTMLElement, badge: InstagramInboxBadge, base: string, dark: boolean): void {
  const layer = cardLayer(doc), view = doc.defaultView; cancelHide(doc);
  if (layer.anchor === anchor && layer.slot.firstChild) return;
  const card = buildBadgeCard({ doc, base, data: inboxCardData(badge) }); card.classList.add("open");
  layer.host.className = dark ? "dark" : ""; layer.anchor = anchor; layer.slot.replaceChildren(card);
  if (view) { placeCard({ card, anchor: pill.getBoundingClientRect(), view }); view.addEventListener("scroll", layer.onScroll, true); }
}

function badgeHost(doc: Document, badge: InstagramInboxBadge, dark: boolean, fingerprint: string, base: string): HTMLElement {
  const host = doc.createElement("span"); host.setAttribute(INBOX_BADGE_ATTRIBUTE, "1"); host.dataset.fingerprint = fingerprint; host.tabIndex = 0;
  if (dark) host.className = "dark";
  const root = host.attachShadow({ mode: "open" }); styleRoot(doc, root);
  const pill = buildPill({ doc, tone: badgeTone(inboxCardData(badge)), text: inboxBadgeText(badge) });
  pill.setAttribute("aria-label", `CRM: ${inboxBadgeDetail(badge).replace(/\n/g, ". ")}`);
  swallow(host); const show = () => showCard(doc, host, pill, badge, base, dark);
  host.addEventListener("mouseenter", show); host.addEventListener("focusin", show); host.addEventListener("mouseleave", () => scheduleHide(doc)); host.addEventListener("focusout", () => scheduleHide(doc));
  root.append(pill); return host;
}

/** Removes every badge the script added to the page. */
export function removeInboxBadges({ doc }: { doc: Document }): void { lastApplied.delete(doc); hideCard(doc); layers.get(doc)?.host.remove(); layers.delete(doc); for (const host of doc.querySelectorAll(`[${INBOX_BADGE_ATTRIBUTE}]`)) host.remove(); }

/** The last applied input per document: a poll whose list text, badge count, data and theme did not change does no row work (review L4). */
const lastApplied = new WeakMap<Document, { list: Element; text: string; hosts: number; threads: readonly InstagramInboxThread[]; dark: boolean; own: string | null; base: string; marked: number }>();

/**
 * Marks the list rows whose name matches exactly one learned thread and appears in exactly one visible row (decision §15, review M1), and
 * removes every other badge, including ones left on a row Instagram recycled for another chat. Returns how many rows carry a badge.
 */
export function applyInboxBadges({ doc, threads, dark, ownUsername, base }: { doc: Document; threads: readonly InstagramInboxThread[]; dark: boolean; ownUsername?: string | null; base: string }): number {
  const list = conversationList({ doc }), own = ownUsername ?? null;
  if (!list) { removeInboxBadges({ doc }); lastApplied.delete(doc); return 0; }
  const text = list.textContent ?? "", hosts = doc.querySelectorAll(`[${INBOX_BADGE_ATTRIBUTE}]`).length, last = lastApplied.get(doc);
  if (last && last.list === list && last.text === text && last.hosts === hosts && last.threads === threads && last.dark === dark && last.own === own && last.base === base) return last.marked;
  const byName = uniqueByName(threads), keep = new Set<Element>(), rows = inboxChatRows({ doc, ownUsername });
  const seen = new Map<string, number>(); for (const { name } of rows) { const key = normalizeDisplayName(name); seen.set(key, (seen.get(key) ?? 0) + 1); }
  for (const { row, nameEl, name } of rows) {
    const key = normalizeDisplayName(name), thread = seen.get(key) === 1 ? byName.get(key) ?? null : null; if (!thread) continue;
    const fingerprint = JSON.stringify([thread.username, thread.badge, dark, base]);
    const current = row.querySelector<HTMLElement>(`[${INBOX_BADGE_ATTRIBUTE}]`);
    if (current && current.dataset.fingerprint === fingerprint && current.previousElementSibling === nameEl) { keep.add(current); continue; }
    const host = badgeHost(doc, thread.badge, dark, fingerprint, base); nameEl.insertAdjacentElement("afterend", host); keep.add(host);
  }
  for (const host of doc.querySelectorAll(`[${INBOX_BADGE_ATTRIBUTE}]`)) if (!keep.has(host)) host.remove();
  const anchor = layers.get(doc)?.anchor; if (anchor && !anchor.isConnected) hideCard(doc);
  lastApplied.set(doc, { list, text: list.textContent ?? "", hosts: keep.size, threads, dark, own, base, marked: keep.size });
  return keep.size;
}
