import { z } from "zod";
import superjson from "superjson";
export const schema=z.object({
  leadId:z.union([z.string(),z.number()]),
  channel:z.enum(["whatsapp","email","phone","other"]),
  result:z.enum(["Sin respuesta","Respondió","Interesado","Recontactar","No interesado"]),
  nextAction:z.string().nullable().optional()
});
export type InputType=z.infer<typeof schema>;
export type OutputType={ok:true};
export const postLeadContact=async(body:InputType):Promise<OutputType>=>{
  const r=await fetch("/_api/lead_contact",{method:"POST",headers:{"Content-Type":"application/json"},body:superjson.stringify(schema.parse(body))});
  if(!r.ok){const e=superjson.parse<{error:string}>(await r.text());throw new Error(e.error)}
  return superjson.parse<OutputType>(await r.text());
};