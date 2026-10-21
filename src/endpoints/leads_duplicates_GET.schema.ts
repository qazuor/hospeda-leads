import {apiJson} from "../helpers/apiClient";
export type DuplicateGroup = {
  reason: string;
  key: string;
  leads: {accountId:string;id:string; nombre:string; ciudad:string|null; telefono:string|null; email:string|null}[];
};
export type OutputType = { groups: DuplicateGroup[] };
export const getLeadDuplicates = async ():Promise<OutputType>=>{
  return apiJson<OutputType>("/_api/leads_duplicates");
};