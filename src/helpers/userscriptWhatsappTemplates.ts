import {sql} from 'kysely';
import {db} from './db';
import type {User} from './User';
import {assertBusinessAccess,assertLeadAccess,canModifyBusiness} from './crmPermissions';
import {assertAccountContactAllowed} from './communicationService';
import {orderTemplatesBySpecificity,templateCompatibility} from './messageTemplatePolicy';
import {htmlToWhatsApp} from './templateChannelFormatting';
import {templateMaterialRefs} from './templateMaterialService';
import {labelMaterialReferences} from './templateMaterials';
import {stageLabel} from './crmLabels';
import {defaultContactPurpose,type ContactPurpose} from './contactPurpose';
import {panelPurposes,type ScriptTemplate} from './userscriptInstagramTemplates';

/**
 * What the WhatsApp panel may prepare for a business (`templates?channel=whatsapp`, spec 84) and, since spec 98 decision 4, «Sin gestión»
 * like the Instagram panel (spec 97 decision 12.6): the purpose options of the CRM and the people the general contact can go to. Every rule
 * is checked again by `prepare`, `material_add` and `dispatch`: `blocked` is usability only.
 */
export type ScriptPerson={id:string;name:string;phone:string;default:boolean};
export type WhatsappGeneral={defaultPurpose:ContactPurpose;purposes:{value:ContactPurpose;label:string;templates:ScriptTemplate[]}[];contacts:ScriptPerson[];businessPhone:string|null};
export type WhatsappTemplatesResponse={leads:{id:string;name:string;type:string|null;stage:string;stageKey:string;templates:ScriptTemplate[];contacts:ScriptPerson[]}[];general:WhatsappGeneral|null;blocked:string|null};

const NEW_ONLY_VERIFICATION='En estado Nuevo solo se permite el contacto general de verificación.';
type ContactRow={id:string|number;name:string;phone:string|null;isPrimary:boolean|null};

/**
 * Who a WhatsApp contact without a management goes to (the service's `channelTarget`): when any person of the business has a phone, one of
 * them must be chosen (only those without a restriction are offered); otherwise the business WhatsApp or phone. Null when there is nobody.
 */
export function whatsappGeneralPeople({contacts,eligibleIds,accountPhone}:{contacts:readonly ContactRow[];eligibleIds:readonly string[];accountPhone:string|null}):{contacts:ScriptPerson[];businessPhone:string|null}|null{
 const withPhone=contacts.filter(c=>c.phone?.trim()),eligible=withPhone.filter(c=>eligibleIds.includes(String(c.id)));
 const businessPhone=withPhone.length?null:accountPhone?.trim()||null;
 if(!eligible.length&&!businessPhone)return null;
 const preferred=eligible.find(c=>c.isPrimary)??eligible[0];
 return {contacts:eligible.map(c=>({id:String(c.id),name:c.name,phone:c.phone!.trim(),default:c.id===preferred?.id})),businessPhone};
}

/** Why the panel cannot prepare anything (null = it can), before the restriction check: No contactar, then nothing to prepare. */
export function whatsappBlockReason({status,doNotContact,leads,general}:{status:string|null;doNotContact:boolean;leads:number;general:boolean}):string|null{
 if(doNotContact)return 'El negocio tiene No contactar activo.';
 if(!leads&&!general)return status==='new'?NEW_ONLY_VERIFICATION:'No hay gestiones abiertas que puedas modificar.';
 return null;
}

/**
 * The scope of the WhatsApp panel for a business: the open managements the token's user can modify (none in Nuevo: only the general verification),
 * the «Sin gestión» people when the user can modify the business, and why WhatsApp is blocked. Null when the business does not exist or the
 * user cannot see it (both answered as «nothing to show»).
 */
