/** Fixed badge colour per vertical (rubro). Known catalog values are mapped explicitly; unknown ones get a stable hash-based pick. */
export type VerticalTone=readonly [hue:number,saturation:number];

const normalize=(value:string)=>value.trim().normalize("NFD").replace(/\p{M}/gu,"").toLocaleLowerCase("es-AR").replace(/\s+/g," ");

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

const fallbackHues=[0,45,110,195,235,300] as const;

/** FNV-1a 32-bit hash: stable across sessions and machines. */
const hash=(text:string)=>{let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h;};

/** Tone of a vertical: explicit for known values, deterministic pick from a small reserve palette for new ones. */
export const verticalTone=(value:string):VerticalTone=>{
  const key=normalize(value);
  return knownVerticalTones.get(key)??[fallbackHues[hash(key)%fallbackHues.length],55];
};
