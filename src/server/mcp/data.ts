import postgres from 'postgres';
import type {Config} from './config';
let pool:ReturnType<typeof postgres>|undefined;
export const businessColumns=`id::text,nombre,ciudad,tipo,subtipo,provincia,direccion,telefono,whatsapp,email,sitio_web,url_gmap,perfil_instagram,perfil_facebook,perfil_airbnb,perfil_booking,perfil_turismo_entre_rios,business_notes,discovery_source,verification_urls,verified_on,assigned_user_email,commercial_status,do_not_contact,merged_into_id::text,archived_at,updated_at`;
export async function read<T>(c:Config,fn:(tx:postgres.TransactionSql)=>Promise<T>):Promise<T>{
 pool??=postgres(c.databaseUrl,{prepare:false,max:2,idle_timeout:20,connect_timeout:10});
 return pool.begin('isolation level repeatable read read only',async tx=>{
  await tx.unsafe("SET LOCAL statement_timeout TO '5s'; SET LOCAL search_path TO pg_catalog,public");
  const unsafe=await tx`SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)
   UNION ALL SELECT 1 FROM pg_tables WHERE schemaname='public' AND has_table_privilege(current_user,quote_ident(schemaname)||'.'||quote_ident(tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   UNION ALL SELECT 1 WHERE has_schema_privilege(current_user,'public','CREATE') LIMIT 1`;
  if(unsafe.length)throw new Error('MCP database role must have read-only privileges');
  return await fn(tx);
 }) as Promise<T>;
}
export async function closeData(){await pool?.end();pool=undefined;}
export async function list(c:Config,input:{cursor?:string;limit:number;search?:string;city?:string;vertical?:string;includeArchived:boolean}){
 return read(c,async tx=>{
  const rows=await tx.unsafe(`SELECT ${businessColumns} FROM public.crm_accounts WHERE id>$1::bigint AND merged_into_id IS NULL AND ($2::boolean OR archived_at IS NULL) AND ($3::text IS NULL OR nombre ILIKE '%'||$3||'%') AND ($4::text IS NULL OR ciudad=$4) AND ($5::text IS NULL OR tipo=$5) ORDER BY id LIMIT $6`,[input.cursor??'0',input.includeArchived,input.search??null,input.city??null,input.vertical??null,input.limit+1]);
  const more=rows.length>input.limit,items=rows.slice(0,input.limit);
  return {businesses:items,nextCursor:more?items.at(-1)?.id:null};
 });
}
export async function business(c:Config,id:string){return read(c,async tx=>{
 const rows=await tx.unsafe(`SELECT ${businessColumns} FROM public.crm_accounts WHERE id=$1::bigint`,[id]);
 if(!rows.length)return {found:false};
 const contacts=await tx`SELECT id::text,name,position,phone,email,preferred_channel,is_primary FROM public.crm_contacts WHERE account_id=${id} AND deleted_at IS NULL ORDER BY id`;
 const managements=await tx`SELECT id::text,opportunity_name,tipo,estado,assigned_user_email,deleted_at FROM public.leads WHERE account_id=${id} ORDER BY id`;
 return {found:true,business:rows[0],contacts,managements};
});}
export async function matches(c:Config,id:string){return read(c,async tx=>{
 const source=await tx`SELECT nombre,ciudad,telefono,whatsapp,email,sitio_web,perfil_instagram,url_gmap FROM public.crm_accounts WHERE id=${id}`;
 if(!source.length)return {found:false};
 const a=source[0];
 const rows=await tx.unsafe(`SELECT ${businessColumns} FROM public.crm_accounts WHERE id<>$1::bigint AND merged_into_id IS NULL AND (
  (lower(nombre)=lower($2) AND ciudad IS NOT DISTINCT FROM $3) OR
  (nullif(regexp_replace(telefono,'[^0-9]','','g'),'') IS NOT NULL AND right(regexp_replace(telefono,'[^0-9]','','g'),10)=right(regexp_replace($4,'[^0-9]','','g'),10)) OR
  (nullif(email,'') IS NOT NULL AND lower(email)=lower($5)) OR
  (nullif(sitio_web,'') IS NOT NULL AND sitio_web=$6) OR
  (nullif(perfil_instagram,'') IS NOT NULL AND perfil_instagram=$7) OR
  (nullif(url_gmap,'') IS NOT NULL AND url_gmap=$8)
 ) ORDER BY id LIMIT 101`,[id,a.nombre,a.ciudad,a.telefono??a.whatsapp??'',a.email??'',a.sitio_web??'',a.perfil_instagram??'',a.url_gmap??'']);
 return {found:true,candidates:rows.slice(0,100),truncated:rows.length>100,notice:'Coincidencias para revisión, no prueba de identidad. Teléfonos centrales, sitios municipales, cadenas y domicilios compartidos no justifican una fusión automática.'};
});}
export async function overview(c:Config){return read(c,async tx=>({
 counts:await tx`SELECT tipo,count(*)::int AS businesses,count(*) FILTER(WHERE archived_at IS NOT NULL)::int AS archived FROM public.crm_accounts WHERE merged_into_id IS NULL GROUP BY tipo ORDER BY tipo`,
 verticals:await tx`SELECT name,active FROM public.crm_verticals ORDER BY name`,
 subtypes:await tx`SELECT type_name,name,active FROM public.crm_subtypes ORDER BY type_name,name`
}));}
export async function history(c:Config,id:string,cursor:string,limit:number){return read(c,async tx=>{
 const rows=await tx`SELECT id::text,action,actor_name,metadata,created_at FROM public.crm_commercial_journal WHERE account_id=${id} AND id>${cursor} ORDER BY id LIMIT ${limit+1}`;
 const items=rows.slice(0,limit);return {events:items,nextCursor:rows.length>limit?items.at(-1)?.id:null,notice:'Este historial es el journal comercial del negocio; no implica entrega de mensajes ni incluye automáticamente todos los diarios de gestiones.'};
});}
