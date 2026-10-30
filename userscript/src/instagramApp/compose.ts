import type { InstagramMatch, InstagramTemplate, InstagramTemplatesResponse, PreparedTemplate, ScriptPurpose } from "../api";
import { composerEmpty, focusComposer, insertIntoComposer } from "../instagram/insert";
import type { InstagramApi } from "./client";

/**
 * Spec 97 §4.3 «Mandar un mensaje» on Instagram: the WhatsApp view's flow (`compose.ts`) without persons, materials or replacing text. The CRM
 * prepares the draft for the business username; «Pegar en el chat» re-proves the chat, records `instagram_opened` once per draft and writes into
 * Instagram's empty composer. It never sends. A copy of the WhatsApp view rather than a shared adapter: `compose.ts` is bound to WhatsApp's
 * selectors, which must never load on instagram.com (§5.4.7).
 */
export const NOT_SENT_NOTE = "El mensaje no se envía solo: se pega en el chat para que lo revises y lo envíes vos.";
export const CHAT_CHANGED = "El chat cambió. Volvé al negocio y abrí los modelos desde este chat.";
/** L1: the CRM prepared the draft for another Instagram user than this chat's (the business username changed meanwhile). */
export const RECIPIENT_MISMATCH = "El mensaje es para otro usuario de Instagram. Volvé al negocio y revisá su Instagram en el CRM.";
export const COMPOSER_BUSY = 'La caja de Instagram ya tiene texto. Borralo y tocá "Pegar en el chat" de nuevo.';
export const PASTE_FAILED = "No pude escribir en la caja de Instagram. Copialo y pegalo con Ctrl+V.";
export const ALREADY_CONFIRMED = "Instagram ya confirmó este mensaje: no hace falta pegarlo.";

export type ComposeContext = {
  readonly doc: Document;
  readonly api: InstagramApi;
  readonly match: InstagramMatch;
  readonly username: string;
  /** Instagram's JS cannot drive the view: CRM calls and composer writes need a trusted event (§5.4.4). */
  readonly trusted: (event: Event) => boolean;
  /** Null when the open chat is still the one this view was opened for (same id, same username, Hospeda account); else the reason. */
  readonly checkChat: () => string | null;
  /** The page's own composer (never a floating one), or null. */
  readonly composer: () => HTMLElement | null;
  readonly back: () => void;
  readonly header: (title: string) => HTMLElement;
  readonly settle?: () => Promise<void>;
  readonly newId?: () => string;
  readonly clipboard?: Pick<Clipboard, "writeText">;
};
/** The scope of a draft: a management, or «Sin gestión» (empty `leadId`) with its purpose (decision 12.6). */
type Choice = { leadId: string; purpose: ScriptPurpose | null; otherPurpose: string; templateId: string };
type State = Choice & { busy: boolean; prepared: PreparedTemplate | null; error: string; dispatched: boolean; done: "pasted" | "copied" | null; pasteFailed: boolean };
const GENERAL = "";

/** First open management and its recommended template; without managements, «Sin gestión» with the CRM's default purpose. */
export function initialInstagramChoice(data: InstagramTemplatesResponse): Choice {
  const lead = data.leads[0];
  if (lead) return { leadId: lead.id, purpose: null, otherPurpose: "", templateId: lead.templates.find(t => t.recommended)?.id ?? lead.templates[0]?.id ?? "" };
  const purpose = data.general?.purposes.find(p => p.value === data.general?.defaultPurpose) ?? data.general?.purposes[0];
  return { leadId: GENERAL, purpose: purpose?.value ?? null, otherPurpose: "", templateId: purpose?.templates.find(t => t.recommended)?.id ?? purpose?.templates[0]?.id ?? "" };
}
/** The templates of the chosen scope. */
export function templatesFor(data: InstagramTemplatesResponse, choice: Pick<Choice, "leadId" | "purpose">): InstagramTemplate[] {
  return choice.leadId ? data.leads.find(lead => lead.id === choice.leadId)?.templates ?? [] : data.general?.purposes.find(p => p.value === choice.purpose)?.templates ?? [];
}

