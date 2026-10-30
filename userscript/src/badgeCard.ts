/**
 * The CRM chat badge shared by WhatsApp's chat list (spec 86) and Instagram's conversation list (spec 97 §15): the pill and its hover card, so
 * both apps look identical. Everything is built with `textContent` (never `innerHTML`); the CSS goes into each badge's shadow root and only uses
 * `--hb-` tokens (the panel palette in `styles.ts`), so the page's own variables never leak in. Dark mode is the host's `.dark` class.
 */

/** A business in a «multiple» card: linked to its account when the id is known. */
export type BadgeCardBusiness = { readonly accountId?: string; readonly code: string; readonly name: string; readonly statusLabel: string | null };
/** What the card shows, already reduced from either app's badge payload. */
export type BadgeCardData =
  | { readonly kind: "single"; readonly accountId?: string; readonly code: string; readonly name: string; readonly city: string | null; readonly statusLabel: string | null; readonly assignedUserName: string | null; readonly blocked: boolean; readonly openManagement: { readonly stageLabel: string; readonly typeLabel: string | null } | null; readonly lastWhatsapp?: string | null }
  | { readonly kind: "multiple"; readonly businesses: readonly BadgeCardBusiness[] }
  | { readonly kind: "none" };
/** Pill color: blue (linked), red (no contact), amber (several businesses), dashed (not in the CRM). */
export type BadgeTone = "" | "red" | "amber" | "none";

export const BADGE_CSS = ":host{--hb-bg:#fff;--hb-surface:#f5f7fb;--hb-chip:#eef2f8;--hb-border:#e3e8f0;--hb-text:#0f172a;--hb-muted:#5b6678;--hb-primary:#2563eb;--hb-primary-hover:#1d4ed8;--hb-ink:#1d4ed8;--hb-danger-bg:#fdecec;--hb-danger-text:#991b1b;--hb-warn-bg:#fff4dc;--hb-warn-text:#7a4b00;--hb-shadow:0 12px 32px -10px #0f172a59,0 2px 6px -2px #0f172a26}"
  + ":host(.dark){--hb-bg:#161d24;--hb-surface:#1b2530;--hb-chip:#1f2a36;--hb-border:#2a3540;--hb-text:#e9edf2;--hb-muted:#9aa7b4;--hb-ink:#93c5fd;--hb-danger-bg:#3b1414;--hb-danger-text:#fecaca;--hb-warn-bg:#3a2a12;--hb-warn-text:#fde68a;--hb-shadow:0 14px 36px -10px #000c,0 2px 6px -2px #0008}"
  + ".pill{box-sizing:border-box;height:20px;padding:0 8px 0 3px;border-radius:999px;border:1px solid transparent;background:#2563eb;color:#fff;font:700 11px/18px system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;letter-spacing:.01em;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;cursor:default;box-shadow:0 1px 2px #0f172a40}"
  + ".dot{width:14px;height:14px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#2563eb;font-size:9px;font-weight:800;line-height:1}"
  + ".pill.red{background:#dc2626}.red .dot{color:#dc2626}.pill.amber{background:#b45309}.amber .dot{color:#b45309}"
  + ".pill.none{background:transparent;border:1px dashed #94a3b8;color:#64748b;font-weight:600;box-shadow:none;padding:0 8px}.none .dot{display:none}"
  + ":host(.dark) .pill{box-shadow:0 1px 2px #0009}:host(.dark) .pill.none{border-color:#4a5863;color:#9aa7b4;box-shadow:none}"
  + ".card{display:none;position:fixed;z-index:2147483001;box-sizing:border-box;width:312px;max-width:calc(100vw - 16px);padding:14px;border:1px solid var(--hb-border);border-radius:12px;background:var(--hb-bg);color:var(--hb-text);box-shadow:var(--hb-shadow);font:400 13px/1.45 system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;text-align:left;white-space:normal;cursor:default}"
  + ":host(:hover) .card,:host(:focus-within) .card,.card.open{display:block}"
  + ".card::before{content:\"\";position:absolute;top:0;left:-14px;width:14px;height:100%}.card.left::before{left:auto;right:-14px}"
  + ".head{display:flex;align-items:flex-start;gap:10px}.code{flex:none;padding:2px 8px;border-radius:6px;background:#2563eb;color:#fff;font-weight:700;font-size:12px;line-height:18px}"
  + ".titles{min-width:0}.name{font-weight:700;font-size:14px;line-height:1.3;overflow-wrap:anywhere}.city{color:var(--hb-muted);font-size:12px}"
  + ".chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.chip{padding:1px 8px;border-radius:999px;background:var(--hb-chip);color:var(--hb-text);font-size:11px;font-weight:600;line-height:18px}.chip.danger{background:var(--hb-danger-bg);color:var(--hb-danger-text)}"
  + ".rows{display:grid;gap:6px;margin-top:10px;padding:10px;border-radius:8px;background:var(--hb-surface)}.kv{display:flex;gap:8px;font-size:12px}.k{flex:none;width:84px;color:var(--hb-muted)}.v{min-width:0;overflow-wrap:anywhere}"
  + ".lead{color:var(--hb-muted);font-size:12px}.lead.warn{margin:-2px 0 0;padding:6px 8px;border-radius:8px;background:var(--hb-warn-bg);color:var(--hb-warn-text);font-weight:600}"
  + ".list{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:4px}.item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;color:var(--hb-text);text-decoration:none;background:var(--hb-surface)}a.item:hover{background:var(--hb-chip)}"
  + ".item .code{padding:0 6px;font-size:11px}.item .name{flex:1;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.item .st{flex:none;color:var(--hb-muted);font-size:11px}"
  + ".foot{margin-top:12px}.btn{display:flex;justify-content:center;align-items:center;height:32px;border-radius:8px;background:var(--hb-primary);color:#fff;font-weight:600;font-size:13px;text-decoration:none}.btn:hover{background:var(--hb-primary-hover)}"
  + "a:focus-visible{outline:2px solid var(--hb-primary);outline-offset:2px}";

