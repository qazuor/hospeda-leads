import { z } from "zod";
import superjson from "superjson";
import type { Selectable } from "kysely";
import type { Leads } from "../helpers/schema";
const listSchema=z.preprocess(value=>{
  if(value===undefined||value===null||value==="")return [];
  if(Array.isArray(value))return value;
  if(typeof value==="string"){
    try{
      const parsed=JSON.parse(value);
      if(Array.isArray(parsed))return parsed;
    }catch{}
    return value.split(",").map(x=>x.trim()).filter(Boolean);
  }
  return [];
},z.array(z.string()).max(100)).default([]);
const jsonArraySchema=<T extends z.ZodTypeAny>(item:T)=>z.preprocess(value=>{
  if(value===undefined||value===null||value==="")return [];
  if(Array.isArray(value))return value;
  if(typeof value==="string"){
    try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[]}
    catch{return []}
  }
  return [];
},z.array(item).max(100)).default([]);
const textField=z.enum([
  "nombre","contactName","email","telefono","sitioWeb","urlGmap","perfilInstagram","perfilFacebook",
  "perfilAirbnb","perfilBooking","perfilTurismoEntreRios","resultadoUltimoContacto","fuenteReferencia","archivoAdjunto"
]);
const textMode=z.enum(["contains","not_contains","equals","not_equals","empty","not_empty"]);
const dateField=z.enum(["fechaCreacion","fechaUltimoContacto","fechaProximaAccion","createdAt","updatedAt"]);
export const advancedFilterField=z.enum([
  "id","nombre","contactName","assignedUserEmail","tipo","subtipo","commercialProfile","ciudad","estado",
  "suscripcion","email","telefono","sitioWeb","urlGmap","perfilInstagram","perfilFacebook","perfilAirbnb",
  "perfilBooking","perfilTurismoEntreRios","origen","quienCargo","asignadoA","fechaCreacion",
  "fechaUltimoContacto","medioContactoPreferido","resultadoUltimoContacto","prioridad","fechaProximaAccion",
  "fuenteReferencia","clientePotencialRecurrente","archivoAdjunto","creadoPor","createdAt","updatedAt","notes","deletedAt"
]);
export const advancedFilterOperator=z.enum([
  "eq","neq","contains","not_contains","empty","not_empty",
  "gte","lte","between","before","after","on","is_true","is_false"
]);
export const advancedFilterRule=z.object({
  field:advancedFilterField,
  operator:advancedFilterOperator,
  value:z.string().optional(),
  value2:z.string().optional()
}).refine(rule=>rule.field!=="deletedAt"||["is_true","is_false"].includes(rule.operator),{message:"El filtro de eliminados requiere sí o no"});
export const advancedFilterGroup=z.object({
  rules:z.array(advancedFilterRule).min(1).max(20)
});
export type AdvancedFilterRule=z.infer<typeof advancedFilterRule>;
export type AdvancedFilterGroup=z.infer<typeof advancedFilterGroup>;
export const schema=z.object({
  contactPresence:z.enum(["contacted","noContact"]).optional(),view:z.enum(["table","board"]).default("table"),classification:z.enum(["open","won","lost"]).optional(),commercialStatus:z.enum(["prospect","client"]).optional(),entity:z.enum(["opportunity","business"]).default("opportunity"),
  q:z.string().optional(),ciudad:z.string().optional(),estado:z.string().optional(),tipo:z.string().optional(),subtipo:z.string().optional(),commercialProfile:z.string().optional(),prioridad:z.string().optional(),asignado:z.string().optional(),assignedUser:z.string().optional(),
  ciudades:listSchema,excludeCiudades:listSchema,
  estados:listSchema,excludeEstados:listSchema,
  tipos:listSchema,excludeTipos:listSchema,
  subtipos:listSchema,excludeSubtipos:listSchema,
  commercialProfiles:listSchema,excludeCommercialProfiles:listSchema,
  prioridades:listSchema,excludePrioridades:listSchema,
  asignados:listSchema,excludeAsignados:listSchema,
  assignedUsers:listSchema,excludeAssignedUsers:listSchema,
  suscripciones:listSchema,excludeSuscripciones:listSchema,
  origenes:listSchema,excludeOrigenes:listSchema,
  quienesCargaron:listSchema,excludeQuienesCargaron:listSchema,
  mediosContacto:listSchema,excludeMediosContacto:listSchema,
  creadosPor:listSchema,excludeCreadosPor:listSchema,
  textFilters:jsonArraySchema(z.object({field:textField,mode:textMode,value:z.string().optional()})),
  dateFilters:jsonArraySchema(z.object({
    field:dateField,
    from:z.string().optional(),
    to:z.string().optional(),
    presence:z.enum(["all","with","without"]).default("all")
  })),
  idExact:z.string().optional(),idMin:z.string().optional(),idMax:z.string().optional(),
  recurrent:z.enum(["true","false"]).optional(),
  notesMode:textMode.optional(),notesText:z.string().optional(),
  filterGroups:jsonArraySchema(advancedFilterGroup),
  inactiveDays:z.coerce.number().int().min(1).max(365).optional(),
  nextAction:z.enum(["with","without","overdue"]).optional(),
  sortBy:z.enum([
    "id","nombre","contactName","tipo","subtipo","commercialProfile","ciudad","estado","suscripcion","email","telefono","assignedUserEmail",
    "sitioWeb","urlGmap","perfilInstagram","perfilFacebook","perfilAirbnb","perfilBooking",
    "perfilTurismoEntreRios","origen","quienCargo","asignadoA","fechaCreacion","fechaUltimoContacto",
    "medioContactoPreferido","resultadoUltimoContacto","prioridad","fechaProximaAccion",
    "fuenteReferencia","clientePotencialRecurrente","archivoAdjunto","creadoPor","createdAt","updatedAt"
  ]).optional(),
  sortDir:z.enum(["asc","desc"]).optional(),
  page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(10).max(100).default(50)
});
export type BusinessTableMetadata={opportunityId?:string|null;opportunityCount?:number;contactCount?:number;commercialStatus?:"prospect"|"client";opportunityValues?:Record<string,string[]>};
export type OutputType={rows:(Selectable<Leads>&BusinessTableMetadata)[];total:number;page:number;pageSize:number;filters:{
  ciudades:string[];estados:string[];tipos:string[];asignados:string[];
  suscripciones:string[];origenes:string[];quienesCargaron:string[];mediosContacto:string[];creadosPor:string[];
}};
export const getLeads = async (input:z.input<typeof schema>): Promise<OutputType> => {
  const p=schema.parse(input); const qs=new URLSearchParams();
  Object.entries(p).forEach(([k,v])=>{
    if(Array.isArray(v)){if(v.length)qs.set(k,JSON.stringify(v));return}
    if(v!==undefined&&v!=="")qs.set(k,String(v));
  });
  const result = await fetch("/_api/leads?"+qs.toString());
  if (!result.ok) {
    const error = superjson.parse<{ error: string }>(await result.text());
    throw new Error(error.error);
  }
  return superjson.parse<OutputType>(await result.text());
};