export function openInstagramCompose(card: HTMLElement, ctx: ComposeContext): void {
  const { doc, api, match } = ctx, settle = ctx.settle ?? (() => new Promise<void>(resolve => setTimeout(resolve, 60))), newId = ctx.newId ?? (() => crypto.randomUUID());
  const state: State = { leadId: "", purpose: null, otherPurpose: "", templateId: "", busy: false, prepared: null, error: "", dispatched: false, done: null, pasteFailed: false };
  let data: InstagramTemplatesResponse | null = null;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => { const node = doc.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
  const button = (text: string, className: string, run: () => void, disabled = false) => { const node = el("button", className, text); node.type = "button"; node.disabled = disabled; node.addEventListener("click", event => { if (ctx.trusted(event)) run(); }); return node; };
  const failure = (cause: unknown, fallback: string) => cause instanceof Error && cause.message ? cause.message : fallback;

  function preview(text: string, missing: string[]): HTMLElement {
    const box = el("div", "box text"), pattern = /{{\s*(\w+)\s*}}/g; box.style.whiteSpace = "pre-line"; let start = 0, found: RegExpExecArray | null;
    while ((found = pattern.exec(text))) { if (!missing.includes(found[1]!)) continue; box.append(doc.createTextNode(text.slice(start, found.index)), el("mark", "note warn", found[0])); start = pattern.lastIndex; }
    box.append(doc.createTextNode(text.slice(start))); return box;
  }
  function popover(row: HTMLElement, template: InstagramTemplate): HTMLElement {
    const pop = el("div", "popover"), text = el("div"); text.append(doc.createTextNode(template.body)); pop.append(el("strong", undefined, template.name), text);
    const view = doc.defaultView, rect = row.getBoundingClientRect(), panel = (row.closest(".panel") || row).getBoundingClientRect();
    pop.style.top = `${Math.max(8, Math.min(rect.top, (view?.innerHeight ?? 800) - 240))}px`; pop.style.right = `${Math.max(8, (view?.innerWidth ?? 1200) - panel.left + 8)}px`; return pop;
  }

  function render(): void {
    card.parentElement?.querySelectorAll(".popover").forEach(pop => pop.remove());
    const body = el("div", "body"), footer = el("div", "footer"); body.setAttribute("aria-busy", String(state.busy));
    if (state.done) {
      body.append(el("p", "muted", state.done === "pasted" ? "Revisalo y envialo vos. Si al final no lo mandás, avisalo acá." : "Pegalo en el chat con Ctrl+V, revisalo y envialo vos. Si al final no lo mandás, avisalo acá."));
      if (state.error) footer.append(el("p", "note warn", state.error));
      const grid = el("div", "actions grid");
      const back = el("button", "btn primary", "Volver al negocio"); back.type = "button"; back.disabled = state.busy; back.addEventListener("click", () => ctx.back());
      grid.append(back, button("Cambiar de modelo", "btn", () => { state.done = null; render(); }, state.busy), button(state.busy ? "Registrando…" : "No lo voy a enviar", "btn", () => void notSent(), state.busy));
      footer.append(grid); card.replaceChildren(ctx.header(state.done === "pasted" ? "Listo, está en el chat" : "Texto copiado"), body, footer); return;
    }
    if (!data) { body.append(state.error ? el("p", "note warn", state.error) : el("p", "muted", "Cargando modelos…")); card.replaceChildren(ctx.header("Mandar un mensaje"), body); return; }
    if (data.blocked) body.append(el("p", "note warn", data.blocked));
    const scopes = [...data.leads.map(lead => ({ id: lead.id, label: `${lead.name} · ${lead.stage}` })), ...(data.general ? [{ id: GENERAL, label: "Sin gestión" }] : [])];
    if (scopes.length > 1) {
      const field = el("label", "field", "Gestión"), select = el("select"); select.disabled = state.busy;
      for (const scope of scopes) { const option = el("option", undefined, scope.label); option.value = scope.id; option.selected = scope.id === state.leadId; select.append(option); }
      select.addEventListener("change", event => { if (!ctx.trusted(event)) return; const lead = data!.leads.find(item => item.id === select.value); choose(lead ? { leadId: lead.id, purpose: null, otherPurpose: "", templateId: lead.templates.find(t => t.recommended)?.id ?? lead.templates[0]?.id ?? "" } : initialInstagramChoice({ ...data!, leads: [] })); });
      field.append(select); body.append(field);
    }
    if (!state.leadId && data.general) {
      const field = el("label", "field", "Propósito"), select = el("select"); select.disabled = state.busy;
      for (const purpose of data.general.purposes) { const option = el("option", undefined, purpose.label); option.value = purpose.value; option.selected = purpose.value === state.purpose; select.append(option); }
      select.addEventListener("change", event => { if (!ctx.trusted(event)) return; const purpose = data!.general!.purposes.find(p => p.value === select.value); if (purpose) choose({ leadId: GENERAL, purpose: purpose.value, otherPurpose: "", templateId: purpose.templates.find(t => t.recommended)?.id ?? purpose.templates[0]?.id ?? "" }); });
      field.append(select); body.append(field);
      if (state.purpose === "other") {
        const other = el("label", "field", "Aclaración del propósito"), input = el("input"); input.value = state.otherPurpose; input.maxLength = 300; input.disabled = state.busy;
        input.addEventListener("change", event => { if (!ctx.trusted(event)) return; choose({ ...state, otherPurpose: input.value }); });
        other.append(input); body.append(other);
      }
    }
    const templates = templatesFor(data, state);
    const section = el("div", "section"); section.append(el("h3", undefined, "MODELOS PARA ESTA GESTIÓN"));
    if (!templates.length) section.append(el("p", "muted", "No hay modelos de Instagram compatibles con esta gestión."));
    for (const template of templates) {
      const row = el("label", "row"), radio = el("input"), content = el("span", "content");
      radio.type = "radio"; radio.name = "hospeda-instagram-template"; radio.checked = template.id === state.templateId; radio.disabled = state.busy;
      radio.addEventListener("change", event => { if (ctx.trusted(event)) choose({ ...state, templateId: template.id }); });
      content.append(el("strong", undefined, template.name)); if (template.recommended) content.append(el("span", "muted", "Recomendado para la etapa actual"));
      row.append(radio, content); section.append(row);
      let pop: HTMLElement | null = null; const hide = () => { pop?.remove(); pop = null; };
      if (template.body) { row.addEventListener("mouseenter", () => { hide(); pop = popover(row, template); card.after(pop); }); row.addEventListener("mouseleave", hide); }
    }
    body.append(section);
    if (state.prepared) {
      const box = el("div", "section"); box.append(el("h3", undefined, "VISTA PREVIA"), el("span", "muted", `Para @${ctx.username}`), preview(state.prepared.body, state.prepared.unresolved));
      if (state.prepared.unresolved.length) box.append(el("p", "note warn", `Falta ${state.prepared.unresolved.join(", ")}. Completalo en el CRM.`));
      body.append(box);
    } else if (state.busy) body.append(el("p", "muted", "Preparando el mensaje…"));
    footer.append(el("p", "note info", NOT_SENT_NOTE));
    if (state.error) footer.append(el("p", "note warn", state.error));
    const actions = el("div", "actions"), ready = !!state.prepared && !data.blocked && !state.prepared.unresolved.length;
    if (state.pasteFailed) actions.append(button("Copiar texto", "btn primary", () => void copy(), state.busy), button("Reintentar", "btn", () => void paste(), state.busy));
    else actions.append(button(state.busy ? "Procesando…" : "Pegar en el chat", "btn primary", () => void paste(), state.busy || !ready), button("Copiar", "btn", () => void copy(), state.busy || !ready));
    const back = el("button", "btn", "Volver al negocio"); back.type = "button"; back.disabled = state.busy; back.addEventListener("click", () => ctx.back());
    footer.append(actions, back); card.replaceChildren(ctx.header("Mandar un mensaje"), body, footer);
  }

  /** A new template, management or purpose is a new draft: it has not been opened in Instagram yet. */
  function choose(next: Choice): void { state.leadId = next.leadId; state.purpose = next.purpose; state.otherPurpose = next.otherPurpose; state.templateId = next.templateId; state.prepared = null; state.dispatched = false; state.pasteFailed = false; state.error = ""; void prepare(); }
  async function run(work: () => Promise<void>, fallback: string): Promise<void> {
    if (state.busy) return; state.busy = true; state.error = ""; render();
    try { await work(); } catch (cause) { state.error = failure(cause, fallback); } finally { state.busy = false; render(); }
  }
  function prepare(): Promise<void> {
    if (!state.templateId || (!state.leadId && (!state.purpose || (state.purpose === "other" && !state.otherPurpose.trim())))) { render(); return Promise.resolve(); }
    return run(async () => { state.prepared = await api.prepare({ id: newId(), accountId: match.accountId, leadId: state.leadId || null, templateId: state.templateId, ...(state.leadId ? {} : { purpose: state.purpose, otherPurpose: state.purpose === "other" ? state.otherPurpose.trim() : null }) }); }, "No se pudo preparar el mensaje. Podés reintentar.");
  }
  /** Right before the text leaves the panel: same chat, then «Instagram abierto» in the CRM (once per draft, so the echo can confirm it). */
  async function open(): Promise<PreparedTemplate | null> {
    const prepared = state.prepared!;
    // Before anything is recorded: the draft must be addressed to this chat's user.
    if (prepared.recipient.replace(/^@/, "").toLowerCase() !== ctx.username.toLowerCase()) throw new Error(RECIPIENT_MISMATCH);
    const changed = ctx.checkChat(); if (changed) throw new Error(changed);
    if (!state.dispatched) {
      const result = await api.dispatch({ id: prepared.messageId, revision: prepared.revision }); state.dispatched = true;
      if (result.alreadyConfirmed) { state.error = ALREADY_CONFIRMED; return null; }
    }
    return prepared;
  }
  /** D3: never replaces text already in Instagram's composer. The attempt stays `instagram_opened` when the insertion fails. */
  function paste(): Promise<void> {
    return run(async () => {
      const before = ctx.composer();
      if (before && !composerEmpty(before)) throw new Error(COMPOSER_BUSY);
      const prepared = await open(); if (!prepared) return;
      // The seller may have switched chats or typed during the requests: check again before touching the editor.
      const changed = ctx.checkChat(); if (changed) throw new Error(CHAT_CHANGED);
      const composer = ctx.composer();
      if (composer && !composerEmpty(composer)) throw new Error(COMPOSER_BUSY);
      if (!composer) { state.pasteFailed = true; throw new Error(PASTE_FAILED); }
      focusComposer(composer);
      const inserted = await insertIntoComposer({ composer, text: prepared.body, settle });
      if (!inserted.ok) { state.pasteFailed = true; throw new Error(inserted.reason === "different" ? "Se insertó un texto distinto: revisalo antes de enviar." : PASTE_FAILED); }
      state.pasteFailed = false; state.done = "pasted";
    }, "No se pudo pegar. Podés reintentar.");
  }
  function copy(): Promise<void> {
    return run(async () => { const prepared = await open(); if (!prepared) return; await (ctx.clipboard ?? navigator.clipboard).writeText(prepared.body); state.done = "copied"; }, "No se pudo copiar. Podés reintentar.");
  }
  function notSent(): Promise<void> { return run(async () => { await api.markNotSent(state.prepared!.messageId); ctx.back(); }, "No se pudo registrar. Podés reintentar."); }

  render();
  void (async () => {
    try { data = await api.fetchTemplates(match.accountId); const first = initialInstagramChoice(data); if (data.blocked) { state.leadId = first.leadId; render(); } else choose(first); }
    catch (cause) { state.error = failure(cause, "No se pudieron cargar los modelos. Volvé al negocio y probá de nuevo."); render(); }
  })();
}
