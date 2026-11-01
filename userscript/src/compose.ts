import { ApiError, addMaterial, dispatchTemplate, removeMaterial, fetchMaterials, fetchTemplates, markTemplateNotSent, prepareTemplate, type Match, type PreparedTemplate, type ScriptMaterial, type ScriptPurpose, type TemplateLead, type TemplatesResponse, type WhatsappGeneral, type WhatsappPrepare } from "./api";
import { attachPlan, attachToChat, captureAttachContext, downloadMaterialFile, pasteTextAfterClosingPreview, validateAttachContext, type AttachContext } from "./attach";
import { MATERIAL_ADD_FAILED, MATERIAL_REMOVE_FAILED, addMissingMaterials, applyMaterialChange, emptyMaterialListing, heldMaterialsList, materialPicker, materialsInDraft, missingMaterials, removeHeldMaterial, type AddedMaterial, type MaterialListing } from "./materials";
import { chatMatchesRecipient, clearComposer, composerEquals, getWhatsAppComposer, pasteIntoComposer } from "./selectors";
import type { UiOptions } from "./ui";

const TOKEN_KEY = "hospeda-userscript-token";
export const NOT_SENT_BY_SCRIPT = "El mensaje no se envía solo: se pega en el chat para que lo revises y aprietes Enter.";
export const PASTE_FAILED = "No pude escribir en la caja de WhatsApp. Copialo y pegalo con Ctrl+V.";
const CHAT_CHANGED = "El chat cambió. Volvé al negocio y abrí los modelos desde este chat.";
const WRONG_PHONE = "El teléfono del chat no coincide con la persona elegida. No pegué el mensaje.";

type Choice = { leadId: string; templateId: string; contactId: string | null };
/** «Sin gestión» (spec 98 decision 4, as the Instagram panel): an empty `leadId` with the purpose of the contact. */
type Scope = Choice & { purpose: ScriptPurpose | null; otherPurpose: string };
type Done = "pasted" | "copied" | null;
/** `template` is «Mandar un mensaje»; `material` is «Enviar material» (spec 98 §4.1): the material first, a free draft, the model optional. */
export type ComposeMode = "template" | "material";
/**
 * Sales material of the panel (spec 89 §9): the list is loaded once per view. `added` are the materials the seller chose and follow every new
 * draft (D2); `inDraft` are the ones the current draft holds; `removeFailed` is the material whose «Quitar» failed (it shows «Reintentar»).
 */
type Materials = { picker: boolean; listing: MaterialListing; refreshMaterials: boolean; added: AddedMaterial[]; inDraft: string[]; removeFailed: string | null; chosen: boolean };
type State = Scope & Materials & { mode: ComposeMode; busy: boolean; prepared: PreparedTemplate | null; error: string; dispatched: boolean; done: Done; pasteFailed: boolean; confirmReplace: boolean; progress:number|null; cancelDownload:(()=>void)|null; attachmentReady:boolean; blockedPreview:boolean;downloadFailed:boolean };
const GENERAL = "";

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
/** «Sin gestión» with the CRM's default purpose, its recommended model and the default person (or the business phone). */
export function initialGeneralChoice(general: WhatsappGeneral): Scope {
  const purpose = general.purposes.find(p => p.value === general.defaultPurpose) ?? general.purposes[0];
  return { leadId: GENERAL, purpose: purpose?.value ?? null, otherPurpose: "", templateId: purpose?.templates.find(t => t.recommended)?.id ?? purpose?.templates[0]?.id ?? "", contactId: general.contacts.find(c => c.default)?.id ?? general.contacts[0]?.id ?? null };
}
/** The first open management, else «Sin gestión» (decision 4); nothing to choose when the CRM offers neither. */
export function initialScope(data: TemplatesResponse): Scope {
  if (!data.leads.length && data.general) return initialGeneralChoice(data.general);
  return { ...initialComposeChoice(data.leads), purpose: null, otherPurpose: "" };
}
/** A model with missing data, an empty text (a free draft without its material) or a blocked business never reaches the chat. */
export function canPasteTemplate(prepared: PreparedTemplate | null, blocked: string | null): boolean { return !!prepared && !blocked && !prepared.unresolved.length && !!prepared.body.trim(); }

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
 * The «Mandar un mensaje» view (spec 84) and, with `mode: "material"`, «Enviar material» (spec 98 §4.1). It prepares the draft through the CRM, and
 * pasting or copying marks it as «WhatsApp abierto». It never sends: no Enter, no click on WhatsApp's send button. The seller reviews the text
 * in the chat and sends it. Without open managements it offers «Sin gestión» with a purpose (spec 98 decision 4).
 */
