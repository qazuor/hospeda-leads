import { z } from "zod";
import {apiJson} from "../helpers/apiClient";
import type { Selectable } from "kysely";
import type { Leads } from "../helpers/schema";

export const schema=z.object({
  q:z.string().optional(),
  page:z.coerce.number().int().min(1).default(1),
  pageSize:z.coerce.number().int().min(10).max(100).default(50),
});
export type OutputType={rows:Selectable<Leads>[];total:number;page:number;pageSize:number};
export const getTrashLeads=async(input:z.input<typeof schema>):Promise<OutputType>=>{
  const p=schema.parse(input);const qs=new URLSearchParams();
  Object.entries(p).forEach(([k,v])=>{if(v!==undefined&&v!=="")qs.set(k,String(v))});
  return apiJson<OutputType>("/_api/leads_trash?"+qs.toString());
};