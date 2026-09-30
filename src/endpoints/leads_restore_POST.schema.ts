import { z } from "zod";
import superjson from "superjson";
export const schema=z.object({id:z.union([z.string(),z.number()])});
export type OutputType={ok:true};
export const postLeadRestore=async(body:z.infer<typeof schema>):Promise<OutputType>=>{
  const r=await fetch("/_api/leads_restore",{method:"POST",headers:{"Content-Type":"application/json"},body:superjson.stringify(schema.parse(body))});
  if(!r.ok){const e=superjson.parse<{error:string}>(await r.text());throw new Error(e.error)}
  return superjson.parse<OutputType>(await r.text());
};