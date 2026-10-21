import { z } from "zod";
import {historyFilters} from "../helpers/historyLabels";
import {apiJson,postJson} from "../helpers/apiClient";
import type { Selectable } from "kysely";
import type { CrmAccounts, CrmContacts, CrmCommercialJournal, Leads, LeadJournal } from "../helpers/schema";
import {managementTypes,type ManagementType} from '../helpers/businessManagement';
import type {BusinessStatus} from '../helpers/businessStatus';

const id=z.string().regex(/^[1-9]\d*$/);
const optionalText=z.string().trim().max(2000).nullable().optional();
const storedEmail=z.string().trim().max(320).nullable().optional();
const email=z.union([z.string().trim().email().max(320),z.literal("")]).nullable().optional();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,"Fecha inválida").nullable().optional();
export const commercialQuery=z.object({
  historyPage:z.coerce.number().int().min(1).max(100000).optional(),historyKind:z.enum(historyFilters).default('all'),accountId:id.optional(),leadId:id.optional(),q:z.string().max(200).optional(),
  deleted:z.preprocess(v=>v===true||v==="true",z.boolean()).default(false),status:z.enum(["prospect","client"]).optional(),archived:z.preprocess(v=>v===true||v==="true",z.boolean()).default(false),page:z.coerce.number().int().min(1).default(1)
});
export const commercialMutation=z.discriminatedUnion("action",[
  z.object({action:z.literal("account_save"),id:id.optional(),nombre:z.string().trim().min(1).max(300),tipo:optionalText,subtipo:optionalText,provincia:optionalText,direccion:optionalText,whatsapp:optionalText,businessNotes:z.string().max(10000).nullable().optional(),discoverySource:optionalText,verificationUrls:z.string().max(10000).nullable().optional(),verifiedOn:date,ciudad:optionalText,telefono:optionalText,email:storedEmail,sitioWeb:optionalText,urlGmap:optionalText,perfilInstagram:optionalText,perfilFacebook:optionalText,perfilAirbnb:optionalText,perfilBooking:optionalText,perfilTurismoEntreRios:optionalText,assignedUserEmail:email,primaryContact:z.object({name:z.string().trim().min(1).max(300),phone:optionalText,email:storedEmail}).optional(),personPhoneDncAcknowledged:z.boolean().optional()}),
  z.object({action:z.literal("account_trash"),accountIds:z.array(id).min(1).max(1000),deleted:z.boolean(),reason:z.string().trim().min(3).max(1000)}),
  z.object({action:z.literal("account_archive"),accountId:id,archived:z.boolean(),reason:z.string().trim().min(3).max(1000)}),
  z.object({action:z.literal("convert_client"),accountId:id,reason:z.string().trim().min(1).max(2000)}),
  z.object({action:z.literal("set_client"),accountId:id,isClient:z.boolean(),reason:z.string().trim().min(1).max(2000)}),
  z.object({action:z.literal("business_status"),accountId:id,status:z.enum(["new","reviewed","in_management","no_follow_up_scheduled","recontact","archived"]),recontactAt:date,reason:z.string().trim().max(2000).optional()}),
  z.object({action:z.literal("contact_save"),accountId:id,id:id.optional(),name:z.string().trim().min(1).max(300),position:optionalText,phone:optionalText,email:storedEmail,preferredChannel:optionalText,isPrimary:z.boolean().default(false),notes:optionalText,personPhoneDncAcknowledged:z.boolean().optional()}),
  z.object({action:z.literal("contact_delete"),accountId:id,id}),
  z.object({action:z.literal("opportunity_save"),accountId:id,id:id.optional(),creationRequestKey:z.string().uuid().optional(),confirmReviewed:z.boolean().optional(),managementType:z.enum(managementTypes).optional(),opportunityName:z.string().trim().min(1).max(300),tipo:optionalText,estado:optionalText,assignedUserEmail:email,primaryContactId:id.nullable().optional(),serviceInterest:optionalText,estimatedCloseDate:date})
]);
export type CommercialMutation=z.infer<typeof commercialMutation>;
export type Contact=Selectable<CrmContacts>&{/** Decision D2: No contactar businesses (name and city only) whose phone is exactly this person's phone. Computed on every detail read; empty or absent when none. */dncPhoneBusinesses?:{nombre:string;ciudad:string|null}[]};
export type Account=Selectable<CrmAccounts>&{status:BusinessStatus|null;recontactAt:Date|string|null;isClient:boolean;referredToLeandro:boolean};
export type Opportunity=Selectable<Leads>&{managementType:ManagementType|null;referredPreviousStage:string|null};
export type CommercialDetail={account:Account;contacts:Contact[];opportunities:Opportunity[];journal:Selectable<CrmCommercialJournal>[];leadJournal:Selectable<LeadJournal>[];managementJournal?:{id:string;leadId:string;action:string;actorEmail:string|null;actorName:string;oldStage:string|null;newStage:string|null;comment:string|null;metadata:unknown;createdAt:Date|string}[];stages:string[];users?:{email:string;displayName:string}[];/** Decision 8A: the user may correct this business's contact data (owner, admin or a seller with an open management). */canEditContactData?:boolean};
export type CommercialList={rows:(Account&{opportunityCount:number;contactCount:number})[];total:number;page:number};
export async function commercialRequest<T>(path:string,body?:unknown):Promise<T>{
  const options={fallback:"No se pudo completar la operación comercial"};
  return body===undefined?apiJson<T>("/_api/"+path,{},options):postJson<T>("/_api/"+path,body,options);
}
export const getCommercialDetail=(accountId?:string,leadId?:string)=>commercialRequest<CommercialDetail>("commercial?"+new URLSearchParams(accountId?{accountId}:{leadId:leadId!}));
export const getCommercialList=(q:string,status:string,page:number)=>commercialRequest<CommercialList>("commercial?"+new URLSearchParams({q,...(status?{status}:{}),page:String(page)}));
export const saveCommercial=(body:CommercialMutation)=>commercialRequest<{id:string;recontactTask?:{id:string;dueDate:string;action:'created'|'moved'|'kept'}}>("commercial",commercialMutation.parse(body));