/** The pill color for a card. */
export function badgeTone(data: BadgeCardData): BadgeTone {
  return data.kind === "none" ? "none" : data.kind === "multiple" ? "amber" : data.blocked ? "red" : "";
}

/** The pill: the «H» mark (hidden for «Sin CRM») and a short text. */
export function buildPill({ doc, tone, text }: { doc: Document; tone: BadgeTone; text: string }): HTMLElement {
  const pill = doc.createElement("span"), dot = doc.createElement("span");
  pill.className = `pill ${tone}`.trim(); dot.className = "dot"; dot.textContent = "H";
  pill.append(dot, doc.createTextNode(text)); return pill;
}

const accountUrl = (base: string, accountId: string) => `${base}/accounts/${encodeURIComponent(accountId)}`;
function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node;
}
function link(doc: Document, className: string, href: string): HTMLAnchorElement {
  const a = el(doc, "a", className); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; a.addEventListener("click", event => event.stopPropagation()); return a;
}
function kv(doc: Document, key: string, value: string): HTMLElement {
  const row = el(doc, "div", "kv"); row.append(el(doc, "span", "k", key), el(doc, "span", "v", value)); return row;
}

/** The hover card: header, status chips, owner and management, the businesses of a «multiple», and «Abrir en el CRM». */
export function buildBadgeCard({ doc, base, data }: { doc: Document; base: string; data: BadgeCardData }): HTMLElement {
  const card = el(doc, "div", "card"); card.setAttribute("role", "group");
  if (data.kind === "none") { card.setAttribute("aria-label", "Sin asociar al CRM"); card.append(el(doc, "div", "name", "Sin asociar al CRM"), el(doc, "div", "lead", "Ningún negocio del CRM tiene este chat.")); return card; }
  if (data.kind === "multiple") {
    card.setAttribute("aria-label", `${data.businesses.length} negocios posibles`);
    const list = el(doc, "ul", "list");
    for (const b of data.businesses) {
      const item = b.accountId ? link(doc, "item", accountUrl(base, b.accountId)) : el(doc, "span", "item");
      item.append(el(doc, "span", "code", b.code), el(doc, "span", "name", b.name), el(doc, "span", "st", b.statusLabel || "Sin estado"));
      const li = el(doc, "li", ""); li.append(item); list.append(li);
    }
    card.append(el(doc, "div", "lead warn", `${data.businesses.length} negocios del CRM coinciden con este chat`), list); return card;
  }
  card.setAttribute("aria-label", `${data.code} · ${data.name}`);
  const head = el(doc, "div", "head"), titles = el(doc, "div", "titles");
  titles.append(el(doc, "div", "name", data.name || data.code), el(doc, "div", "city", data.city || "Sin ciudad")); head.append(el(doc, "span", "code", data.code), titles);
  const chips = el(doc, "div", "chips"); chips.append(el(doc, "span", "chip", data.statusLabel || "Sin estado")); if (data.blocked) chips.append(el(doc, "span", "chip danger", "No contactar"));
  const mgmt = data.openManagement, rows = el(doc, "div", "rows");
  rows.append(kv(doc, "Responsable", data.assignedUserName || "Sin responsable"), kv(doc, "Gestión", mgmt ? [mgmt.stageLabel, mgmt.typeLabel].filter(Boolean).join(" · ") : "Sin gestión abierta"));
  if (data.lastWhatsapp) rows.append(kv(doc, "Último WhatsApp", data.lastWhatsapp));
  card.append(head, chips, rows);
  if (data.accountId) { const foot = el(doc, "div", "foot"), open = link(doc, "btn", accountUrl(base, data.accountId)); open.textContent = "Abrir en el CRM"; foot.append(open); card.append(foot); }
  return card;
}

/**
 * Positions a `position:fixed` card beside `anchor` (a viewport rect): to the right, or to the left when it would overflow, and shifted up to
 * stay inside the viewport. The `.left` class moves the hover bridge to the side facing the pill.
 */
export function placeCard({ card, anchor, view }: { card: HTMLElement; anchor: DOMRect; view: Window }): void {
  const gap = 8, margin = 8, width = card.offsetWidth || 312, height = card.offsetHeight || 220;
  const right = anchor.right + gap, flip = right + width > view.innerWidth - margin && anchor.left - gap - width >= margin;
  const left = flip ? anchor.left - gap - width : Math.max(margin, Math.min(right, view.innerWidth - margin - width));
  const top = Math.max(margin, Math.min(anchor.top - 6, view.innerHeight - margin - height));
  card.style.left = `${left}px`; card.style.top = `${top}px`; card.classList.toggle("left", flip);
}
