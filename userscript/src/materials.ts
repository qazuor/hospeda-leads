import type { MaterialsResponse, ScriptMaterial } from "./api";

/** Wait after the last keystroke before asking the CRM. */
export const MATERIAL_SEARCH_DEBOUNCE_MS = 300;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }

/** What the picker shows: the last answer of the CRM for `search`, or null materials before the first one. */
export type MaterialListing = { search: string; materials: ScriptMaterial[] | null; truncated: boolean; error: string };
export const emptyMaterialListing = (): MaterialListing => ({ search: "", materials: null, truncated: false, error: "" });

/**
 * «Agregar material» inside «Mandar un mensaje» (spec 89 §9): a search box and the active deliverable materials. The CRM searches (its list is
 * capped, so a local filter could hide materials): typing waits {@link MATERIAL_SEARCH_DEBOUNCE_MS}, shows «Buscando…» and repaints only the list,
 * so the box keeps the focus; a stale answer is ignored. Each answer goes to `onListing`, so a re-render of the panel shows it again without a
 * request. `refresh` asks the CRM right away (every opening: a business blocked earlier may be contactable now). A blocked business answers
 * with its reason instead of a list. Picking one hands it to `onAdd`; `added` are already in the text.
 */
export function materialPicker(options: { listing: MaterialListing; refresh: boolean; busy: boolean; added: readonly string[]; search: (term: string) => Promise<MaterialsResponse>; onListing: (listing: MaterialListing) => void; onAdd: (material: ScriptMaterial) => void; onClose: () => void }): HTMLElement {
  const section = el("div", "section"), field = el("label", "field", "Buscar material"), input = el("input"), status = el("div"), list = el("div", "section");
  section.append(el("h3", undefined, "AGREGAR MATERIAL"));
  input.type = "search"; input.value = options.listing.search; input.disabled = options.busy; input.placeholder = "Título o descripción";
  let listing = options.listing, sequence = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const paint = (loading: boolean) => {
    status.replaceChildren(...(listing.error ? [el("p", "note warn", listing.error)] : loading ? [el("p", "muted", listing.materials ? "Buscando…" : "Cargando material…")] : []));
    if (!listing.materials) { list.replaceChildren(); return; }
    list.replaceChildren(...(listing.materials.length ? listing.materials.map(material => {
      const row = el("div", "row"), content = el("span", "content"), added = options.added.includes(material.id), add = el("button", "btn small", added ? "Agregado" : "Agregar");
      content.append(el("strong", undefined, material.title), el("span", "muted", [material.formatLabel, ...material.categories].join(" · ")));
      add.type = "button"; add.disabled = options.busy || added; add.addEventListener("click", () => options.onAdd(material));
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
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => void load(input.value), MATERIAL_SEARCH_DEBOUNCE_MS); });
  field.append(input); section.append(field, status, list);
  const close = el("button", "btn small", "Cerrar"); close.type = "button"; close.disabled = options.busy; close.addEventListener("click", () => { clearTimeout(timer); sequence++; options.onClose(); });
  section.append(close);
  if (options.refresh) void load(input.value); else paint(false);
  return section;
}
