import { ApiError, dispatchTemplate, fetchTemplates, markTemplateNotSent, prepareTemplate, type Match, type PreparedTemplate, type TemplateLead } from "./api";
import { chatMatchesRecipient, clearComposer, composerEquals, getWhatsAppComposer, pasteIntoComposer } from "./selectors";
import type { UiOptions } from "./ui";

const TOKEN_KEY = "hospeda-userscript-token";
export const NOT_SENT_BY_SCRIPT = "El mensaje no se envía solo: se pega en el chat para que lo revises y aprietes Enter.";
export const PASTE_FAILED = "No pude escribir en la caja de WhatsApp. Copialo y pegalo con Ctrl+V.";
const CHAT_CHANGED = "El chat cambió. Volvé al negocio y abrí los modelos desde este chat.";
const WRONG_PHONE = "El teléfono del chat no coincide con la persona elegida. No pegué el mensaje.";

type Choice = { leadId: string; templateId: string; contactId: string | null };
type Done = "pasted" | "copied" | null;
type State = Choice & { busy: boolean; prepared: PreparedTemplate | null; error: string; dispatched: boolean; done: Done; pasteFailed: boolean; confirmReplace: boolean };

/**
 * The last model the script pasted in each business's chat, kept across reloads (a week, like an open attempt). Its text in the composer is
 * replaced without asking, and any replacement closes that attempt as not sent, so a later register cannot complete the wrong model.
 */
const PASTED_KEY = "hospeda-userscript-pasted", PASTED_TTL_MS = 7 * 24 * 60 * 60_000;
type Pasted = { messageId: string; body: string; at: number };
function pastedAll(now = Date.now()): Record<string, Pasted> { const all = GM_getValue<Record<string, Pasted>>(PASTED_KEY, {}); return Object.fromEntries(Object.entries(all).filter(([, item]) => now - item.at < PASTED_TTL_MS)); }
function lastPasted(accountId: string): Pasted | null { return pastedAll()[accountId] ?? null; }
function rememberPasted(accountId: string, item: Pasted | null): void { const all = pastedAll(); if (item) all[accountId] = item; else delete all[accountId]; GM_setValue(PASTED_KEY, all); }
/** Closes an earlier pasted attempt as not sent; one already resolved (sent and registered, or closed) needs nothing more. */
async function closePasted(base: string, item: Pasted): Promise<void> {
  try { await markTemplateNotSent(base, token(), item.messageId); }
  catch (cause) { if (!(cause instanceof ApiError && cause.status === 409)) throw cause; }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
function button(text: string, className: string, onClick: () => void, disabled = false): HTMLButtonElement { const node = el("button", className, text); node.type = "button"; node.disabled = disabled; node.addEventListener("click", onClick); return node; }
const token = () => GM_getValue<string>(TOKEN_KEY, "");
const failure = (cause: unknown, fallback: string) => cause instanceof Error && cause.message ? cause.message : fallback;

/** First open management, its recommended model and its default person: what the CRM itself would preselect. */
export function initialComposeChoice(leads: TemplateLead[]): Choice {
  const lead = leads[0];
  return { leadId: lead?.id || "", templateId: lead?.templates.find(t => t.recommended)?.id || lead?.templates[0]?.id || "", contactId: lead?.contacts.find(c => c.default)?.id ?? null };
}
/** A model with missing data or a blocked business never reaches the chat. */
export function canPasteTemplate(prepared: PreparedTemplate | null, blocked: string | null): boolean { return !!prepared && !blocked && !prepared.unresolved.length; }

/** Variables the CRM could not fill stay visible as `{{name}}`; they are highlighted so the seller sees what is missing. */
function previewText(text: string, missing: string[]): HTMLElement {
  const box = el("div", "box text"), pattern = /{{\s*(\w+)\s*}}/g; box.style.whiteSpace = "pre-line"; let start = 0, match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (!missing.includes(match[1]!)) continue;
    box.append(document.createTextNode(text.slice(start, match.index)), el("mark", "note warn", match[0])); start = pattern.lastIndex;
  }
  box.append(document.createTextNode(text.slice(start))); return box;
}

/** The raw model next to the panel while hovering its row: variables stay as `{{name}}`, so it shows the structure without preparing a draft. */
function templatePopover(row: HTMLElement, template: { name: string; body: string }): HTMLElement {
  const pop = el("div", "popover"), text = el("div"), pattern = /{{\s*\w+\s*}}/g; let start = 0, match: RegExpExecArray | null;
  while ((match = pattern.exec(template.body))) { text.append(document.createTextNode(template.body.slice(start, match.index)), el("mark", undefined, match[0])); start = pattern.lastIndex; }
  text.append(document.createTextNode(template.body.slice(start))); pop.append(el("strong", undefined, template.name), text);
  const rect = row.getBoundingClientRect(), panel = (row.closest(".panel") || row).getBoundingClientRect();
  pop.style.top = `${Math.max(8, Math.min(rect.top, window.innerHeight - 240))}px`; pop.style.right = `${Math.max(8, window.innerWidth - panel.left + 8)}px`;
  return pop;
}

