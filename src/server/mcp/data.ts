import postgres from 'postgres';
import type {Config} from './config';
import {REQUIRED_MCP_TABLES} from './requiredTables.mjs';
import {businessState,managementContract,page} from './contracts';
import {normalizedTextMatchSql,normalizedWordMatchSql} from './searchSql';
import {phoneNationalKeys,phoneSignificantKeys} from '../../helpers/dataNormalization';
import {instagramProfilePattern,normalizeInstagramUsername} from '../../helpers/instagramChat';
let pool:ReturnType<typeof postgres>|undefined;
export const businessColumns=`a.id::text,a.nombre,a.ciudad,a.tipo,a.subtipo,a.provincia,a.direccion,a.telefono,a.whatsapp,a.email,a.sitio_web,a.url_gmap,a.perfil_instagram,a.perfil_facebook,a.perfil_airbnb,a.perfil_booking,a.perfil_turismo_entre_rios,a.business_notes,a.discovery_source,a.verification_urls,a.verified_on,a.commercial_status,a.do_not_contact,a.merged_into_id::text,a.archived_at,a.updated_at,coalesce((SELECT json_agg(json_build_object('tipo',c.tipo,'subtipo',c.subtipo) ORDER BY coalesce(v.sort_order,2147483647),c.tipo,c.subtipo NULLS FIRST,c.id) FROM public.crm_account_classifications c LEFT JOIN public.crm_verticals v ON v.name=c.tipo WHERE c.account_id=a.id),'[]'::json) AS clasificaciones`;
export async function read<T>(c:Config,fn:(tx:postgres.TransactionSql)=>Promise<T>):Promise<T>{
 pool??=postgres(c.databaseUrl,{prepare:false,max:2,idle_timeout:20,connect_timeout:10});
 return pool.begin('isolation level repeatable read read only',async tx=>{
  await tx.unsafe("SET LOCAL statement_timeout TO '5s'; SET LOCAL search_path TO pg_catalog,public");
  const unsafe=await tx`SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)
   UNION ALL SELECT 1 FROM pg_tables WHERE schemaname='public' AND has_table_privilege(current_user,quote_ident(schemaname)||'.'||quote_ident(tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   UNION ALL SELECT 1 WHERE has_schema_privilege(current_user,'public','CREATE') LIMIT 1`;
  if(unsafe.length)throw Object.assign(new Error('Unsafe reader role'),{code:'MCP_READER_UNSAFE'});
  return await fn(tx);
 }) as Promise<T>;
}
export async function missingGrants(c:Config){
 return read(c,async tx=>{
  const missing:string[]=[];
  for(const item of REQUIRED_MCP_TABLES){
   const table=typeof item==='string'?item:item.table;
   if(typeof item==='string'){
    const [row]=await tx`SELECT has_table_privilege(current_user,${'public.'+table},'SELECT') AS granted`;
    if(!row?.granted)missing.push(table);
   }else for(const column of item.columns){
    const [row]=await tx`SELECT has_column_privilege(current_user,${'public.'+table},${column},'SELECT') AS granted`;
    if(!row?.granted)missing.push(`${table}.${column}`);
   }
   if(typeof item!=='string'){
    const sensitive=table==='users'?'email':table==='lead_journal'?'actor_email':null;
    if(sensitive){const [row]=await tx`SELECT has_column_privilege(current_user,${'public.'+table},${sensitive},'SELECT') AS column_granted,has_table_privilege(current_user,${'public.'+table},'SELECT') AS table_granted`;
     if(row?.column_granted||row?.table_granted)missing.push(`excessive_grant:${table}.${sensitive}`);
    }
   }
  }
  return missing;
 });
}
export async function readerPing(c:Config){return read(c,async tx=>{await tx`SELECT 1`;});}
export async function closeData(){await pool?.end();pool=undefined;}
export async function list(c:Config,input:{cursor?:string;limit:number;search?:string;city?:string;vertical?:string;includeArchived:boolean}){
 return read(c,async tx=>{
  const q=input.search?.trim()||null;
 const isPhone=!!q&&/^\+?[\d\s().-]+$/.test(q)&&q.replace(/\D/g,'').length>=6;
 const tokens=q?(isPhone?[q]:q.split(/\s+/).slice(0,5)):[];
 const textExpr=(fields:string[],profiles:string[]=[] )=>tokens.map(token=>{const literal=`'${token.replaceAll("'","''")}'`;const profile=normalizeInstagramUsername(token);return `(${[...fields.map(f=>token==='n'?normalizedWordMatchSql(f,token):normalizedTextMatchSql(f,literal)),...profiles.map(col=>profile?`coalesce(${col},'') ~* '${instagramProfilePattern(profile)}'`:'false')].join(' OR ')})`;}).join(' AND ')||'false';
 const accountMatch=textExpr(["a.nombre","a.ciudad","a.email","a.sitio_web"],["a.perfil_instagram"]);
 const contactMatch=textExpr(["ct.name","ct.email"]);
 const phoneClause=(col:string)=>{if(!isPhone||!q)return 'false';const stored=`regexp_replace(coalesce(${col},''),'[^0-9]','','g')`;const keys=phoneSignificantKeys(q).map(key=>`right(${stored},8)='${key}'`);const national=phoneNationalKeys(q).flatMap(value=>[2,3,4].map(area=>`${stored} LIKE '%${value.slice(0,area)}15${value.slice(area)}'`));return `(${stored} LIKE '%'||regexp_replace($3,'[^0-9]','','g')||'%'${keys.length?` OR ${keys.join(' OR ')}`:''}${national.length?` OR ${national.join(' OR ')}`:''})`;};
 const rows=await tx.unsafe(`SELECT ${businessColumns} FROM public.crm_accounts a WHERE a.id>$1::bigint AND a.merged_into_id IS NULL AND a.deleted_at IS NULL AND ($2::boolean OR a.archived_at IS NULL) AND ($3::text IS NULL OR (${accountMatch} OR ${phoneClause('a.telefono')} OR ${phoneClause('a.whatsapp')} OR EXISTS(SELECT 1 FROM public.crm_contacts ct WHERE ct.account_id=a.id AND ct.deleted_at IS NULL AND (${contactMatch} OR ${phoneClause('ct.phone')})))) AND ($4::text IS NULL OR a.ciudad=$4) AND ($5::text IS NULL OR EXISTS(SELECT 1 FROM public.crm_account_classifications c WHERE c.account_id=a.id AND c.tipo=$5)) ORDER BY a.id LIMIT $6`,[input.cursor??'0',input.includeArchived,q,input.city??null,input.vertical??null,input.limit+1]);
  const items:Record<string,unknown>[]=rows.map((row:Record<string,unknown>)=>({...row,...businessState(row)}));
  return {...page(items,input.limit,row=>String(row.id))};
 });
}
export async function business(c:Config,id:string){return read(c,async tx=>{
 const rows=await tx.unsafe(`SELECT ${businessColumns} FROM public.crm_accounts a WHERE a.id=$1::bigint AND a.deleted_at IS NULL`,[id]);
 if(!rows.length)return {found:false};
 if(rows[0]!.merged_into_id)return {found:false,reason:'merged',mergedIntoId:String(rows[0]!.merged_into_id)};
 const contacts=await tx`SELECT id::text,name,position,phone,email,preferred_channel,is_primary FROM public.crm_contacts WHERE account_id=${id} AND deleted_at IS NULL ORDER BY id`;
 const managements=await tx`SELECT l.id::text,l.opportunity_name,l.management_type,l.tipo,l.estado,l.created_at,s.classification,l.deleted_at FROM public.leads l LEFT JOIN public.crm_stages s ON s.name=l.estado WHERE l.account_id=${id} ORDER BY l.id`;
 const linked=await tx`SELECT a.id::text AS id,a.nombre AS nombre FROM public.crm_account_seller_group_members m JOIN public.crm_account_seller_group_members related ON related.group_id=m.group_id JOIN public.crm_accounts a ON a.id=related.account_id WHERE m.account_id=${id} AND a.id<>${id} AND a.deleted_at IS NULL AND a.merged_into_id IS NULL ORDER BY a.id`;
 const sellerGroup=await tx`SELECT g.id::text,g.note FROM public.crm_account_seller_group_members m JOIN public.crm_account_seller_groups g ON g.id=m.group_id WHERE m.account_id=${id}`;
 return {found:true,business:{...rows[0],...businessState(rows[0] as Record<string,unknown>)},contacts:contacts.map((row:Record<string,unknown>)=>({...row,...businessState(rows[0] as Record<string,unknown>)})),managements:managements.filter((row:Record<string,unknown>)=>row.deleted_at===null).map((row:Record<string,unknown>)=>({...managementContract(row),...businessState(rows[0] as Record<string,unknown>)})),sellerGroup:sellerGroup[0]??null,negocios_vinculados:linked.map((row:Record<string,unknown>)=>({...row,...businessState(rows[0] as Record<string,unknown>)}))};
});}
export async function matches(c:Config,id:string){return read(c,async tx=>{
 const source=await tx`SELECT nombre,ciudad,telefono,whatsapp,email,sitio_web,perfil_instagram,url_gmap,merged_into_id FROM public.crm_accounts WHERE id=${id} AND deleted_at IS NULL`;
 if(!source.length)return {found:false};
 const a=source[0];
 if(a.merged_into_id)return {found:false,reason:'merged',mergedIntoId:String(a.merged_into_id)};
 const rows=await tx.unsafe(`SELECT ${businessColumns} FROM public.crm_accounts a WHERE a.id<>$1::bigint AND a.merged_into_id IS NULL AND a.deleted_at IS NULL AND (
  (lower(nombre)=lower($2) AND ciudad IS NOT DISTINCT FROM $3) OR
  (nullif(regexp_replace(telefono,'[^0-9]','','g'),'') IS NOT NULL AND right(regexp_replace(telefono,'[^0-9]','','g'),10)=right(regexp_replace($4,'[^0-9]','','g'),10)) OR
  (nullif(email,'') IS NOT NULL AND lower(email)=lower($5)) OR
  (nullif(sitio_web,'') IS NOT NULL AND sitio_web=$6) OR
  (nullif(perfil_instagram,'') IS NOT NULL AND perfil_instagram=$7) OR
  (nullif(url_gmap,'') IS NOT NULL AND url_gmap=$8)
 ) ORDER BY id LIMIT 101`,[id,a.nombre,a.ciudad,a.telefono??a.whatsapp??'',a.email??'',a.sitio_web??'',a.perfil_instagram??'',a.url_gmap??'']);
 return {found:true,candidates:rows.slice(0,100).map((row:Record<string,unknown>)=>({...row,...businessState(row)})),truncated:rows.length>100,notice:'Coincidencias para revisión, no prueba de identidad. Teléfonos centrales, sitios municipales, cadenas y domicilios compartidos no justifican una fusión automática.'};
});}
export async function overview(c:Config){return read(c,async tx=>{
 const [total]=await tx`SELECT count(DISTINCT a.id)::int AS businesses FROM public.crm_accounts a WHERE a.merged_into_id IS NULL AND a.deleted_at IS NULL`;
 return {
  counts:await tx`SELECT c.tipo,count(DISTINCT a.id)::int AS businesses,count(DISTINCT a.id) FILTER(WHERE a.archived_at IS NOT NULL)::int AS archived FROM public.crm_accounts a LEFT JOIN public.crm_account_classifications c ON c.account_id=a.id WHERE a.merged_into_id IS NULL AND a.deleted_at IS NULL GROUP BY c.tipo ORDER BY c.tipo`,
  totalBusinesses:total.businesses,
  verticals:await tx`SELECT name,active FROM public.crm_verticals ORDER BY name`,
  subtypes:await tx`SELECT type_name,name,active FROM public.crm_subtypes ORDER BY type_name,name`
 };
});}
export async function history(c:Config,id:string,cursor:string,limit:number){return read(c,async tx=>{
 const [business]=await tx`SELECT do_not_contact,merged_into_id FROM public.crm_accounts WHERE id=${id} AND deleted_at IS NULL`;
 if(!business)return {found:false};
 if(business.merged_into_id)return {found:false,reason:'merged',mergedIntoId:String(business.merged_into_id)};
 const rows=await tx`SELECT id::text,action,actor_name,metadata,created_at FROM public.crm_commercial_journal WHERE account_id=${id} AND id>${cursor} ORDER BY id LIMIT ${limit+1}`;
 const items=rows.slice(0,limit);return {found:true,doNotContact:Boolean(business.do_not_contact),events:items,nextCursor:rows.length>limit?items.at(-1)?.id:null,notice:'Este historial es el journal comercial del negocio; no implica entrega de mensajes ni incluye automáticamente todos los diarios de gestiones.'};
});}
