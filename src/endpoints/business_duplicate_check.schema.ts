import {apiJson} from '../helpers/apiClient';
export type DuplicateCheckInput = {nombre?:string; ciudad?:string; telefono?:string; email?:string; whatsapp?:string};
/** Only what the warning needs: never contact data or the responsible's email. */
export type DuplicateCandidate = {id:string; nombre:string; ciudad:string|null; doNotContact:boolean; archived:boolean; deleted:false; status:string|null; responsibleName:string|null; reasons:string[]; canOpen:boolean};
export type OutputType = {candidates:DuplicateCandidate[]};
export const checkBusinessDuplicates = async (input:DuplicateCheckInput):Promise<OutputType>=>{
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries(input)) if (value?.trim()) params.set(key,value.trim());
  return apiJson<OutputType>(`/_api/business/duplicate-check?${params}`,{},{fallback:'No se pudo revisar si el negocio ya existe.'});
};
