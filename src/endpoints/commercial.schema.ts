import { z } from "zod";
import superjson from "superjson";
import type { Selectable } from "kysely";
import type { CrmAccounts, CrmContacts, CrmCommercialJournal, Leads, LeadJournal } from "../helpers/schema";

const id=z.string().regex(/^[1-9]\d*$/);
const optionalText=z.string().trim().max(2000).nullable().optional();
const storedEmail=z.string().trim().max(320).nullable().optional();
const email=z.union([z.string().trim().email().max(320),z.literal("")]).nullable().optional();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,"Fecha inválida").nullable().optional();
export const commercialQuery=z.object({
  accountId:id.optional(),leadId:id.optional(),q:z.string().max(200).optional(),
  status:z.enum(["prospect","client"]).optional(),archived:z.preprocess(v=>v===true||v==="true",z.boolean()).default(false),page:z.coerce.number().int().min(1).default(1)
});
export const commercialMutation=z.discriminatedUnion("action",[
  z.object({action:z.literal("account_save"),id:id.optional(),nombre:z.string().trim().min(1).max(300),tipo:optionalText,subtipo:optionalText,provincia:optionalText,direccion:optionalText,whatsapp:optionalText,businessNotes:z.string().max(10000).nullable().optional(),discoverySource:optionalText,verificationUrls:z.string().max(10000).nullable().optional(),verifiedOn:date,ciudad:optionalText,telefono:optionalText,email:storedEmail,sitioWeb:optionalText,urlGmap:optionalText,perfilInstagram:optionalText,perfilFacebook:optionalText,perfilAirbnb:optionalText,perfilBooking:optionalText,perfilTurismoEntreRios:optionalText,assignedUserEmail:email}),
  z.object({action:z.literal("account_archive"),accountId:id,archived:z.boolean(),reason:z.string().trim().min(3).max(1000)}),
  z.object({action:z.literal("convert_client"),accountId:id,reason:z.string().trim().min(1).max(2000)}),
  z.object({action:z.literal("contact_save"),accountId:id,id:id.optional(),name:z.string().trim().min(1).max(300),position:optionalText,phone:optionalText,email:storedEmail,preferredChannel:optionalText,isPrimary:z.boolean().default(false),notes:optionalText}),
  z.object({action:z.literal("contact_delete"),accountId:id,id}),
  z.object({action:z.literal("opportunity_save"),accountId:id,id:id.optional(),creationRequestKey:z.string().uuid().optional(),opportunityName:z.string().trim().min(1).max(300),tipo:optionalText,estado:optionalText,assignedUserEmail:email,primaryContactId:id.nullable().optional(),serviceInterest:optionalText,estimatedCloseDate:date})
]);
export type CommercialMutation=z.infer<typeof commercialMutation>;
export type Contact=Selectable<CrmContacts>;
export type Account=Selectable<CrmAccounts>;
export type Opportunity=Selectable<Leads>;
export type CommercialDetail={account:Account;contacts:Contact[];opportunities:Opportunity[];journal:Selectable<CrmCommercialJournal>[];leadJournal:Selectable<LeadJournal>[];stages:string[];users?:{email:string;displayName:string}[]};
export type CommercialList={rows:(Account&{opportunityCount:number;contactCount:number})[];total:number;page:number};
export async function commercialRequest<T>(path:string,body?:unknown):Promise<T>{
  const r=await fetch("/_api/"+path,body===undefined?undefined:{method:"POST",headers:{"Content-Type":"application/json"},body:superjson.stringify(body)});
  const data=superjson.parse<T&{error?:string}>(await r.text());
  if(!r.ok)throw new Error(data.error||"No se pudo completar la operación comercial");
  return data;
}
export const getCommercialDetail=(accountId?:string,leadId?:string)=>commercialRequest<CommercialDetail>("commercial?"+new URLSearchParams(accountId?{accountId}:{leadId:leadId!}));
export const getCommercialList=(q:string,status:string,page:number)=>commercialRequest<CommercialList>("commercial?"+new URLSearchParams({q,...(status?{status}:{}),page:String(page)}));
export const saveCommercial=(body:CommercialMutation)=>commercialRequest<{id:string}>("commercial",commercialMutation.parse(body));
