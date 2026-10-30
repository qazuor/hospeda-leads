import type { HeldMaterial, MaterialChange, MaterialsResponse, PreparedTemplate, ScriptMaterial } from "./api";

/** Wait after the last keystroke before asking the CRM. */
export const MATERIAL_SEARCH_DEBOUNCE_MS = 300;

/** Failure copy of a material the CRM could not add to the draft (spec 98 §4.1). */
export const MATERIAL_ADD_FAILED = "No se pudo agregar el material. Podés reintentar.";
/** Failure copy of «Quitar» (owner, 29/10/2026). */
export const MATERIAL_REMOVE_FAILED = "No se pudo quitar el material. Podés reintentar.";
/** A material the seller chose in this view: it follows every new draft (D2). */
export type AddedMaterial = { id: string; title: string };

/** What the picker shows: the last answer of the CRM for `search`, or null materials before the first one. */
export type MaterialListing = { search: string; materials: ScriptMaterial[] | null; truncated: boolean; error: string };
export const emptyMaterialListing = (): MaterialListing => ({ search: "", materials: null, truncated: false, error: "" });

/**
 * «Agregar material» inside «Mandar un mensaje» (spec 89 §9): a search box and the active deliverable materials. The CRM searches (its list is
 * capped, so a local filter could hide materials): typing waits {@link MATERIAL_SEARCH_DEBOUNCE_MS}, shows «Buscando…» and repaints only the list,
 * so the box keeps the focus; a stale answer is ignored. Each answer goes to `onListing`, so a re-render of the panel shows it again without a
 * request. `refresh` asks the CRM right away (every opening: a business blocked earlier may be contactable now). A blocked business answers
 * with its reason instead of a list. Picking one hands it to `onAdd`; `added` are already in the text.
 * Spec 98: `doc` builds the nodes (Instagram's panel lives in its own document context) and `trusted` guards every listener that leads to a CRM
 * call (on Instagram, `event.isTrusted`, spec 97 §5.4.4; always true on WhatsApp). `heading` is «ELEGÍ EL MATERIAL» in «Enviar material».
 */