/**
 * The «Mandar un mensaje» view (spec 84). It prepares the model through the CRM, and pasting or copying marks it as «WhatsApp abierto».
 * It never sends: no Enter, no click on WhatsApp's send button. The seller reviews the text in the chat and sends it.
 */
export function openCompose(card: HTMLElement, options: UiOptions, match: Match, back: () => void, header: (title: string) => HTMLElement): void {
  const base = options.crmBase || "", state: State = { leadId: "", templateId: "", contactId: null, busy: false, prepared: null, error: "", dispatched: false, done: null, pasteFailed: false, confirmReplace: false };
  let data: { leads: TemplateLead[]; blocked: string | null } | null = null;
  const head = header;

  function render(): void {
    card.parentElement?.querySelectorAll(".popover").forEach(pop => pop.remove()); // a re-render drops the hovered row without a mouseleave
    // The list scrolls inside the body; the notice and the buttons stay in the footer, always in view.
    const body = el("div", "body"), footer = el("div", "footer"); body.setAttribute("aria-busy", String(state.busy));
    if (state.done) {
      body.append(el("p", "muted", state.done === "pasted" ? "Revisalo y apretá Enter para enviarlo. Si al final no lo mandás, avisalo acá." : "Pegalo en el chat con Ctrl+V, revisalo y envialo. Si al final no lo mandás, avisalo acá."));
      if (state.error) footer.append(el("p", "note warn", state.error));
      const grid = el("div", "actions grid");
      grid.append(button("Volver al negocio", "btn primary", back, state.busy), button("Cambiar de modelo", "btn", () => { state.done = null; render(); }, state.busy), button(state.busy ? "Registrando…" : "No lo voy a enviar", "btn", () => void notSent(), state.busy));
      footer.append(grid); card.replaceChildren(head(state.done === "pasted" ? "Listo, está en el chat" : "Texto copiado"), body, footer); return;
    }
    if (!data) { body.append(state.error ? el("p", "note warn", state.error) : el("p", "muted", "Cargando modelos…")); card.replaceChildren(head("Mandar un mensaje"), body); return; }
    if (data.blocked) body.append(el("p", "note warn", data.blocked));
    if (data.leads.length > 1) {
      const field = el("label", "field", "Gestión"), select = el("select"); select.disabled = state.busy;
      for (const lead of data.leads) { const option = el("option", undefined, `${lead.name} · ${lead.stage}`); option.value = lead.id; option.selected = lead.id === state.leadId; select.append(option); }
      select.addEventListener("change", () => { const next = data!.leads.find(lead => lead.id === select.value); if (next) choose(initialComposeChoice([next])); });
      field.append(select); body.append(field);
    }
    const lead = data.leads.find(item => item.id === state.leadId);
    if (lead) {
      const section = el("div", "section"); section.append(el("h3", undefined, "MODELOS PARA ESTA GESTIÓN"));
      if (!lead.templates.length) section.append(el("p", "muted", "No hay modelos de WhatsApp compatibles con esta gestión."));
      for (const template of lead.templates) {
        const row = el("label", "row"), radio = el("input"), content = el("span", "content");
        radio.type = "radio"; radio.name = "hospeda-template"; radio.checked = template.id === state.templateId; radio.disabled = state.busy;
        radio.addEventListener("change", () => choose({ ...state, templateId: template.id }));
        content.append(el("strong", undefined, template.name)); if (template.recommended) content.append(el("span", "muted", "Recomendado para la etapa actual"));
        row.append(radio, content); section.append(row);
        let pop: HTMLElement | null = null;
        const hide = () => { pop?.remove(); pop = null; };
        if (template.body) { row.addEventListener("mouseenter", () => { hide(); pop = templatePopover(row, template); card.after(pop); }); row.addEventListener("mouseleave", hide); radio.addEventListener("change", hide); }
      }
      body.append(section);
      const field = el("label", "field", "Persona"), select = el("select"); select.disabled = state.busy;
      for (const person of [{ id: "", name: "Teléfono del negocio" }, ...lead.contacts.map(contact => ({ id: contact.id, name: `${contact.name} · ${contact.phone}` }))]) { const option = el("option", undefined, person.name); option.value = person.id; option.selected = (state.contactId || "") === person.id; select.append(option); }
      select.addEventListener("change", () => choose({ ...state, contactId: select.value || null }));
      field.append(select); body.append(field);
    }
    if (state.prepared) {
      const section = el("div", "section"); section.append(el("h3", undefined, "VISTA PREVIA"), el("span", "muted", `Para ${state.prepared.recipientName || "el negocio"} · ${state.prepared.recipient}`), previewText(state.prepared.body, state.prepared.unresolved));
      if (state.prepared.unresolved.length) section.append(el("p", "note warn", `Falta ${state.prepared.unresolved.join(", ")}. Completalo en el CRM o elegí otra persona.`));
      body.append(section);
    } else if (state.busy) body.append(el("p", "muted", "Preparando el mensaje…"));
    footer.append(el("p", "note info", NOT_SENT_BY_SCRIPT));
    if (state.error) footer.append(el("p", "note warn", state.error));
    const actions = el("div", "actions"), ready = canPasteTemplate(state.prepared, data.blocked);
    if (state.confirmReplace) {
      footer.append(el("p", "note warn", "La caja de WhatsApp tiene un texto que no pegó el script. ¿Lo reemplazo por este mensaje?"));
      actions.append(button("Reemplazar", "btn primary", () => void paste(true), state.busy), button("Cancelar", "btn", () => { state.confirmReplace = false; render(); }, state.busy));
    } else if (state.pasteFailed) actions.append(button("Copiar texto", "btn primary", () => void copy(), state.busy), button("Reintentar", "btn", () => void paste(), state.busy));
    else actions.append(button(state.busy ? "Procesando…" : "Pegar en el chat", "btn primary", () => void paste(), state.busy || !ready), button("Copiar", "btn", () => void copy(), state.busy || !ready));
    footer.append(actions); card.replaceChildren(head("Mandar un mensaje"), body, footer);
  }

  /** A new model, person or management is a new draft: it has not been opened in WhatsApp yet. */
  function choose(next: Choice): void { state.leadId = next.leadId; state.templateId = next.templateId; state.contactId = next.contactId; state.prepared = null; state.dispatched = false; state.pasteFailed = false; state.confirmReplace = false; void prepare(); }
  async function run(work: () => Promise<void>, fallback: string): Promise<void> {
    if (state.busy) return; state.busy = true; state.error = ""; render();
    try { await work(); } catch (cause) { state.error = failure(cause, fallback); } finally { state.busy = false; render(); }
  }
  function prepare(): Promise<void> {
    if (!state.templateId || !data?.leads.some(lead => lead.id === state.leadId)) { render(); return Promise.resolve(); }
    return run(async () => { state.prepared = await prepareTemplate(base, token(), { id: crypto.randomUUID(), leadId: state.leadId, contactId: state.contactId, templateId: state.templateId }); }, "No se pudo preparar el mensaje. Podés reintentar.");
  }
  /** Checked right before the text leaves the panel: same chat, same person, then «WhatsApp abierto» in the CRM (once per draft). */
  async function open(): Promise<PreparedTemplate> {
    const prepared = state.prepared!;
    if (options.isCurrentChat && !options.isCurrentChat()) throw new Error(CHAT_CHANGED);
    if (!chatMatchesRecipient(options.phone || null, prepared.recipient)) throw new Error(WRONG_PHONE);
    if (!state.dispatched) { await dispatchTemplate(base, token(), { id: prepared.messageId, revision: prepared.revision }); state.dispatched = true; }
    return prepared;
  }
  /**
   * Text the script pasted earlier is replaced, and that earlier attempt is recorded as not sent so a later register does not complete it.
   * Any other text is the seller's: it is replaced only after they confirm it in the panel.
   */
  function paste(replace = false): Promise<void> {
    return run(async () => {
      state.confirmReplace = false;
      const read = () => { const editor = getWhatsAppComposer(); return { editor, text: editor ? editor.innerText || editor.textContent || "" : "" }; };
      const before = read(), composer = before.editor, typed = !!before.text.trim();
      const previous = lastPasted(match.accountId), ours = typed && !!previous && composerEquals(composer!, previous.body);
      if (typed && !ours && !replace) { state.confirmReplace = true; return; }
      const prepared = await open();
      if (typed && previous && previous.messageId !== prepared.messageId) { await closePasted(base, previous); rememberPasted(match.accountId, null); }
      // The seller may have switched chats or typed during the requests: never write into a composer that is not the one just checked.
      const after = read();
      if (options.isCurrentChat && !options.isCurrentChat()) throw new Error(CHAT_CHANGED);
      if (after.editor !== composer || after.text !== before.text) throw new Error("La caja de WhatsApp cambió mientras preparaba el mensaje. Tocá «Pegar en el chat» de nuevo.");
      if (composer && (!typed || clearComposer(composer)) && pasteIntoComposer(composer, prepared.body)) { rememberPasted(match.accountId, { messageId: prepared.messageId, body: prepared.body, at: Date.now() }); state.done = "pasted"; state.pasteFailed = false; }
      else { state.pasteFailed = true; throw new Error(PASTE_FAILED); }
    }, "No se pudo pegar. Podés reintentar.");
  }
  function copy(): Promise<void> { return run(async () => { const prepared = await open(); await navigator.clipboard.writeText(prepared.body); state.done = "copied"; }, "No se pudo copiar. Podés reintentar."); }
  function notSent(): Promise<void> { return run(async () => { await markTemplateNotSent(base, token(), state.prepared!.messageId); if (lastPasted(match.accountId)?.messageId === state.prepared!.messageId) rememberPasted(match.accountId, null); back(); }, "No se pudo registrar. Podés reintentar."); }

  render();
  void (async () => {
    try { data = await fetchTemplates(base, token(), match.accountId); choose(initialComposeChoice(data.leads)); }
    catch (cause) { state.error = failure(cause, "No se pudieron cargar los modelos. Volvé al negocio y probá de nuevo."); render(); }
  })();
}
