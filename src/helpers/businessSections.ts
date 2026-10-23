/** Tabs of the business record, in display order (UX plan U-20). */
export const businessSections=['historial','tareas','comunicacion','ficha'] as const;
export type BusinessSection=typeof businessSections[number];

/** Legacy `?section=` values kept alive for old links, toasts and search results. */
const legacySections:Readonly<Record<string,BusinessSection>>={'que-paso':'historial',history:'historial',work:'tareas',communication:'comunicacion',gestiones:'ficha',opportunities:'ficha',personas:'ficha',contacts:'ficha',datos:'ficha',documents:'ficha',summary:'ficha'};

/**
 * Resolves a `?section=` value (current or legacy) to a business record tab.
 * Missing or unknown values open "Historial", the record's default tab.
 * @example businessSection('contacts') // 'ficha'
 */
export const businessSection=(value:string|null|undefined):BusinessSection=>{
 if(!value)return 'historial';
 if((businessSections as readonly string[]).includes(value))return value as BusinessSection;
 return Object.hasOwn(legacySections,value)?legacySections[value]:'historial';
};
