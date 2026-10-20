import { z } from "zod";
import {apiJson} from "../helpers/apiClient";

export const schema=z.object({
  accountId:z.string().regex(/^[1-9]\d*$/).optional(),
  leadId:z.union([z.string(),z.number()]).optional(),
  q:z.string().optional(),action:z.string().optional(),actor:z.string().optional(),city:z.string().optional(),type:z.string().optional(),
  from:z.string().optional(),to:z.string().optional(),
  page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(10).max(100).default(50),
});
export type JournalItem={accountId?:string|null;accountName?:string|null;accountDeleted?:boolean;source?:string;id:string;leadId:string|null;leadName:string;leadCity:string|null;leadType:string|null;actorUserId:number|null;actorEmail:string|null;actorName:string;action:string;fieldName:string|null;oldValue:string|null;newValue:string|null;metadata:unknown;createdAt:Date|string};
export type OutputType={rows:JournalItem[];total:number;page:number;pageSize:number;filters:{accounts?:{id:string;name:string}[];actions:string[];actors:string[];cities:string[];types:string[];leads:{id:string;name:string}[]}};
export const getLeadJournal=async(input:z.input<typeof schema>):Promise<OutputType>=>{
  const p=schema.parse(input);const qs=new URLSearchParams();
  Object.entries(p).forEach(([k,v])=>{if(v!==undefined&&v!=="")qs.set(k,String(v))});
  return apiJson<OutputType>("/_api/lead_journal?"+qs.toString());
};