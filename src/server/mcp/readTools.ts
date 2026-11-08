import type {Config} from './config';
import {read} from './data';
import {managementContract,page} from './contracts';
import {normalizedTextMatchSql,normalizedWordMatchSql} from './searchSql';
import {phoneNationalKeys,phoneSignificantKeys} from '../../helpers/dataNormalization';
import {instagramProfilePattern,normalizeInstagramUsername} from '../../helpers/instagramChat';
import {inlineBadgeFields} from '../../helpers/inlineBadgeFields';
import {redactStaffEmails} from './privacy';

/** Journal fields whose values identify staff: person badges plus legacy Spanish names. Their values are never returned. */
export const journalPersonFields:readonly string[]=Object.freeze([...Object.entries(inlineBadgeFields).filter(([,meta])=>meta.category==='person').map(([key])=>key),'asignadoA','assigned_user_email']);

const digits=(v:unknown)=>String(v??'').replace(/\D/g,'');
const phoneQuery=(q:string)=>/^\+?[\d\s().-]+$/.test(q.trim())&&digits(q).length>=6;
const instagramUser=(q:string)=>normalizeInstagramUsername(q);
const plainPhone=(column:string,param:string)=>`regexp_replace(coalesce(${column},''),'[^0-9]','','g') LIKE '%'||regexp_replace(${param},'[^0-9]','','g')||'%'`;
const phoneSql=(column:string,param:string,query:string)=>{const stored=`regexp_replace(coalesce(${column},''),'[^0-9]','','g')`;const keys=phoneSignificantKeys(query).map(key=>`right(${stored},8)='${key}'`);const national=phoneNationalKeys(query).flatMap(value=>[2,3,4].map(area=>`${stored} LIKE '%${value.slice(0,area)}15${value.slice(area)}'`));return `(${plainPhone(column,param)}${keys.length?` OR ${keys.join(' OR ')}`:''}${national.length?` OR ${national.join(' OR ')}`:''})`;};
const normalizedEq=(column:string,param:string)=>normalizedTextMatchSql(column,param);
const textLiteral=(value:string)=>`'${value.replaceAll("'","''")}'`;
const tokenMatch=(fields:string[],token:string)=>fields.map(field=>token==='n'?normalizedWordMatchSql(field,token):normalizedTextMatchSql(field,textLiteral(token)));
const profileMatch=(column:string,token:string)=>{const user=instagramUser(token);return user?`coalesce(${column},'') ~* ${textLiteral(instagramProfilePattern(user))}`:'false';};
const fieldSearch=(fields:string[],phones:string[],profiles:string[],q:string)=>{
 if(phoneQuery(q))return `(${[...fields.map(f=>normalizedTextMatchSql(f,textLiteral(q.trim()))),...phones.map(f=>phoneSql(f,'$2',q)),...profiles.map(f=>profileMatch(f,q))].join(' OR ')})`;
 return q.trim().split(/\s+/).slice(0,5).map(token=>`(${[...tokenMatch(fields,token),...profiles.map(p=>profileMatch(p,token))].join(' OR ')})`).join(' AND ');
};