export function materialPicker(options: { listing: MaterialListing; refresh: boolean; busy: boolean; added: readonly string[]; search: (term: string) => Promise<MaterialsResponse>; onListing: (listing: MaterialListing) => void; onAdd: (material: ScriptMaterial) => void; onClose: () => void; doc?: Document; trusted?: (event: Event) => boolean; heading?: string; closeLabel?: string }): HTMLElement {
  const doc = options.doc ?? document, trusted = options.trusted ?? (() => true);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => { const node = doc.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
  const section = el("div", "section"), field = el("label", "field", "Buscar material"), input = el("input"), status = el("div"), list = el("div", "section");
  section.append(el("h3", undefined, options.heading ?? "AGREGAR MATERIAL"));
  input.type = "search"; input.value = options.listing.search; input.disabled = options.busy; input.placeholder = "Título o descripción";
  let listing = options.listing, sequence = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const paint = (loading: boolean) => {
    status.replaceChildren(...(listing.error ? [el("p", "note warn", listing.error)] : loading ? [el("p", "muted", listing.materials ? "Buscando…" : "Cargando material…")] : []));
    if (!listing.materials) { list.replaceChildren(); return; }
    list.replaceChildren(...(listing.materials.length ? listing.materials.map(material => {
      const row = el("div", "row"), content = el("span", "content"), added = options.added.includes(material.id), add = el("button", "btn small", added ? "Agregado" : "Agregar");
      content.append(el("strong", undefined, material.title), el("span", "muted", [material.formatLabel, ...material.categories].join(" · ")));
      add.type = "button"; add.disabled = options.busy || added; add.addEventListener("click", event => { if (trusted(event)) options.onAdd(material); });
      row.append(content, add); return row;
    }) : listing.error ? [] : [el("p", "muted", listing.search.trim() ? "No hay material con esa búsqueda." : "No hay material entregable. Lo carga un administrador en el CRM.")]));
    if (listing.truncated) list.append(el("p", "muted", "Hay más material del que se muestra: buscá por título."));
  };
  const load = async (term: string) => {
    const mine = ++sequence; listing = { ...listing, error: "" }; paint(true);
    let next: MaterialListing;
    try { const response = await options.search(term); next = { search: term, materials: response.blocked ? [] : response.materials, truncated: !response.blocked && !!response.truncated, error: response.blocked ?? "" }; }
    catch (cause) { next = { search: term, materials: listing.materials, truncated: listing.truncated, error: cause instanceof Error && cause.message ? cause.message : "No se pudo cargar el material. Probá de nuevo." }; }
    if (mine !== sequence) return;
    listing = next; options.onListing(next); paint(false);
  };
  input.addEventListener("input", event => { if (!trusted(event)) return; clearTimeout(timer); timer = setTimeout(() => void load(input.value), MATERIAL_SEARCH_DEBOUNCE_MS); });
  field.append(input); section.append(field, status, list);
  const close = el("button", "btn small", options.closeLabel ?? "Cerrar"); close.type = "button"; close.disabled = options.busy; close.addEventListener("click", event => { if (!trusted(event)) return; clearTimeout(timer); sequence++; options.onClose(); });
  section.append(close);
  if (options.refresh) void load(input.value); else paint(false);
  return section;
}

/** Materials chosen in the view that the current draft does not hold yet (a new draft after a template, person or scope change, D2). */
export function missingMaterials({ added, inDraft }: { added: readonly AddedMaterial[]; inDraft: readonly string[] }): AddedMaterial[] { return added.filter(item => !inDraft.includes(item.id)); }
/** The ids a freshly prepared draft already holds: a reused draft may carry links from before (spec 98 §5.3), so they are not added twice. */
export const materialsInDraft = (prepared: PreparedTemplate): string[] => (prepared.materials ?? []).map(item => item.materialId);
/** True for the CRM's revision conflict (HTTP 409): the draft changed elsewhere and the panel holds a stale revision. Duck-typed: only types come from ./api. */
const isRevisionConflict = (cause: unknown): boolean => typeof cause === "object" && cause !== null && (cause as { status?: unknown }).status === 409;
/**
 * Adds to the draft, one by one, every chosen material it does not hold yet (D2). Stops at the first refusal and returns the draft as far as it got
 * plus the error, so the view keeps the selection and offers «Reintentar» (no auto-retry). `add` is the CRM's `material_add` (it returns the new text).
 * On a revision conflict, `refresh` (the same prepare again, which reuses the draft with its fresh revision and materials) is called once and the
 * remaining materials are added to it; a second conflict is returned as an error.
 */
export async function addMissingMaterials({ prepared, added, inDraft, add, refresh }: { prepared: PreparedTemplate; added: readonly AddedMaterial[]; inDraft: readonly string[]; add: (payload: { messageId: string; revision: number; materialId: string }) => Promise<MaterialChange>; refresh?: () => Promise<PreparedTemplate> }): Promise<{ prepared: PreparedTemplate; inDraft: string[]; error: string }> {
  let draft = prepared, held = [...inDraft], refreshed = false;
  const failed = (cause: unknown) => ({ prepared: draft, inDraft: held, error: cause instanceof Error && cause.message ? cause.message : MATERIAL_ADD_FAILED });
  for (let pending = missingMaterials({ added, inDraft: held }); pending.length; pending = missingMaterials({ added, inDraft: held })) {
    const item = pending[0]!;
    try { const next = await add({ messageId: draft.messageId, revision: draft.revision, materialId: item.id }); draft = applyMaterialChange(draft, next); held.push(item.id); }
    catch (cause) {
      if (refreshed || !refresh || !isRevisionConflict(cause)) return failed(cause);
      refreshed = true;
      try { draft = await refresh(); held = materialsInDraft(draft); } catch (again) { return failed(again); }
    }
  }
  return { prepared: draft, inDraft: held, error: "" };
}
/** The draft after `material_add` / `material_remove`: new text and revision, and the CRM's list of held materials when it sends one. */
export const applyMaterialChange = (prepared: PreparedTemplate, change: MaterialChange): PreparedTemplate => ({ ...prepared, body: change.body, revision: change.revision, ...(change.materials ? { materials: change.materials } : {}) });
/**
 * «Quitar» (owner, 29/10/2026): removes one held material from the draft. On a revision conflict, `refresh` (the same prepare again) is called once and
 * the removal is retried on the fresh draft (done when the fresh draft no longer holds it). Any other refusal is returned as an error: the view keeps it
 * with «Reintentar». Never retried alone.
 */
export async function removeHeldMaterial({ prepared, materialId, remove, refresh }: { prepared: PreparedTemplate; materialId: string; remove: (payload: { messageId: string; revision: number; shareId: string }) => Promise<MaterialChange>; refresh?: () => Promise<PreparedTemplate> }): Promise<{ prepared: PreparedTemplate; error: string }> {
  let draft = prepared;
  for (let attempt = 0; attempt < 2; attempt++) {
    const shareId = (draft.materials ?? []).find(item => item.materialId === materialId)?.shareId;
    if (!shareId) return attempt ? { prepared: draft, error: "" } : { prepared: draft, error: MATERIAL_REMOVE_FAILED };
    try { return { prepared: applyMaterialChange(draft, await remove({ messageId: draft.messageId, revision: draft.revision, shareId })), error: "" }; }
    catch (cause) {
      const error = cause instanceof Error && cause.message ? cause.message : MATERIAL_REMOVE_FAILED;
      if (attempt || !refresh || !isRevisionConflict(cause)) return { prepared: draft, error };
      try { draft = await refresh(); } catch (again) { return { prepared: draft, error: again instanceof Error && again.message ? again.message : MATERIAL_REMOVE_FAILED }; }
    }
  }
  return { prepared: draft, error: MATERIAL_REMOVE_FAILED };
}
/**
 * The materials the draft holds, above the preview, each with «Quitar» (owner, 29/10/2026); the one whose removal failed shows «Reintentar».
 * Every click goes through `trusted` (Instagram: `event.isTrusted`).
 */
export function heldMaterialsList(options: { materials: readonly HeldMaterial[]; busy: boolean; failed: string | null; onRemove: (materialId: string) => void; doc?: Document; trusted?: (event: Event) => boolean }): HTMLElement {
  const doc = options.doc ?? document, trusted = options.trusted ?? (() => true);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => { const node = doc.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
  const section = el("div", "section held-materials"); section.append(el("h3", undefined, "MATERIAL EN EL MENSAJE"));
  for (const item of options.materials) {
    const row = el("div", "row"), remove = el("button", "btn small", options.failed === item.materialId ? "Reintentar" : "Quitar");
    remove.type = "button"; remove.disabled = options.busy || !item.shareId; remove.setAttribute("aria-label", `${options.failed === item.materialId ? "Reintentar quitar" : "Quitar"} ${item.title}`);
    remove.addEventListener("click", event => { if (!trusted(event)) return; options.onRemove(item.materialId); });
    row.append(el("span", "content", item.title), remove); section.append(row);
  }
  return section;
}

