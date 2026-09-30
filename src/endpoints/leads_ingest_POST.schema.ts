import { z } from "zod";
import superjson from "superjson";

const lead=z.object({
  nombre:z.string().trim().min(1),
  contactName:z.string().nullable().optional(),
  tipo:z.string().nullable().optional(),
  subtipo:z.string().nullable().optional(),
  commercialProfile:z.enum(["Independiente","Consolidado","Referente"]).nullable().optional(),
  ciudad:z.string().nullable().optional(),
  estado:z.string().nullable().optional(),
  suscripcion:z.string().nullable().optional(),
  email:z.string().nullable().optional(),
  telefono:z.string().nullable().optional(),
  sitioWeb:z.string().nullable().optional(),
  urlGmap:z.string().nullable().optional(),
  perfilInstagram:z.string().nullable().optional(),
  perfilFacebook:z.string().nullable().optional(),
  perfilAirbnb:z.string().nullable().optional(),
  perfilBooking:z.string().nullable().optional(),
  perfilTurismoEntreRios:z.string().nullable().optional(),
  origen:z.string().nullable().optional(),
  asignadoA:z.string().nullable().optional(),
  assignedUserEmail:z.string().nullable().optional(),
  fuenteReferencia:z.string().nullable().optional(),
  prioridad:z.enum(["alta","media","baja"]).nullable().optional(),
  notas:z.array(z.string().trim().min(1)).optional()
});
export const schema=z.object({leads:z.array(lead).min(1).max(250),force:z.boolean().optional()});
export type InputType=z.infer<typeof schema>;
export type OutputType={created:number;skipped:number;createdIds:string[];duplicates:{nombre:string;matches:string[]}[]};
export const postLeadsIngest=async(body:InputType):Promise<OutputType>=>{
  throw new Error("This endpoint requires a server-side Bearer token and is intended for trusted ingestion clients.");
};