export async function search(c:Config,q:string,limit:number,cursor:string,entity?:string){return read(c,async tx=>{
 const term=q.trim(),parts=cursor==='0'?[0,0]:cursor.split(':').map(Number),rank=parts[0]??0,id=parts[1]??0;
 const p=phoneQuery(term),phone=(col:string)=>p?phoneSql(col,'$2',term):'false';
 const businessMatch=fieldSearch(["a.nombre","a.ciudad","a.email","a.sitio_web"],["a.telefono","a.whatsapp"],["a.perfil_instagram"],term);
 const contactMatch=fieldSearch(["c.name","c.email"],["c.phone"],[],term);
 const businessEmailMatch=fieldSearch(['a.email'],[],[],term),businessWebsiteMatch=fieldSearch(['a.sitio_web'],[],[],term),contactEmailMatch=fieldSearch(['c.email'],[],[],term);
 const managementMatch=fieldSearch(["l.opportunity_name","l.contact_name"],[],[],term);
 const rows=await tx.unsafe(`SELECT * FROM (
  SELECT 'business'::text AS type,1 AS type_rank,a.id::bigint AS sort_id,a.id::text AS id,NULL::text AS managementId,a.nombre AS name,a.ciudad AS city,
   CASE WHEN ${businessEmailMatch} THEN 'email' WHEN ${profileMatch('a.perfil_instagram',term)} THEN 'instagram' WHEN ${businessWebsiteMatch} THEN 'website' WHEN ${phone('a.telefono')} OR ${phone('a.whatsapp')} OR (${p} AND EXISTS(SELECT 1 FROM public.crm_contacts pc WHERE pc.account_id=a.id AND pc.deleted_at IS NULL AND ${phone('pc.phone')})) THEN 'phone' ELSE 'name' END AS matchedChannel,a.do_not_contact
   FROM public.crm_accounts a WHERE a.deleted_at IS NULL AND a.merged_into_id IS NULL AND a.archived_at IS NULL AND (${businessMatch} OR EXISTS(SELECT 1 FROM public.crm_contacts c WHERE c.account_id=a.id AND c.deleted_at IS NULL AND ${contactMatch}))
  UNION ALL SELECT 'contact',2,c.id::bigint,c.id::text,NULL,a.nombre,a.ciudad,CASE WHEN ${contactEmailMatch} THEN 'email' WHEN ${phone('c.phone')} THEN 'phone' ELSE 'contact' END,a.do_not_contact FROM public.crm_contacts c JOIN public.crm_accounts a ON a.id=c.account_id WHERE c.deleted_at IS NULL AND a.deleted_at IS NULL AND a.merged_into_id IS NULL AND a.archived_at IS NULL AND ${contactMatch}
  UNION ALL SELECT 'management',3,l.id::bigint,l.id::text,l.id::text,a.nombre,a.ciudad,'management',a.do_not_contact FROM public.leads l JOIN public.crm_accounts a ON a.id=l.account_id WHERE l.deleted_at IS NULL AND a.deleted_at IS NULL AND a.merged_into_id IS NULL AND a.archived_at IS NULL AND ${managementMatch}
 ) hits WHERE $1::text IS NOT NULL AND $2::text IS NOT NULL AND (type_rank,sort_id)>($3::int,$4::bigint) AND ($5::text IS NULL OR type=$5) ORDER BY type_rank,sort_id LIMIT $6`,[`%${term}%`,term,rank,id,entity??null,limit+1]);
 const items=rows.map((r:Record<string,unknown>)=>({type:r.type,id:String(r.id),managementId:r.managementid===null?null:String(r.managementid),name:r.name,city:r.city,matchedChannel:r.matchedchannel,doNotContact:Boolean(r.do_not_contact)}));return page(items,limit,r=>`${r.type==='business'?1:r.type==='contact'?2:3}:${r.id}`);
});}
export async function businessManagements(c:Config,businessId:string,includeClosed:boolean,cursor:string,limit:number){return read(c,async tx=>{
 const acct=await tx`SELECT id,do_not_contact,merged_into_id FROM public.crm_accounts WHERE id=${businessId} AND deleted_at IS NULL`;if(!acct.length)return {found:false};if(acct[0]!.merged_into_id)return {found:false,reason:'merged',mergedIntoId:String(acct[0]!.merged_into_id)};
 const rows=await tx`SELECT l.id::text,l.opportunity_name,l.management_type,l.tipo,l.estado,l.created_at,s.classification,u.id::text AS owner_id,u.display_name AS owner_name FROM public.leads l LEFT JOIN public.crm_stages s ON s.name=l.estado LEFT JOIN public.users u ON u.email=l.assigned_user_email WHERE l.account_id=${businessId} AND l.deleted_at IS NULL AND l.id>${cursor} AND (${includeClosed} OR s.classification='open') ORDER BY l.id LIMIT ${limit+1}`;
 const items=rows.map((r:Record<string,unknown>)=>({...managementContract(r),doNotContact:Boolean(acct[0]!.do_not_contact)}));return {found:true,...page(items,limit,r=>String(r.id))};
});}
export async function getManagement(c:Config,id:string,cursor:string,limit:number){return read(c,async tx=>{
 const rows=await tx`SELECT l.id::text,l.account_id::text,l.opportunity_name,l.management_type,l.tipo,l.estado,l.created_at,s.classification,a.do_not_contact,a.merged_into_id,u.id::text AS owner_id,u.display_name AS owner_name FROM public.leads l JOIN public.crm_accounts a ON a.id=l.account_id LEFT JOIN public.crm_stages s ON s.name=l.estado LEFT JOIN public.users u ON u.email=l.assigned_user_email WHERE l.id=${id} AND l.deleted_at IS NULL AND a.deleted_at IS NULL`;
 if(!rows.length)return {found:false};const r=rows[0]!;if(r.merged_into_id)return {found:false,reason:'merged',mergedIntoId:String(r.merged_into_id)};
 const staff=await tx`SELECT email FROM public.users WHERE email IS NOT NULL`;
 const staffEmails=staff.map((row:Record<string,unknown>)=>String(row.email));
 const events=await tx`SELECT id,action,field_name,CASE WHEN redacted THEN NULL WHEN length(old_value)>500 THEN left(old_value,500) ELSE old_value END AS old_value,CASE WHEN redacted THEN NULL WHEN length(new_value)>500 THEN left(new_value,500) ELSE new_value END AS new_value,redacted,NOT redacted AND (length(old_value)>500 OR length(new_value)>500) AS truncated,created_at,actor_name FROM (SELECT id::text AS id,id AS sort_id,action,field_name,old_value,new_value,created_at,actor_name,(coalesce(field_name ~* '(assign|owner|seller|user|actor)',false) OR field_name=ANY(${tx.array([...journalPersonFields])})) AS redacted FROM public.lead_journal WHERE lead_id=${id} AND (${cursor}='0' OR id<${cursor})) j ORDER BY sort_id DESC LIMIT ${limit+1}`;
 const items=events.slice(0,limit).map((event:Record<string,unknown>)=>({...event,old_value:redactStaffEmails(event.old_value,staffEmails),new_value:redactStaffEmails(event.new_value,staffEmails),untrusted:true}));return {found:true,management:managementContract(r as Record<string,unknown>),businessId:String(r.account_id),doNotContact:Boolean(r.do_not_contact),journal:{items,nextCursor:events.length>limit?String(events[limit-1]!.id):null}};
});}
export async function catalogs(c:Config,name:string,includeInactive=false){return read(c,async tx=>{
 const data=name==='stages'?await tx`SELECT name AS id,coalesce(display_name,name) AS label,active,management_type AS role,classification FROM public.crm_stages WHERE (${includeInactive} OR active) ORDER BY sort_order,name`
 :name==='reasons'?await tx`SELECT management_type||':'||outcome_key||':'||reason_key AS id,name AS label,active,management_type AS role,outcome_key AS classification FROM public.crm_management_reasons WHERE (${includeInactive} OR active) ORDER BY management_type,outcome_key,reason_key`
 :name==='verticals'?await tx`SELECT name AS id,name AS label,active FROM public.crm_verticals WHERE (${includeInactive} OR active) ORDER BY sort_order,name`
 :await tx`SELECT id::text,display_name AS label,role,(deactivated_at IS NULL) AS active FROM public.users WHERE (${includeInactive} OR deactivated_at IS NULL) ORDER BY display_name`;
 return {catalog:name,items:data.map((r:Record<string,unknown>)=>({...r,active:r.active??true}))};
});}
