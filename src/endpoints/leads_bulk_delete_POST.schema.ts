import { z } from "zod";
import superjson from "superjson";
export const schema=z.object({entity:z.enum(["opportunity","business"]).default("opportunity"),ids:z.array(z.union([z.string(),z.number()])).min(1).max(500)});
export type InputType=z.input<typeof schema>;
export type OutputType={ok:true;deleted:number};
export const postLeadsBulkDelete=async(body:InputType):Promise<OutputType>=>{
  const r=await fetch("/_api/leads_bulk_delete",{method:"POST",headers:{"Content-Type":"application/json"},body:superjson.stringify(schema.parse(body))});
  if(!r.ok){const e=superjson.parse<{error:string}>(await r.text());throw new Error(e.error)}
  return superjson.parse<OutputType>(await r.text());
};