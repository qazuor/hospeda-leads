import {normalizeSearchText} from './searchText';

/**
 * Comparison form of a city name (spec 104 §3.12): accents and case ignored, ñ kept distinct from n, inner spaces collapsed.
 * Uses `normalizeSearchText`, never `comparisonName` (that one turns ñ into n).
 */
export function cityKey(name:string):string{return normalizeSearchText(name).replace(/\s+/gu,' ');}

/**
 * The catalog row for a typed name, or null (only an exact normalized match, never a similar one). With duplicates already stored
 * («San Jose» and «San José»), an active row wins over an inactive one and, within the same state, the exact spelling wins.
 */
export function findCityRow<T extends {name:string;active?:boolean}>({name,rows}:{name:string;rows:readonly T[]}):T|null{
 const typed=name.trim(),key=cityKey(typed);
 if(!key)return null;
 const rank=(row:T)=>(row.active===false?2:0)+(row.name.trim()===typed?0:1);
 return rows.filter(row=>cityKey(row.name)===key).sort((a,b)=>rank(a)-rank(b))[0]??null;
}

/** The catalog city for a typed name: the exact spelling when it is in the catalog, otherwise the one equal by `cityKey`, or null. */
export function matchCatalogCity({name,cities}:{name:string;cities:readonly string[]}):string|null{
 return findCityRow({name,rows:cities.map(city=>({name:city}))})?.name??null;
}

/** Catalog cities that contain the typed text, compared like `cityKey`, in catalog order. */
export function filterCityOptions({search,cities}:{search:string;cities:readonly string[]}):string[]{
 const key=cityKey(search);
 return key?cities.filter(city=>cityKey(city).includes(key)):[...cities];
}

/** What the seller reads after a typed city was saved as the catalog spelling. */
export const catalogCityNotice=(city:string)=>`Se guardó como «${city}», la ciudad de la lista.`;

/** City to save: the catalog spelling when the typed name matches one only by accents, case or spaces; otherwise what was typed (trimmed, or null). */
export function cityToSave({name,cities}:{name:string;cities:readonly string[]}):{city:string|null;adjusted:boolean}{
 const typed=name.trim(),catalog=matchCatalogCity({name:typed,cities});
 return catalog&&catalog!==typed?{city:catalog,adjusted:true}:{city:typed||null,adjusted:false};
}
