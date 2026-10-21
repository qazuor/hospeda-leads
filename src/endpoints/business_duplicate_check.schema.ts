import {apiJson} from '../helpers/apiClient';
/** Shared with the server (409) and the creation dialog (owner decisions 1C and 13). */
export const DNC_DUPLICATE_MESSAGE='Ese negocio pidió no ser contactado. Consultá con un administrador.';
/** `personPhone` is the phone of the person being added; it is compared with the businesses' phones. */
export type DuplicateCheckInput = {nombre?:string; ciudad?:string; telefono?:string; email?:string; whatsapp?:string; personPhone?:string};
/** Only what the warning needs: never contact data or the responsible's email. `status` and `responsibleName` are omitted when the caller cannot open the business. `blocking`: saving would be rejected (No contactar with same name and city or an exactly shared business phone). A person's phone never blocks (decision 13B). */
export type DuplicateCandidate = {id:string; nombre:string; ciudad:string|null; doNotContact:boolean; archived:boolean; deleted:false; status?:string|null; responsibleName?:string|null; reasons:string[]; canOpen:boolean; blocking:boolean};
export type OutputType = {candidates:DuplicateCandidate[]};
export const checkBusinessDuplicates = async (input:DuplicateCheckInput,init:RequestInit={}):Promise<OutputType>=>{
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries(input)) if (value?.trim()) params.set(key,value.trim());
  return apiJson<OutputType>(`/_api/business/duplicate-check?${params}`,init,{fallback:'No se pudo revisar si el negocio ya existe.'});
};
