import superjson from "superjson";
export type DuplicateGroup = {
  reason: string;
  key: string;
  leads: {id:string; nombre:string; ciudad:string|null; telefono:string|null; email:string|null}[];
};
export type OutputType = { groups: DuplicateGroup[] };
export const getLeadDuplicates = async ():Promise<OutputType>=>{
  const r=await fetch("/_api/leads_duplicates");
  if(!r.ok){const e=superjson.parse<{error:string}>(await r.text());throw new Error(e.error)}
  return superjson.parse<OutputType>(await r.text());
};