import {strictComparisonName} from "./dataNormalization";

/** Fixed badge colour per vertical (rubro). Known catalog values are mapped explicitly; unknown ones get a stable hash-based pick. */
export type VerticalTone=readonly [hue:number,saturation:number];

// Folds case and accents but keeps ñ distinct from n (AGENTS.md).
export const verticalKey=strictComparisonName;

const alojamiento:VerticalTone=[205,70],gastronomia:VerticalTone=[24,80],experiencia:VerticalTone=[145,55],rural:VerticalTone=[85,50],partner:VerticalTone=[270,55],proveedor:VerticalTone=[175,60],editor:VerticalTone=[330,55];

/** Catalog values (singular and plural spellings used by the message-model catalog) keyed by normalized name. */
export const knownVerticalTones=new Map<string,VerticalTone>([
  ["alojamiento",alojamiento],["alojamientos",alojamiento],
  ["gastronomia",gastronomia],
  ["experiencia",experiencia],["experiencias",experiencia],["actividades",experiencia],["actividad",experiencia],
  ["turismo rural",rural],
  ["partner",partner],["partners",partner],
  ["proveedor de servicios",proveedor],["proveedores de servicios",proveedor],
  ["editor",editor],["editores",editor],
]);

/** Reserve hues for new rubros: at least 25 degrees from every known rubro hue and outside the danger red range (345-15); they still sit near some status tints (amber, green, blue), which is accepted since only 4 slots fit. */
export const fallbackHues=[55,115,240,300] as const;

/** FNV-1a 32-bit hash: stable across sessions and machines. */
const hash=(text:string)=>{let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h;};

/** Tone of a vertical: explicit for known values, deterministic pick from a small reserve palette for new ones. */
export const verticalTone=(value:string):VerticalTone=>{
  const key=verticalKey(value);
  return knownVerticalTones.get(key)??[fallbackHues[hash(key)%fallbackHues.length],55];
};