export async function scriptWhatsappScope(accountId:string,user:User){
 const candidate=await db.selectFrom('crmAccounts').select('id').where('id','=',accountId).executeTakeFirst();if(!candidate)return null;
 let account;try{account=await assertBusinessAccess(db,accountId,user,false,false);}catch{return null;}
 const rows=await sql<{id:string;nombre:string;estado:string;managementType:string|null;tipo:string|null;commercialProfile:string|null;primaryContactId:string|null}>`SELECT l.id::text,l.nombre,l.estado,l.management_type AS "managementType",l.tipo,l.commercial_profile AS "commercialProfile",l.primary_contact_id::text AS "primaryContactId" FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=${accountId}::bigint AND l.deleted_at IS NULL AND s.classification='open' ORDER BY l.id`.execute(db);
 const canEdit=[];if(account.status!=='new')for(const lead of rows.rows){try{await assertLeadAccess(db,String(lead.id),user,true);canEdit.push(lead);}catch{}}
 const contacts=await db.selectFrom('crmContacts').select(['id','name','phone','isPrimary']).where('accountId','=',accountId).where('deletedAt','is',null).orderBy('id').execute() as ContactRow[];
 let people:ReturnType<typeof whatsappGeneralPeople>=null;
 if(canModifyBusiness(user,account)){const eligibleIds:string[]=[];for(const c of contacts){if(!c.phone?.trim())continue;try{await assertAccountContactAllowed(db,accountId,null,String(c.id),'whatsapp');eligibleIds.push(String(c.id));}catch{}}people=whatsappGeneralPeople({contacts,eligibleIds,accountPhone:account.whatsapp||account.telefono||null});}
 let blocked=whatsappBlockReason({status:account.status??null,doNotContact:!!account.doNotContact,leads:canEdit.length,general:!!people});
 if(!blocked){try{await assertAccountContactAllowed(db,accountId,canEdit[0]?String(canEdit[0].id):null,null,'whatsapp');}catch(e){blocked=e instanceof Error?e.message:'Hay una restricción activa para WhatsApp.';}}
 return {account,canEdit,contacts,people,blocked};
}

/** `templates?channel=whatsapp`: the managements with their models and people, plus «Sin gestión» (spec 98 decision 4). Null as {@link scriptWhatsappScope}. */
export async function whatsappTemplates(accountId:string,user:User):Promise<WhatsappTemplatesResponse|null>{
 const scope=await scriptWhatsappScope(accountId,user);if(!scope)return null;
 const {account,canEdit,contacts,people}=scope;let blocked=scope.blocked;
 const all=await db.selectFrom('messageTemplates').select(['id','name','body','channel','vertical','commercialProfile','managementType','purpose']).where('active','=',true).where('channel','=','whatsapp').execute();
 const materialTitles=Object.fromEntries(Object.values(await templateMaterialRefs(db,{templates:all.map(t=>({id:String(t.id),body:t.body}))})).flat().map(r=>[r.materialId,r.title]));
 const listed=(rows:typeof all):ScriptTemplate[]=>orderTemplatesBySpecificity(rows).map((t,i)=>({id:String(t.id),name:t.name,recommended:i===0,body:labelMaterialReferences({text:htmlToWhatsApp(t.body).normalize('NFC'),titles:materialTitles,html:false})}));
 const leads=[];
 for(const lead of canEdit){const eligible=[];for(const c of contacts){if(!c.phone)continue;try{await assertAccountContactAllowed(db,accountId,String(lead.id),String(c.id),'whatsapp');eligible.push(c);}catch{}}const preference=eligible.find(c=>String(c.id)===String(lead.primaryContactId))||(eligible.length===1?eligible[0]:eligible.find(c=>c.isPrimary));leads.push({id:String(lead.id),name:lead.nombre,type:lead.managementType,stage:stageLabel(lead.estado),stageKey:lead.estado,templates:listed(all.filter(t=>!templateCompatibility(t,{channel:'whatsapp',vertical:lead.tipo,commercialProfile:lead.commercialProfile,managementType:lead.managementType,purpose:null}))),contacts:eligible.map(c=>({id:String(c.id),name:c.name,phone:c.phone!,default:preference?.id===c.id}))});}
 const general:WhatsappGeneral|null=people?{defaultPurpose:defaultContactPurpose(account.status),purposes:panelPurposes({status:account.status,isClient:account.commercialStatus==='client'}).map(option=>({...option,templates:listed(all.filter(t=>!templateCompatibility(t,{channel:'whatsapp',vertical:account.tipo,commercialProfile:null,managementType:null,purpose:option.value})))})),...people}:null;
 if(!blocked&&!general&&!leads.some(lead=>lead.contacts.length||!!account.telefono))blocked='No hay un teléfono disponible para preparar el mensaje.';
 return blocked?{leads,general:null,blocked}:{leads,general,blocked:null};
}
