import {sql} from 'kysely';
import {db} from './db';
import type {User} from './User';
import {assertBusinessAccess,assertLeadAccess,canModifyBusiness} from './crmPermissions';
import {INSTAGRAM_USERNAME_MISSING,assertAccountContactAllowed,instagramRecipient} from './communicationService';
import {orderTemplatesBySpecificity,templateCompatibility} from './messageTemplatePolicy';
import {htmlToPlainText} from './renderMessageTemplate';
import {contactPurposeOptions,defaultContactPurpose,type ContactPurpose} from './contactPurpose';

/**
 * Spec 97 §4.3 / §5.2: what the Instagram panel may prepare for a business (`templates?channel=instagram`). Instagram always goes to the
 * business username (no persons); templates are the stored channel `social`, filtered like `ContactTemplateDialog`. A Nuevo business only
 * allows the general verification contact; decision 12.6 adds «Sin gestión» with the purpose options of the CRM. Every rule is checked
 * again by `prepare` and `dispatch`: `blocked` is usability only.
 */
export type ScriptTemplate={id:string;name:string;recommended:boolean;body:string};
export type InstagramTemplatesResponse={leads:{id:string;name:string;type:string|null;stage:string;templates:ScriptTemplate[];contacts:[]}[];general:{defaultPurpose:ContactPurpose;purposes:{value:ContactPurpose;label:string;templates:ScriptTemplate[]}[]}|null;blocked:string|null;username:string|null};

type TemplateRow={id:string|number;name:string;body:string;channel:string;vertical:string|null;commercialProfile:string|null;managementType:string|null;purpose:string|null};
const listed=(rows:TemplateRow[]):ScriptTemplate[]=>orderTemplatesBySpecificity(rows).map((t,i)=>({id:String(t.id),name:t.name,recommended:i===0,body:htmlToPlainText(t.body).normalize('NFC')}));

/** Purposes the panel offers without a management: the CRM's list, without «care» for a business that is not a client yet (it needs a confirmation the panel does not ask). */
export function panelPurposes({status,isClient}:{status:string|null|undefined;isClient:boolean}):{value:ContactPurpose;label:string}[]{return contactPurposeOptions(status).filter(option=>option.value!=='care'||isClient);}

/** Null when the business does not exist or the user cannot see it (answered as «nothing to show», like WhatsApp). */
export async function instagramTemplates(accountId:string,user:User):Promise<InstagramTemplatesResponse|null>{
 const candidate=await db.selectFrom('crmAccounts').select('id').where('id','=',accountId).executeTakeFirst();if(!candidate)return null;
 let account;try{account=await assertBusinessAccess(db,accountId,user,false,false);}catch{return null;}
 const recipient=instagramRecipient(account),username=recipient?recipient.slice(1):null;
 const rows=await sql<{id:string;nombre:string;estado:string;managementType:string|null;tipo:string|null;commercialProfile:string|null}>`SELECT l.id::text,l.nombre,l.estado,l.management_type AS "managementType",l.tipo,l.commercial_profile AS "commercialProfile" FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=${accountId}::bigint AND l.deleted_at IS NULL AND s.classification='open' ORDER BY l.id`.execute(db);
 const isNew=account.status==='new',canEdit=[];
 // Nuevo: managements are not contacted, only the general verification (as the CRM).
 if(!isNew)for(const lead of rows.rows){try{await assertLeadAccess(db,String(lead.id),user,true);await assertAccountContactAllowed(db,accountId,String(lead.id),null,'social');canEdit.push(lead);}catch{}}
 const templates=await db.selectFrom('messageTemplates').select(['id','name','body','channel','vertical','commercialProfile','managementType','purpose']).where('active','=',true).where('channel','=','social').execute() as TemplateRow[];
 const leads=canEdit.map(lead=>({id:String(lead.id),name:lead.nombre,type:lead.managementType,stage:lead.estado,contacts:[] as [],templates:listed(templates.filter(t=>!templateCompatibility(t,{channel:'social',vertical:lead.tipo,commercialProfile:lead.commercialProfile,managementType:lead.managementType,purpose:null})))}));
 const general=canModifyBusiness(user,account)?{defaultPurpose:defaultContactPurpose(account.status),purposes:panelPurposes({status:account.status,isClient:account.commercialStatus==='client'}).map(option=>({...option,templates:listed(templates.filter(t=>!templateCompatibility(t,{channel:'social',vertical:account.tipo,commercialProfile:null,managementType:null,purpose:option.value})))}))}:null;
 let blocked:string|null=account.doNotContact?'El negocio tiene No contactar activo.':!username?INSTAGRAM_USERNAME_MISSING:account.archivedAt&&user.role!=='admin'?'Este negocio está archivado. Solo un administrador puede modificarlo.':!leads.length&&!general?(isNew?'En estado Nuevo solo se permite el contacto general de verificación.':'No hay gestiones abiertas que puedas modificar.'):null;
 if(!blocked){try{await assertAccountContactAllowed(db,accountId,null,null,'social');}catch(e){blocked=e instanceof Error?e.message:'Hay una restricción activa para Instagram.';}}
 return blocked?{leads:[],general:null,blocked,username}:{leads,general,blocked:null,username};
}