export function openCompose(card: HTMLElement, options: UiOptions, match: Match, back: () => void, header: (title: string) => HTMLElement, mode: ComposeMode = "template"): void {
  const base = options.crmBase || "", state: State = { mode, leadId: "", templateId: "", contactId: null, purpose: null, otherPurpose: "", busy: false, prepared: null, error: "", dispatched: false, done: null, pasteFailed: false, confirmReplace: false, picker: mode === "material", listing: emptyMaterialListing(), refreshMaterials: mode === "material", added: [], inDraft: [], removeFailed: null, chosen: false,progress:null,cancelDownload:null,attachmentReady:false,blockedPreview:false,downloadFailed:false };
  let data: TemplatesResponse | null = null;
  const head = header, title = mode === "material" ? "Enviar material" : "Mandar un mensaje";
  const general = () => (state.leadId === GENERAL ? data?.general ?? null : null);
  /** The models of the chosen scope: the management's, or those of the purpose without one. */
  const scopeTemplates = () => state.leadId ? data?.leads.find(lead => lead.id === state.leadId)?.templates ?? [] : general()?.purposes.find(p => p.value === state.purpose)?.templates ?? [];

  function picker(heading: string, closeLabel: string, onClose: () => void): HTMLElement {
    const refresh = state.refreshMaterials && !state.busy; if (refresh) state.refreshMaterials = false;
    return materialPicker({ listing: state.listing, refresh, busy: state.busy, added: state.added.map(item => item.id), heading, closeLabel, search: term => fetchMaterials(base, token(), match.accountId, term), onListing: listing => { state.listing = listing; }, onAdd: material => void addToDraft(material), onClose });
  }
  function render(): void {
    card.parentElement?.querySelectorAll(".popover").forEach(pop => pop.remove()); // a re-render drops the hovered row without a mouseleave
    // The list scrolls inside the body; the notice and the buttons stay in the footer, always in view.
    const body = el("div", "body"), footer = el("div", "footer"); body.setAttribute("aria-busy", String(state.busy));
    if (state.done) {
      body.append(el("p", "muted", state.attachmentReady ? "Revisá la vista previa de WhatsApp y apretá Enviar. Si al final no lo mandás, avisalo acá." : state.done === "pasted" ? "Revisalo y apretá Enter para enviarlo. Si al final no lo mandás, avisalo acá." : "Pegalo en el chat con Ctrl+V, revisalo y envialo. Si al final no lo mandás, avisalo acá."));
      if (state.error) footer.append(el("p", "note warn", state.error));
      const grid = el("div", "actions grid");
      grid.append(button("Volver al negocio", "btn primary", back, state.busy), button("Cambiar de modelo", "btn", () => { state.done = null; render(); }, state.busy), button(state.busy ? "Registrando…" : "No lo voy a enviar", "btn", () => void notSent(), state.busy));
      footer.append(grid); card.replaceChildren(head(state.done === "pasted" ? "Listo, está en el chat" : "Texto copiado"), body, footer); return;
    }
    if (!data) { body.append(state.error ? el("p", "note warn", state.error) : el("p", "muted", "Cargando modelos…")); card.replaceChildren(head(title), body); return; }
    if (data.blocked) body.append(el("p", "note warn", data.blocked));
    const canAddMaterial = !state.dispatched && !data.blocked;
    // «Enviar material» starts with the picker until a material is chosen; then the normal view (scope, purpose, aclaración, model, error and retry).
    if (state.mode === "material" && !state.chosen && !state.busy) {
      if (canAddMaterial) body.append(picker("ELEGÍ EL MATERIAL", "Volver al negocio", back));
      footer.append(el("p", "note info", NOT_SENT_BY_SCRIPT)); if (state.error) footer.append(el("p", "note warn", state.error));
      if (!canAddMaterial) footer.append(button("Volver al negocio", "btn", back));
      card.replaceChildren(head(title), body, footer); return;
    }
    const scopes = [...data.leads.map(lead => ({ id: lead.id, label: `${lead.name} · ${lead.stage}` })), ...(data.general ? [{ id: GENERAL, label: "Sin gestión" }] : [])];
    if (scopes.length > 1) {
      const field = el("label", "field", "Gestión"), select = el("select"); select.disabled = state.busy;
      for (const scope of scopes) { const option = el("option", undefined, scope.label); option.value = scope.id; option.selected = scope.id === state.leadId; select.append(option); }
      select.addEventListener("change", () => { const next = data!.leads.find(lead => lead.id === select.value); const scope = next ? { ...initialComposeChoice([next]), purpose: null, otherPurpose: "" } : data!.general ? initialGeneralChoice(data!.general) : null; if (scope) choose(state.mode === "material" ? { ...scope, templateId: "" } : scope); });
      field.append(select); body.append(field);
    }
    const scopeGeneral = general();
    if (scopeGeneral) {
      const field = el("label", "field", "Propósito"), select = el("select"); select.disabled = state.busy;
      for (const purpose of scopeGeneral.purposes) { const option = el("option", undefined, purpose.label); option.value = purpose.value; option.selected = purpose.value === state.purpose; select.append(option); }
      select.addEventListener("change", () => { const purpose = scopeGeneral.purposes.find(p => p.value === select.value); if (purpose) choose({ ...state, purpose: purpose.value, otherPurpose: "", templateId: state.mode === "material" ? "" : purpose.templates.find(t => t.recommended)?.id ?? purpose.templates[0]?.id ?? "" }); });
      field.append(select); body.append(field);
      if (state.purpose === "other") {
        const other = el("label", "field", "Aclaración del propósito"), input = el("input"); input.value = state.otherPurpose; input.maxLength = 300; input.disabled = state.busy;
        input.addEventListener("change", () => choose({ ...state, otherPurpose: input.value }));
        other.append(input); body.append(other);
      }
    }
    const lead = data.leads.find(item => item.id === state.leadId), templates = scopeTemplates();
    if (lead || scopeGeneral) {
      if (state.mode === "material") {
        // Spec 98 §4.1: the model is optional above the preview and keeps the material (D2).
        const field = el("label", "field", "Mensaje modelo"), select = el("select"); select.disabled = state.busy;
        for (const item of [{ id: "", name: "Mensaje libre" }, ...templates]) { const option = el("option", undefined, item.name); option.value = item.id; option.selected = item.id === state.templateId; select.append(option); }
        select.addEventListener("change", () => choose({ ...state, templateId: select.value }));
        field.append(select); body.append(field);
      } else {
        const section = el("div", "section"); section.append(el("h3", undefined, "MODELOS PARA ESTA GESTIÓN"));
        if (!templates.length) section.append(el("p", "muted", "No hay modelos de WhatsApp compatibles con esta gestión."));
        for (const template of templates) {
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
      }
      const people = lead ? [{ id: "", name: "Teléfono del negocio" }, ...lead.contacts.map(contact => ({ id: contact.id, name: `${contact.name} · ${contact.phone}` }))] : [...(scopeGeneral!.businessPhone ? [{ id: "", name: "Teléfono del negocio" }] : []), ...scopeGeneral!.contacts.map(contact => ({ id: contact.id, name: `${contact.name} · ${contact.phone}` }))];
      const field = el("label", "field", "Persona"), select = el("select"); select.disabled = state.busy;
      for (const person of people) { const option = el("option", undefined, person.name); option.value = person.id; option.selected = (state.contactId || "") === person.id; select.append(option); }
      select.addEventListener("change", () => choose({ ...state, contactId: select.value || null }));
      field.append(select); body.append(field);
    }
    const missing = missingMaterials(state);
    if (state.prepared) {
      // Owner, 29/10/2026: every material of the draft above the preview, each with «Quitar».
      const held = state.prepared.materials ?? [];
      if (held.length) body.append(heldMaterialsList({ materials: held, busy: state.busy || state.dispatched, failed: state.removeFailed, onRemove: materialId => void removeFromDraft(materialId) }));
      const plan=attachPlan(held,state.prepared.body);
      const section = el("div", "section"); section.append(el("h3", undefined, "VISTA PREVIA"), el("span", "muted", `Para ${state.prepared.recipientName || "el negocio"} · ${state.prepared.recipient}`), previewText(state.prepared.body, state.prepared.unresolved));
      if(plan.notice)section.append(el("p","note info",plan.notice));
      if (state.prepared.unresolved.length) section.append(el("p", "note warn", `Falta ${state.prepared.unresolved.join(", ")}. Completalo en el CRM o elegí otra persona.`));
      for (const warning of state.prepared.materialWarnings ?? []) section.append(el("p", "note warn", warning));
      if (missing.length && !state.busy) {
        // Spec 98 §4.1: a material the CRM did not add keeps the selection; the seller retries or goes on without it. Never retried alone.
        section.append(el("p", "note warn", `Falta agregar: ${missing.map(item => item.title).join(", ")}.`));
        const row = el("div", "actions"); row.append(button("Reintentar", "btn small", () => void run(fillMaterials, MATERIAL_ADD_FAILED), state.busy), button("Seguir sin ese material", "btn small", () => { state.added = state.added.filter(item => !missing.includes(item)); state.error = ""; render(); }, state.busy)); section.append(row);
      }
      if (canAddMaterial && !state.picker) section.append(button(state.mode === "material" ? "Agregar otro material" : "Agregar material", "btn small", openMaterials, state.busy));
      body.append(section);
      if (canAddMaterial && state.picker) body.append(picker("AGREGAR MATERIAL", "Cerrar", () => { state.picker = false; render(); }));
    } else if (state.busy) body.append(el("p", "muted", "Preparando el mensaje…"));
    else if (state.mode === "material") {
      // Spec 98 §4.1: the chosen material stays selected while the draft is missing («Otro» without its aclaración, or a failed prepare).
      const section = el("div", "section"); if (state.added.length) section.append(el("p", "muted", `Material elegido: ${state.added.map(item => item.title).join(", ")}`));
      if (state.error && request()) section.append(button("Reintentar", "btn small", () => void prepare(), state.busy));
      body.append(section);
    }
    const activePlan=state.prepared?attachPlan(state.prepared.materials,state.prepared.body):{kind:"links" as const,notice:null};
    footer.append(el("p", "note info", activePlan.kind==="attach"?"El mensaje no se envía solo: el archivo y el texto quedan en la vista previa para que los revises y aprietes Enviar.":NOT_SENT_BY_SCRIPT));
    if(state.progress!==null)footer.append(el("p","muted",`Bajando el archivo… ${state.progress} %`));
    if(state.blockedPreview)footer.append(el("p","note warn",`La vista previa de WhatsApp quedó abierta sin el texto. Cerrala con la X (no la envíes) y tocá «Pegar solo el texto».`));
    if (state.error) footer.append(el("p", "note warn", state.error));
    const actions = el("div", "actions"), ready = canPasteTemplate(state.prepared, data.blocked) && !missing.length;
    if (state.confirmReplace) {
      footer.append(el("p", "note warn", "La caja de WhatsApp tiene un texto que no pegó el script. ¿Lo reemplazo por este mensaje?"));
      actions.append(button("Reemplazar", "btn primary", () => void paste(true), state.busy), button("Cancelar", "btn", () => { state.confirmReplace = false; render(); }, state.busy));
    } else if (state.pasteFailed) actions.append(button("Copiar texto", "btn primary", () => void copy(), state.busy), button("Reintentar", "btn", () => void paste(), state.busy));
    else if(state.blockedPreview)actions.append(button("Pegar solo el texto","btn primary",()=>void pasteTextAfterPreview(),state.busy),button("Copiar texto","btn",()=>void copy(),state.busy));
    else if(state.downloadFailed)actions.append(button("Reintentar","btn primary",()=>void paste(),state.busy),button("Pegar solo con el enlace","btn",()=>void paste(false,true),state.busy));
    else actions.append(button(state.busy ? "Adjuntando en WhatsApp…" : "Pegar en el chat", "btn primary", () => void paste(), state.busy || !ready), button("Copiar", "btn", () => void copy(), state.busy || !ready),...(state.cancelDownload?[button("Cancelar","btn",()=>state.cancelDownload?.(),false)]:[]));
    footer.append(actions); card.replaceChildren(head(title), body, footer);
  }

  /** A new model, person, purpose or management is a new draft: it has not been opened in WhatsApp yet. The chosen materials follow it (D2). */
  function choose(next: Scope): void { state.leadId = next.leadId; state.templateId = next.templateId; state.contactId = next.contactId; state.purpose = next.purpose; state.otherPurpose = next.otherPurpose; state.prepared = null; state.inDraft = []; state.removeFailed = null; state.dispatched = false; state.pasteFailed = false; state.confirmReplace = false; state.picker = false; void prepare(); }
  async function run(work: () => Promise<void>, fallback: string): Promise<void> {
    if (state.busy) return; state.busy = true; state.error = ""; render();
    try { await work(); } catch (cause) { state.error = cause instanceof Error&&cause.message==="Descarga cancelada."?"":failure(cause, fallback); } finally { state.busy = false; render(); }
  }
  /** The prepare request of the chosen scope, or null while it is incomplete (no scope, «Otro» without its aclaración, a person missing). */
  function request(): WhatsappPrepare | null {
    const templateId = state.templateId || null;
    if (state.leadId) return data?.leads.some(lead => lead.id === state.leadId) ? { id: crypto.randomUUID(), leadId: state.leadId, contactId: state.contactId, templateId } : null;
    const scope = data?.general; if (!scope || !state.purpose || (state.purpose === "other" && !state.otherPurpose.trim())) return null;
    if (state.contactId ? !scope.contacts.some(c => c.id === state.contactId) : !scope.businessPhone) return null;
    return { id: crypto.randomUUID(), accountId: match.accountId, leadId: null, contactId: state.contactId, templateId, purpose: state.purpose, otherPurpose: state.purpose === "other" ? state.otherPurpose.trim() : null };
  }
  /** Re-adds the chosen materials the new draft does not hold yet; a refusal stays on screen with «Reintentar» (no auto-retry). */
  async function fillMaterials(): Promise<void> {
    if (!state.prepared || state.dispatched) return;
    const result = await addMissingMaterials({ prepared: state.prepared, added: state.added, inDraft: state.inDraft, add: payload => addMaterial(base, token(), payload), refresh: refreshDraft });
    state.prepared = result.prepared; state.inDraft = result.inDraft; if (result.error) state.error = result.error;
  }
  /** The same prepare again: the CRM reuses the draft with its current revision and materials (a revision conflict, review item 6). */
  function refreshDraft(): Promise<PreparedTemplate> { const payload = request(); return payload ? prepareTemplate(base, token(), payload) : Promise.reject(new Error(MATERIAL_ADD_FAILED)); }
  /** «Quitar»: the CRM revokes the link and takes it out of the text; the material no longer follows new drafts and can be picked again. */
  function removeFromDraft(materialId: string): Promise<void> {
    return run(async () => {
      if (!state.prepared || state.dispatched) return;
      const result = await removeHeldMaterial({ prepared: state.prepared, materialId, remove: payload => removeMaterial(base, token(), payload), refresh: refreshDraft });
      state.prepared = result.prepared; state.inDraft = materialsInDraft(result.prepared);
      if (result.error) { state.removeFailed = materialId; state.error = result.error; return; }
      state.removeFailed = null; state.added = state.added.filter(item => item.id !== materialId);
    }, MATERIAL_REMOVE_FAILED);
  }
  function prepare(): Promise<void> {
    const payload = request();
    // «Mandar un mensaje» needs a model; «Enviar material» needs a material chosen once (the model is optional; «Quitar» may leave none).
    if (!payload || (state.mode === "template" ? !state.templateId : !state.chosen)) { render(); return Promise.resolve(); }
    return run(async () => { const prepared = await prepareTemplate(base, token(), payload); state.prepared = prepared; state.inDraft = materialsInDraft(prepared); await fillMaterials(); }, "No se pudo preparar el mensaje. Podés reintentar.");
  }
  /** Opens «Agregar material». Every opening asks the CRM again (with the last search): nothing from a blocked business is kept. */
  function openMaterials(): void { state.picker = true; state.refreshMaterials = true; render(); }
  /**
   * The CRM creates a link of this draft and returns the new text: the preview and «Pegar en el chat» use it. Never after the draft was opened.
   * In «Enviar material» the first material prepares the free draft first.
   */
  function addToDraft(material: ScriptMaterial): Promise<void> {
    if (!state.prepared) { if (state.mode !== "material" || state.added.some(item => item.id === material.id)) return Promise.resolve(); state.added = [...state.added, { id: material.id, title: material.title }]; state.chosen = true; state.picker = false; return prepare(); }
    return run(async () => {
      const prepared = state.prepared!; if (state.dispatched) return;
      const next = await addMaterial(base, token(), { messageId: prepared.messageId, revision: prepared.revision, materialId: material.id });
      state.prepared = applyMaterialChange(prepared, next); state.added = [...state.added, { id: material.id, title: material.title }]; state.inDraft = [...state.inDraft, material.id]; state.picker = false;
    }, MATERIAL_ADD_FAILED);
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
  function paste(replace = false,forceLinks=false): Promise<void> {
    let file:File|null=null;
    return run(async () => {
      state.confirmReplace = false;
      const read = () => { const editor = getWhatsAppComposer(); return { editor, text: editor ? editor.innerText || editor.textContent || "" : "" }; };
      const before = read(), composer = before.editor, typed = !!before.text.trim();
      const previous = lastPasted(match.accountId), ours = typed && !!previous && composerEquals(composer!, previous.body);
      if (typed && !ours && !replace) { state.confirmReplace = true; return; }
      const plan=forceLinks?{kind:"links" as const,notice:null}:attachPlan(state.prepared?.materials,state.prepared?.body||"");let snapshot:AttachContext|null=null;
      if(plan.kind==="attach"){
        snapshot=captureAttachContext(state.prepared!.recipient,document,()=>!options.isCurrentChat||options.isCurrentChat());if(!snapshot)throw new Error(CHAT_CHANGED);
        const meta=plan.material.attach!;if(!plan.material.shareId||!meta.fileName||!meta.mimeType||meta.byteSize===null)throw new Error("No pude bajar el archivo.");
        const download=downloadMaterialFile(base,token(),state.prepared!.messageId,plan.material.shareId,{fileName:meta.fileName,mimeType:meta.mimeType,byteSize:meta.byteSize},(loaded,total)=>{state.progress=Math.min(99,Math.floor(loaded/Math.max(1,total)*100));render();});state.cancelDownload=download.abort;state.downloadFailed=false;render();
        try{file=(await download.promise).file;if(!validateAttachContext(snapshot))throw new Error("El chat, el destinatario o el texto cambiaron mientras bajaba el archivo. No pegué nada; volvé a intentarlo.");}catch(error){const cancelled=error instanceof Error&&error.message==="Descarga cancelada.";state.downloadFailed=!cancelled&&!(error instanceof Error&&error.message.startsWith("El chat, el destinatario"));if(cancelled)state.error="";throw error;}finally{state.cancelDownload=null;state.progress=null;render();}
      }
      const prepared = await open();
      if (typed && previous && previous.messageId !== prepared.messageId) { await closePasted(base, previous); rememberPasted(match.accountId, null); }
      // The seller may have switched chats or typed during the requests: never write into a composer that is not the one just checked.
      const after = read();
      if (options.isCurrentChat && !options.isCurrentChat()) throw new Error(CHAT_CHANGED);
      if(file&&(!snapshot||!validateAttachContext(snapshot)))throw new Error("El chat, el destinatario o el texto cambiaron. No pegué nada; volvé a intentarlo.");
      if (after.editor !== composer || after.text !== before.text) throw new Error("La caja de WhatsApp cambió mientras preparaba el mensaje. Tocá «Pegar en el chat» de nuevo.");
      if(file){const result=await attachToChat(file,prepared.body);file=null;if(result.state==="C"){state.blockedPreview=true;state.error="";return;}if(result.state==="error"){state.error=result.message;state.downloadFailed=true;return;}if(result.state==="B"){state.error="No pude adjuntar el archivo en WhatsApp: pegué el texto con el enlace.";state.downloadFailed=false;}else state.attachmentReady=true;rememberPasted(match.accountId,{messageId:prepared.messageId,body:prepared.body,at:Date.now()});state.done="pasted";state.pasteFailed=false;}
      else if (composer && (!typed || clearComposer(composer)) && pasteIntoComposer(composer, prepared.body)) { rememberPasted(match.accountId, { messageId: prepared.messageId, body: prepared.body, at: Date.now() }); state.done = "pasted"; state.pasteFailed = false; }
      else { state.pasteFailed = true; throw new Error(PASTE_FAILED); }
    }, "No se pudo pegar. Podés reintentar.").finally(()=>{file=null;});
  }
  function pasteTextAfterPreview():Promise<void>{return run(async()=>{if(!await pasteTextAfterClosingPreview(state.prepared!.body))throw new Error("Cerrá la vista previa con la X (no la envíes) y probá de nuevo.");state.blockedPreview=false;state.done="pasted";state.attachmentReady=false;},PASTE_FAILED);}
  function copy(): Promise<void> { return run(async () => { const prepared = await open(); await navigator.clipboard.writeText(prepared.body); state.done = "copied"; }, "No se pudo copiar. Podés reintentar."); }
  function notSent(): Promise<void> { return run(async () => { await markTemplateNotSent(base, token(), state.prepared!.messageId); if (lastPasted(match.accountId)?.messageId === state.prepared!.messageId) rememberPasted(match.accountId, null); back(); }, "No se pudo registrar. Podés reintentar."); }

  render();
  void (async () => {
    try { data = await fetchTemplates(base, token(), match.accountId); const first = initialScope(data); choose(state.mode === "material" ? { ...first, templateId: "" } : first); }
    catch (cause) { state.error = failure(cause, "No se pudieron cargar los modelos. Volvé al negocio y probá de nuevo."); render(); }
  })();
}
