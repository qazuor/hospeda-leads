import { z } from "zod";
import superjson from "superjson";

export const schema=z.object({
  entity:z.enum(["opportunity","business"]).default("opportunity"),ids:z.array(z.union([z.string(),z.number()])).min(1).max(500),
  changes:z.object({
    estado:z.string().nullable().optional(),
    prioridad:z.enum(["alta","media","baja"]).nullable().optional(),
    assignedUserEmail:z.string().nullable().optional(),
    fechaProximaAccion:z.string().nullable().optional(),
    tipo:z.string().nullable().optional(),
    subtipo:z.string().nullable().optional(),
    commercialProfile:z.enum(["Independiente","Consolidado","Referente"]).nullable().optional(),
    ciudad:z.string().nullable().optional()
  }).refine(value=>Object.keys(value).length>0,"Elegí al menos un cambio")
});
export type InputType=z.input<typeof schema>;
export type OutputType={ok:true;updated:number};
export const postLeadsBulk=async(body:InputType):Promise<OutputType>=>{
  const r=await fetch("/_api/leads_bulk",{method:"POST",headers:{"Content-Type":"application/json"},body:superjson.stringify(schema.parse(body))});
  if(!r.ok){const e=superjson.parse<{error:string}>(await r.text());throw new Error(e.error)}
  return superjson.parse<OutputType>(await r.text());
};