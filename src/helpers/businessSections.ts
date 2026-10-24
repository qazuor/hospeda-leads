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
