/** Tabs of the business record, in display order. */
export const businessSections=['resumen','historial','tareas','comunicacion','gestiones','documentos'] as const;
export type BusinessSection=typeof businessSections[number];

/** Legacy `?section=` values kept alive for old links, toasts and search results. */
const legacySections:Readonly<Record<string,BusinessSection>>={'que-paso':'historial',history:'historial',work:'tareas',communication:'comunicacion',ficha:'gestiones',gestiones:'gestiones',opportunities:'gestiones',personas:'resumen',contacts:'resumen',datos:'resumen',documents:'documentos',summary:'resumen'};

/** Resolves a current or legacy business section; missing and unknown values open Resumen. */
export const businessSection=(value:string|null|undefined):BusinessSection=>{
 if(!value)return 'resumen';
 if((businessSections as readonly string[]).includes(value))return value as BusinessSection;
 return Object.hasOwn(legacySections,value)?legacySections[value]:'resumen';
};

/**
 * Spec 91 §13: the tab a business page opens on. `?tab=` is the canonical param; the legacy `?section=` (search results,
 * toasts, old links) is still read when there is no `tab`. Missing and unknown values open Resumen; a tab the user cannot see
 * (Tareas on a read-only business) falls back when rendering.
 */
export const initialBusinessSection=(params:URLSearchParams):BusinessSection=>businessSection(params.get('tab')??params.get('section'));

/**
 * Spec 91 §13: the query string after choosing `section`. Keeps every other param, writes `tab` (dropped for Resumen, the
 * default) and drops the legacy `section`, which `tab` supersedes.
 */
export function businessTabParams(params:URLSearchParams,section:BusinessSection):URLSearchParams{
 const next=new URLSearchParams(params);
 next.delete('section');
 if(section==='resumen')next.delete('tab');else next.set('tab',section);
 return next;
}
