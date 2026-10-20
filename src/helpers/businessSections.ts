/** Tabs of the business record, in display order (UX plan U-20). */
export const businessSections=['que-paso','gestiones','personas','datos'] as const;
export type BusinessSection=typeof businessSections[number];

/** Legacy `?section=` values kept alive for old links, toasts and search results. */
const legacySections:Readonly<Record<string,BusinessSection>>={history:'que-paso',work:'que-paso',opportunities:'gestiones',contacts:'personas',documents:'datos',communication:'que-paso',summary:'datos'};

/**
 * Resolves a `?section=` value (current or legacy) to a business record tab.
 * Missing or unknown values open "Gestiones", the record's default tab.
 * @example businessSection('contacts') // 'personas'
 */
export const businessSection=(value:string|null|undefined):BusinessSection=>{
 if(!value)return 'gestiones';
 if((businessSections as readonly string[]).includes(value))return value as BusinessSection;
 return Object.hasOwn(legacySections,value)?legacySections[value]:'gestiones';
};
