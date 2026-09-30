import { z } from "zod";
import superjson from "superjson";
export const schema=z.object({leadId:z.union([z.string(),z.number()]),note:z.string().trim().min(1)});
export type OutputType={id:string};
export const postLeadNote=async(input:z.infer<typeof schema>):Promise<OutputType>=>{
  const r=await fetch("/_api/lead_notes",{method:"POST",headers:{"Content-Type":"application/json"},body:superjson.stringify(schema.parse(input))});
  if(!r.ok){const e=superjson.parse<{error:string}>(await r.text());throw new Error(e.error)}
  return superjson.parse<OutputType>(await r.text());
};