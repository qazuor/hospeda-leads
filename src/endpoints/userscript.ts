import {htmlToWhatsApp} from '../helpers/templateChannelFormatting';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {sql} from 'kysely';
import {db} from '../helpers/db';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {assertAccountViewable,assertBusinessAccess,assertLeadAccess,CrmForbidden} from '../helpers/crmPermissions';
import {CommunicationConflict,CommunicationForbidden,assertAccountContactAllowed,mutateCommunication} from '../helpers/communicationService';
import type {Message,PreparedMessage} from './communication.schema';
import {templateMaterialRefs} from '../helpers/templateMaterialService';
import {labelMaterialReferences} from '../helpers/templateMaterials';
import {SalesMaterialNotFound,listSalesMaterials} from '../helpers/salesMaterialService';
import {SALES_MATERIAL_FORMAT_LABELS,salesMaterialFormat} from '../helpers/salesMaterialTypes';
import {compareSemver,codeFromParam,parseUserscriptVersion,USERSCRIPT_MIN_VERSION} from '../helpers/userscriptPure';
import {hashUserscriptToken,createUserscriptToken} from '../helpers/userscriptTokens';
import {registerUserscriptBatch} from '../helpers/userscriptRegister';
import {normalizeField} from '../helpers/dataNormalization';
import {isTransientDbError} from '../helpers/crmErrors';
import {phoneSearchSql} from '../helpers/searchSql';
import {businessStatusLabels,type BusinessStatus} from '../helpers/businessStatus';
import {USERSCRIPT_VERSION} from '../../userscript/src/version';
import {parseCode} from '../../userscript/src/parse';
import {communicationMutation} from './communication.schema';
import {templateCompatibility,orderTemplatesBySpecificity} from '../helpers/messageTemplatePolicy';
import {unresolvedTemplateVariables} from '../helpers/renderMessageTemplate';
import {autoRegisterEligibility,voidAutoRegistration} from '../helpers/autoRegistration';
import type {User} from '../helpers/User';
import {allowBadgeRequest} from '../helpers/userscriptBadges';
import {stageLabel} from '../helpers/crmLabels';
import {allowInstagramThreadReport,canReportInstagramThread,deleteStaleInstagramThread,instagramAccountUsername,instagramContextMatches,instagramQueryUsername,instagramThreadFor,instagramThreadInput,instagramThreadStaleInput,saveInstagramThread} from '../helpers/userscriptInstagram';
import {instagramTemplates} from '../helpers/userscriptInstagramTemplates';
import {isInstagramAttempt} from '../helpers/instagramChat';
import {managementTypeLabels} from '../helpers/businessManagement';
const plain=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const failure=(e:unknown,status=400)=>e instanceof Error&&e.name==='NotAuthenticatedError'?plain({error:'Tu sesión venció. Volvé a ingresar.'},401):isTransientDbError(e)?plain({error:'Servicio ocupado, reintentá en unos segundos.'},503):plain({error:status<500&&e instanceof Error?e.message:'No se pudo completar la operación.'},status);
const registerSchema=z.object({accountId:z.string().regex(/^[1-9]\d*$/),chat:z.object({title:z.string().max(300),phone:z.string().max(40).nullish()}),messages:z.array(z.object({externalId:z.string().min(1).max(300),direction:z.enum(['in','out']),text:z.string().max(10000),sentAt:z.string().datetime().nullable(),author:z.string().max(200).nullable()})).min(1).max(50),automatic:z.boolean().optional()});
/** The version the script reports, kept per token so the CRM can show which devices run an outdated script. Null unless it is plain semver. */
const reportedVersion=(request:Request)=>parseUserscriptVersion(request.headers.get('X-Hospeda-Userscript-Version'));
async function bearer(request:Request){const raw=request.headers.get('Authorization')||'',match=/^Bearer (hcu_[\w-]+)$/.exec(raw);if(!match)return null;const hash=hashUserscriptToken(match[1]);const row=(await sql<{tokenId:string;id:number;email:string;displayName:string;fullName:string|null;avatarUrl:string|null;role:'admin'|'user'}>`SELECT t.id AS "tokenId",u.id,u.email,u.display_name AS "displayName",u.full_name AS "fullName",u.avatar_url AS "avatarUrl",u.role FROM crm_userscript_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=${hash} AND t.revoked_at IS NULL`.execute(db)).rows[0];if(row)await sql`UPDATE crm_userscript_tokens SET last_used_at=now(),last_version=coalesce(${reportedVersion(request)},last_version) WHERE id=${row.tokenId}::uuid`.execute(db);return row??null;}
export async function scriptAuth(request:Request){const user=await bearer(request);if(!user)return {response:plain({error:'Token inválido o revocado. Conectá uno nuevo desde Ajustes.'},401)};const version=reportedVersion(request);if(!version||compareSemver(version,USERSCRIPT_MIN_VERSION)<0)return {response:plain({error:'Actualizá el script desde el CRM.',minVersion:USERSCRIPT_MIN_VERSION},426)};return {user};}
export async function tokenList(request:Request){try{const {user}=await getServerUserSession(request);const [rows,pref]=await Promise.all([sql`SELECT id,label,created_at AS "createdAt",last_used_at AS "lastUsedAt",last_version AS "lastVersion",revoked_at AS "revokedAt" FROM crm_userscript_tokens WHERE user_id=${user.id} ORDER BY created_at DESC`.execute(db),sql<{enabled:boolean}>`SELECT userscript_auto_register AS enabled FROM users WHERE id=${user.id}`.execute(db)]);return plain({tokens:rows.rows,latestVersion:USERSCRIPT_VERSION,autoRegister:pref.rows[0]?.enabled??true});}catch(e){return failure(e,401);}}
export async function tokenCreate(request:Request){try{const {user}=await getServerUserSession(request);const b=z.object({label:z.string().trim().min(1).max(80)}).parse(await request.json());return await db.transaction().execute(async e=>{await sql`SELECT id FROM users WHERE id=${user.id} FOR UPDATE`.execute(e);const count=await sql<{n:string}>`SELECT count(*)::text n FROM crm_userscript_tokens WHERE user_id=${user.id} AND revoked_at IS NULL`.execute(e);if(Number(count.rows[0]?.n)>=5)return plain({error:'Ya tenés cinco tokens activos. Revocá uno para crear otro.'},400);const token=createUserscriptToken(),id=randomUUID();await sql`INSERT INTO crm_userscript_tokens(id,user_id,token_hash,label) VALUES(${id}::uuid,${user.id},${hashUserscriptToken(token)},${b.label})`.execute(e);return plain({id,token});});}catch(e){return failure(e);}}
export async function tokenRevoke(request:Request){try{const {user}=await getServerUserSession(request);const b=z.object({id:z.string().uuid()}).parse(await request.json());const changed=await sql`UPDATE crm_userscript_tokens SET revoked_at=now() WHERE id=${b.id}::uuid AND user_id=${user.id} AND revoked_at IS NULL RETURNING id`.execute(db);return changed.rows.length?plain({ok:true}):plain({error:'No se encontró un token activo propio.'},404);}catch(e){return failure(e);}}
/** WhatsApps this user opened from "Contactar" to the chat's phone in the last week and has not confirmed yet; the preview warns that a send completes them. */
async function openWhatsappAttempts(accountId:string,phone:string,user:{email:string;role:string}){
 const recipient=phoneSearchSql('m.recipient',phone);if(!recipient)return [];
 const rows=await sql<{openedAt:Date;body:string|null}>`SELECT m.created_at AS "openedAt",m.body FROM crm_messages m WHERE m.account_id=${accountId}::bigint AND m.channel='whatsapp' AND m.status='whatsapp_opened' AND (${user.role==='admin'} OR m.owner_email=${user.email}) AND ${recipient} AND m.created_at>now()-interval '7 days' ORDER BY m.created_at LIMIT 5`.execute(db);
 return rows.rows.map(row=>({openedAt:new Date(row.openedAt).toISOString(),body:row.body}));
}
/** Who the token belongs to and which script versions the CRM requires and publishes: the panel needs it before any chat is open. */
export async function status(request:Request){try{const auth=await scriptAuth(request);if(auth.response)return auth.response;const pref=await sql<{enabled:boolean}>`SELECT userscript_auto_register AS enabled FROM users WHERE id=${auth.user.id}`.execute(db);return plain({minVersion:USERSCRIPT_MIN_VERSION,latestVersion:USERSCRIPT_VERSION,user:{email:auth.user.email,displayName:auth.user.displayName},autoRegister:pref.rows[0]?.enabled??true,instagramAccount:instagramAccountUsername()});}catch(e){return failure(e,500);}}
export async function context(request:Request){try{const auth=await scriptAuth(request);if(auth.response)return auth.response;const url=new URL(request.url),code=url.searchParams.get('code'),phone=url.searchParams.get('phone'),instagram=url.searchParams.get('instagram');if(instagram!==null&&code===null&&phone===null)return await instagramContext(request,instagram,auth.user);if(code===null&&phone===null)return plain({error:'Indicá un código o un teléfono.'},400);const codeId=code===null?null:codeFromParam(code);if(code!==null&&!codeId)return plain({error:'Código inválido.'},400);const normalized=phone===null?null:normalizeField('telefono',phone);if(phone!==null&&normalized?.validity!=='valid')return plain({error:'Teléfono inválido.'},400);const matches=[];let hiddenMatches=0;if(code!==null){const rows=await sql<any>`SELECT a.id,a.nombre,a.ciudad,a.status,a.assigned_user_email,a.do_not_contact,a.archived_at,u.display_name AS owner_name FROM crm_accounts a LEFT JOIN users u ON u.email=a.assigned_user_email WHERE a.id=${codeId}::bigint AND a.deleted_at IS NULL AND a.merged_into_id IS NULL`.execute(db);for(const a of rows.rows){try{await assertBusinessAccess(db,String(a.id),auth.user,false,false);}catch{hiddenMatches++;continue;}matches.push(a);}}else{const condition=(col:string)=>phoneSearchSql(col,phone!);const accountPhone=condition('a.telefono')!,whats=condition('a.whatsapp')!,contactPhone=condition('c.phone')!;const rows=await sql<any>`SELECT DISTINCT a.id,a.nombre,a.ciudad,a.status,a.assigned_user_email,a.do_not_contact,a.archived_at,u.display_name AS owner_name FROM crm_accounts a LEFT JOIN users u ON u.email=a.assigned_user_email LEFT JOIN crm_contacts c ON c.account_id=a.id AND c.deleted_at IS NULL WHERE a.deleted_at IS NULL AND a.merged_into_id IS NULL AND (${accountPhone} OR ${whats} OR ${contactPhone}) AND (a.archived_at IS NULL OR ${auth.user.role==='admin'} OR a.assigned_user_email=${auth.user.email}) ORDER BY a.nombre LIMIT 10`.execute(db);matches.push(...rows.rows);
 // An archived business of another seller stays private, but the seller must know the number is taken before writing to it.
 if(auth.user.role!=='admin')hiddenMatches+=Number((await sql<{n:string}>`SELECT count(DISTINCT a.id)::text AS n FROM crm_accounts a LEFT JOIN crm_contacts c ON c.account_id=a.id AND c.deleted_at IS NULL WHERE a.deleted_at IS NULL AND a.merged_into_id IS NULL AND (${accountPhone} OR ${whats} OR ${contactPhone}) AND a.archived_at IS NOT NULL AND a.assigned_user_email IS DISTINCT FROM ${auth.user.email}`.execute(db)).rows[0]?.n??0);}const enriched=[];for(const a of matches){const leads=await sql`SELECT l.id::text AS id,l.nombre AS name,l.estado AS stage FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=${a.id} AND l.deleted_at IS NULL AND s.classification='open' ORDER BY l.id LIMIT 10`.execute(db);const restriction=await sql`SELECT 1 FROM crm_contact_restrictions WHERE account_id=${a.id} AND lifted_at IS NULL AND channel IN ('whatsapp','all') AND contact_id IS NULL AND lead_id IS NULL LIMIT 1`.execute(db);const openWhatsapp=normalized?await openWhatsappAttempts(String(a.id),phone!,auth.user):[];enriched.push({accountId:String(a.id),code:'H'+a.id,openWhatsapp,name:a.nombre,city:a.ciudad,status:a.status??null,statusLabel:a.status?businessStatusLabels[a.status as BusinessStatus]??null:null,assignedUserName:a.owner_name,doNotContact:a.do_not_contact,restrictionActive:!!restriction.rows.length,archived:!!a.archived_at,leads:leads.rows,url:`${new URL(request.url).origin}/accounts/${a.id}`,autoRegister:await autoRegisterEligibility(db,String(a.id),auth.user)});}return plain({minVersion:USERSCRIPT_MIN_VERSION,latestVersion:USERSCRIPT_VERSION,user:{email:auth.user.email,displayName:auth.user.displayName},autoRegister:(await sql<{enabled:boolean}>`SELECT userscript_auto_register AS enabled FROM users WHERE id=${auth.user.id}`.execute(db)).rows[0]?.enabled??true,hiddenMatches,matches:enriched});}catch(e){return failure(e,500);}}
/**
 * Spec 97 §5.2: `context?instagram=<username>`. Same envelope as the code/phone lookup, plus the Hospeda account and the stored thread of that
 * username for it. Matching is the webhook's rule (normalized `perfil_instagram`); hidden businesses only count.
 */
async function instagramContext(request:Request,raw:string,user:User&{tokenId:string}){
 const username=instagramQueryUsername(raw);if(!username)return plain({error:'Usuario de Instagram inválido.'},400);
 const viewer=instagramAccountUsername(),{matches,hiddenMatches}=await instagramContextMatches(db,{username,user,origin:new URL(request.url).origin});
 const autoRegister=(await sql<{enabled:boolean}>`SELECT userscript_auto_register AS enabled FROM users WHERE id=${user.id}`.execute(db)).rows[0]?.enabled??true;
 return plain({minVersion:USERSCRIPT_MIN_VERSION,latestVersion:USERSCRIPT_VERSION,user:{email:user.email,displayName:user.displayName},autoRegister,instagramAccount:viewer,hiddenMatches,matches,instagram:{username,threadId:matches.length?await instagramThreadFor(db,{viewer,username}):null}});// L2: a thread only for a business this user can see
}
const badgeChatsSchema=z.object({chats:z.array(z.object({key:z.string().min(1).max(100),title:z.string().max(200),phone:z.string().max(40).optional()}).strict()).max(50)});
const safeBadgeCodeId=(title:string):string|null=>{const code=parseCode(title),raw=code?codeFromParam(code):null;if(!raw)return null;try{const value=BigInt(raw);return value>0n&&value<=9223372036854775807n?String(value):null;}catch{return null;}};
/** Read-only batch lookup used by the WhatsApp chat list. */
export async function badges(request:Request){try{
 const auth=await scriptAuth(request);if(auth.response)return auth.response;
 if(!allowBadgeRequest(auth.user.tokenId))return plain({error:'Demasiadas consultas. Esperá un minuto.'},429);
 const body=badgeChatsSchema.safeParse(await request.json());if(!body.success)return plain({error:'Datos inválidos.'},400);
 const chats=body.data.chats,phoneKeys=[...new Set(chats.flatMap(chat=>{const p=chat.phone?normalizeField('telefono',chat.phone):null;return p?.validity==='valid'?[p.normalized!]:[]}))],codeIds=[...new Set(chats.flatMap(chat=>{const id=safeBadgeCodeId(chat.title);return id?[id]:[]}))];
 const phoneBranches=phoneKeys.map(phone=>sql`(SELECT DISTINCT a.id,${phone}::text AS phone FROM crm_accounts a LEFT JOIN crm_contacts c ON c.account_id=a.id AND c.deleted_at IS NULL WHERE a.deleted_at IS NULL AND a.merged_into_id IS NULL AND (${sql.join(['a.telefono','a.whatsapp','c.phone'].map(col=>phoneSearchSql(col,phone)).filter((v):v is NonNullable<typeof v>=>!!v),sql` OR `)}) ORDER BY a.id LIMIT 10)`);
 const phoneCte=phoneBranches.length?sql`phone_matches AS (${sql.join(phoneBranches,sql` UNION ALL `)})`:sql`phone_matches AS (SELECT NULL::bigint AS id,NULL::text AS phone WHERE false)`;
 const codeMatch=codeIds.length?sql`CASE WHEN a.id=ANY(${codeIds}::bigint[]) THEN a.id::text END`:sql`NULL::text`;
 const rows=await sql<{id:string;name:string;city:string|null;status:string|null;doNotContact:boolean;assignedUserEmail:string|null;archivedAt:Date|null;ownerName:string|null;matchedPhones:string[];matchedCode:string|null}>`WITH ${phoneCte}, candidates AS (SELECT DISTINCT a.id,a.nombre,a.ciudad,a.status,a.do_not_contact,a.assigned_user_email,a.archived_at,u.display_name AS owner_name FROM crm_accounts a LEFT JOIN users u ON u.email=a.assigned_user_email WHERE a.deleted_at IS NULL AND a.merged_into_id IS NULL AND (a.id=ANY(${codeIds}::bigint[]) OR a.id IN (SELECT id FROM phone_matches)) ORDER BY a.id LIMIT 500) SELECT a.id::text AS id,a.nombre AS name,a.ciudad AS city,a.status,a.do_not_contact AS "doNotContact",a.assigned_user_email AS "assignedUserEmail",a.archived_at AS "archivedAt",a.owner_name AS "ownerName",coalesce(array_agg(DISTINCT pm.phone) FILTER(WHERE pm.phone IS NOT NULL),ARRAY[]::text[]) AS "matchedPhones",${codeMatch} AS "matchedCode" FROM candidates a LEFT JOIN phone_matches pm ON pm.id=a.id GROUP BY a.id,a.nombre,a.ciudad,a.status,a.do_not_contact,a.assigned_user_email,a.archived_at,a.owner_name ORDER BY a.nombre`.execute(db);
 const accessible=rows.rows.filter(row=>{try{assertAccountViewable(auth.user,{assignedUserEmail:row.assignedUserEmail,archivedAt:row.archivedAt,deletedAt:null,mergedIntoId:null});return true;}catch{return false;}});
 const ids=accessible.map(row=>row.id);
 const [leads,restrictions,last]=ids.length?await Promise.all([
  sql<{accountId:string;stage:string;type:string|null}>`SELECT l.account_id::text AS "accountId",l.estado AS stage,l.management_type AS type FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=ANY(${ids}::bigint[]) AND l.deleted_at IS NULL AND s.classification='open' ORDER BY l.id`.execute(db),
  sql<{accountId:string}>`SELECT DISTINCT account_id::text AS "accountId" FROM crm_contact_restrictions WHERE account_id=ANY(${ids}::bigint[]) AND lifted_at IS NULL AND channel IN ('whatsapp','all') AND contact_id IS NULL AND lead_id IS NULL`.execute(db),
  sql<{accountId:string;at:Date;automatic:boolean}>`WITH wanted AS (SELECT unnest(${ids}::bigint[]) AS account_id), whatsapp_events AS (
    SELECT m.account_id,m.last_interaction_at AS at,m.id AS message_id FROM crm_messages m JOIN wanted w ON w.account_id=m.account_id WHERE m.channel='whatsapp' AND m.status IN ('manual_sent','accepted','delivery_confirmed','replied') AND m.last_interaction_at IS NOT NULL
    UNION ALL SELECT i.account_id,i.received_at,i.id FROM crm_inbound_messages i JOIN wanted w ON w.account_id=i.account_id WHERE i.channel='whatsapp' AND i.status IN ('pending_review','registered')
   ), latest AS (SELECT DISTINCT ON (account_id) account_id,at,message_id FROM whatsapp_events ORDER BY account_id,at DESC)
   SELECT l.account_id::text AS "accountId",l.at,EXISTS(SELECT 1 FROM crm_auto_registrations r WHERE r.voided_at IS NULL AND r.account_id=l.account_id AND (r.message_id=l.message_id OR r.inbound_id=l.message_id)) AS automatic FROM latest l`.execute(db)
 ]):[null,null,null];
 const results=chats.map(chat=>{
  const code=safeBadgeCodeId(chat.title),phone=chat.phone?normalizeField('telefono',chat.phone):null;
  let matches=accessible.filter(row=>code?row.matchedCode===code:phone?.validity==='valid'&&row.matchedPhones.includes(phone.normalized!));
  if(!code&&phone?.validity==='valid')matches=matches.slice(0,10);
  if(!matches.length){const raw=rows.rows.some(row=>code?row.matchedCode===code:phone?.validity==='valid'&&row.matchedPhones.includes(phone.normalized!));return {key:chat.key,kind:raw?'hidden':'none'};}
  if(matches.length>1)return {key:chat.key,kind:'multiple',businesses:matches.map(row=>({accountId:row.id,code:`H${row.id}`,name:row.name,statusLabel:row.status?businessStatusLabels[row.status as BusinessStatus]??null:null}))};
  const row=matches[0]!,lead=leads?.rows.find(item=>item.accountId===row.id),restriction=restrictions?.rows.some(item=>item.accountId===row.id)??false,latest=last?.rows.find(item=>item.accountId===row.id);
  return {key:chat.key,kind:'single',accountId:row.id,code:`H${row.id}`,name:row.name,city:row.city,statusLabel:row.status?businessStatusLabels[row.status as BusinessStatus]??null:null,assignedUserName:row.ownerName,doNotContact:row.doNotContact,restricted:restriction,openManagement:lead?{stageLabel:stageLabel(lead.stage),typeLabel:lead.type?managementTypeLabels[lead.type as keyof typeof managementTypeLabels]??lead.type:null}:null,lastWhatsappAt:latest?.at?.toISOString()??null,lastWhatsappAutomatic:latest?.automatic??false};
 });
 return plain({results});
 }catch(e){return failure(e,400);}}
export async function register(request:Request){try{const auth=await scriptAuth(request);if(auth.response)return auth.response;const raw=await request.text();if(Buffer.byteLength(raw)>65536)return plain({error:'El lote supera el tamaño permitido.'},413);let value:unknown;try{value=JSON.parse(raw);}catch{return plain({error:'Datos inválidos.'},400);}const parsed=registerSchema.safeParse(value);if(!parsed.success)return plain({error:'Datos inválidos.'},400);const results=await db.transaction().execute(e=>registerUserscriptBatch(e,parsed.data,auth.user));return plain({results});}catch(e){if(e instanceof Error&&e.name==='AutoRegisterConflict')return plain({error:e.message,reason:(e as Error&{reason?:string}).reason??'not_eligible'},409);if(e instanceof CrmForbidden||e instanceof CommunicationForbidden)return failure(e,403);return failure(e,500);}}

export async function preferences(request:Request){try{
 let user:User;
 const hasBearer=request.headers.get('Authorization')?.startsWith('Bearer ');
 if(hasBearer){const auth=await scriptAuth(request);if(auth.response)return auth.response;user=auth.user;}else user=(await getServerUserSession(request)).user;
 const body=z.object({autoRegister:z.boolean()}).parse(await request.json());
 await sql`UPDATE users SET userscript_auto_register=${body.autoRegister},userscript_auto_register_since=CASE WHEN ${body.autoRegister} AND NOT userscript_auto_register THEN now() ELSE userscript_auto_register_since END,updated_at=now() WHERE id=${user.id}`.execute(db);
 return plain({autoRegister:body.autoRegister});
 }catch(e){return failure(e,401);}}

export async function autoRegistrations(request:Request){try{const auth=await scriptAuth(request);if(auth.response)return auth.response;const accountId=z.string().regex(/^[1-9]\d*$/).parse(new URL(request.url).searchParams.get('accountId'));await assertBusinessAccess(db,accountId,auth.user,false,false);const rows=await sql`SELECT r.id::text AS id,r.direction,left(COALESCE(i.text_body,m.text_body,m.body,''),140) AS excerpt,CASE WHEN r.direction='out' THEN m.created_at END AS "sentAt",CASE WHEN r.direction='in' THEN i.received_at END AS "receivedAt",COALESCE(i.status,m.status) AS status FROM crm_auto_registrations r LEFT JOIN crm_inbound_messages i ON i.id=r.inbound_id LEFT JOIN crm_messages m ON m.id=r.message_id WHERE r.account_id=${accountId}::bigint AND r.created_at>now()-interval '7 days' AND r.voided_at IS NULL AND (${auth.user.role==='admin'} OR r.user_email=${auth.user.email}) ORDER BY r.created_at DESC`.execute(db);return plain({registrations:rows.rows});}catch(e){return failure(e,400);}}
export async function voidRegistration(request:Request){try{const auth=await scriptAuth(request);if(auth.response)return auth.response;const b=z.object({id:z.string().uuid(),reason:z.string().trim().min(3).max(500)}).parse(await request.json());return plain(await voidAutoRegistration(db,b,auth.user));}catch(e){if(e instanceof CommunicationForbidden||e instanceof CrmForbidden)return failure(e,403);if(e instanceof CommunicationConflict)return failure(e,409);return failure(e,400);}}

const scriptId=z.string().regex(/^[1-9]\d*$/),templateInput=z.object({id:z.string().uuid(),leadId:scriptId,contactId:scriptId.nullable(),templateId:scriptId,channel:z.literal('whatsapp').optional()});
/** `channel` of the script's template endpoints: WhatsApp unless the Instagram panel asks (spec 97 §5.2). Older scripts never send it. */
export const scriptChannelParam=z.enum(['whatsapp','instagram']).default('whatsapp');
/**
 * Spec 97 §5.2: an Instagram draft from the panel. Always to the business username (no person). With a management it is `prepare`; without one
 * (decision 12.6) it is `prepare_general` with the purpose, and «Otro» needs its aclaración.
 */
export const instagramPrepareInput=z.object({id:z.string().uuid(),channel:z.literal('instagram'),accountId:scriptId,leadId:scriptId.nullable(),contactId:z.null().optional(),templateId:scriptId,purpose:z.enum(['verification','first_contact','resume','relationship','care','operations','other']).nullable().optional(),otherPurpose:z.string().trim().max(300).nullable().optional()}).strict().superRefine((value,ctx)=>{
 if(value.leadId&&value.purpose)ctx.addIssue({code:'custom',message:'Una gestión abierta ya aporta el contexto del contacto.'});
 if(!value.leadId&&!value.purpose)ctx.addIssue({code:'custom',message:'Elegí el propósito del contacto general.'});
 if(value.purpose==='other'&&!value.otherPurpose?.trim())ctx.addIssue({code:'custom',message:'Aclaración obligatoria para Otro propósito.'});
});
/** The communication mutation an Instagram panel draft becomes. */
export function instagramPrepareMutation(value:z.infer<typeof instagramPrepareInput>){
 return value.leadId?communicationMutation.parse({action:'prepare',id:value.id,leadId:value.leadId,contactId:null,channel:'instagram',templateId:value.templateId}):communicationMutation.parse({action:'prepare_general',id:value.id,accountId:value.accountId,leadId:null,contactId:null,channel:'instagram',purpose:value.purpose,otherPurpose:value.purpose==='other'?value.otherPurpose??null:null,templateId:value.templateId});
}
/** L1: a management draft must belong to the business the panel shows; the service only checks the lead. */
async function instagramPrepareFor(value:z.infer<typeof instagramPrepareInput>){
 if(value.leadId){const lead=await db.selectFrom('leads').select('accountId').where('id','=',value.leadId).executeTakeFirst();if(!lead||String(lead.accountId)!==value.accountId)throw new CommunicationForbidden('La gestión no es de este negocio.');}
 return instagramPrepareMutation(value);
}
const communicationError=(e:unknown)=>e instanceof CrmForbidden||e instanceof CommunicationForbidden?403:e instanceof CommunicationConflict?409:400;
/**
 * What the script may prepare for a business: the open managements the token's user can modify and why WhatsApp is blocked (Nuevo, No contactar,
 * no editable management, restriction). Null when the business does not exist or the user cannot see it (both answered as «nothing to show»).
 */
async function scriptWhatsappScope(accountId:string,user:User){
 const candidate=await db.selectFrom('crmAccounts').select('id').where('id','=',accountId).executeTakeFirst();if(!candidate)return null;
 let account;try{account=await assertBusinessAccess(db,accountId,user,false,false);}catch{return null;}
 const rows=await sql<{id:string;nombre:string;estado:string;managementType:string|null;tipo:string|null;commercialProfile:string|null;primaryContactId:string|null}>`SELECT l.id::text,l.nombre,l.estado,l.management_type AS "managementType",l.tipo,l.commercial_profile AS "commercialProfile",l.primary_contact_id::text AS "primaryContactId" FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=${accountId}::bigint AND l.deleted_at IS NULL AND s.classification='open' ORDER BY l.id`.execute(db);const canEdit=[];for(const lead of rows.rows){try{await assertLeadAccess(db,String(lead.id),user,true);canEdit.push(lead);}catch{}}
 let blocked:string|null=account.status==='new'?'En estado Nuevo solo se permite el contacto general de verificación.':account.doNotContact?'El negocio tiene No contactar activo.':!canEdit.length?'No hay gestiones abiertas que puedas modificar.':null;
 if(!blocked&&canEdit.length){try{await assertAccountContactAllowed(db,accountId,String(canEdit[0]!.id),null,'whatsapp');}catch(e){blocked=e instanceof Error?e.message:'Hay una restricción activa para WhatsApp.';}}
 return {account,canEdit,blocked};
}
export async function templates(request:Request){try{const auth=await scriptAuth(request);if(auth.response)return auth.response;const params=new URL(request.url).searchParams,accountId=params.get('accountId'),channel=scriptChannelParam.safeParse(params.get('channel')??undefined);if(!accountId||!scriptId.safeParse(accountId).success)return plain({error:'Indicá un negocio válido.'},400);if(!channel.success)return plain({error:'Canal inválido.'},400);if(channel.data==='instagram')return plain(await instagramTemplates(accountId,auth.user)??{leads:[],general:null,blocked:null,username:null});const scope=await scriptWhatsappScope(accountId,auth.user);if(!scope)return plain({leads:[],blocked:null});const {account,canEdit}=scope;let blocked=scope.blocked;
 const result=[],contacts=await db.selectFrom('crmContacts').select(['id','name','phone','isPrimary']).where('accountId','=',accountId).where('deletedAt','is',null).orderBy('id').execute(),whatsappTemplates=await db.selectFrom('messageTemplates').select(['id','name','body','channel','vertical','commercialProfile','managementType','purpose']).where('active','=',true).where('channel','=','whatsapp').execute();const materialTitles=Object.fromEntries(Object.values(await templateMaterialRefs(db,{templates:whatsappTemplates.map(t=>({id:String(t.id),body:t.body}))})).flat().map(r=>[r.materialId,r.title]));for(const lead of canEdit){const eligible=[];for(const c of contacts){if(!c.phone)continue;try{await assertAccountContactAllowed(db,accountId,String(lead.id),String(c.id),'whatsapp');eligible.push(c);}catch{}}const preference=eligible.find(c=>String(c.id)===String(lead.primaryContactId))||(eligible.length===1?eligible[0]:eligible.find(c=>c.isPrimary));const sorted=orderTemplatesBySpecificity(whatsappTemplates.filter(t=>!templateCompatibility(t,{channel:'whatsapp',vertical:lead.tipo,commercialProfile:lead.commercialProfile,managementType:lead.managementType,purpose:null})));result.push({id:String(lead.id),name:lead.nombre,type:lead.managementType,stage:lead.estado,templates:sorted.map((t,i)=>({id:String(t.id),name:t.name,recommended:i===0,body:labelMaterialReferences({text:htmlToWhatsApp(t.body).normalize('NFC'),titles:materialTitles,html:false})})),contacts:eligible.map(c=>({id:String(c.id),name:c.name,phone:c.phone!,default:preference?.id===c.id}))});}
 if(!blocked&&!result.some(lead=>lead.contacts.length||!!account.telefono))blocked='No hay un teléfono disponible para preparar el mensaje.';
 return plain({leads:result,blocked});}catch(e){if(e instanceof CrmForbidden)return failure(e,403);return failure(e,400);}}
export async function prepare(request:Request){try{const auth=await scriptAuth(request);if(auth.response)return auth.response;const raw=await request.json() as {channel?:unknown};const input=raw?.channel==='instagram'?await instagramPrepareFor(instagramPrepareInput.parse(raw)):communicationMutation.parse({action:'prepare',...templateInput.parse(raw),channel:'whatsapp'});const m=await mutateCommunication(db,input,auth.user) as PreparedMessage;return plain({messageId:m.id,revision:m.revision,body:m.body,recipient:m.recipient,recipientName:m.recipientName,unresolved:unresolvedTemplateVariables(m.body),materialWarnings:(m.materialWarnings??[]).map(w=>w.message)});}catch(e){if(e instanceof CrmForbidden||e instanceof CommunicationForbidden||e instanceof CommunicationConflict)return failure(e,communicationError(e));return failure(e);}}
/**
 * The script token only handles WhatsApp and, since spec 97, Instagram attempts prepared from the composer (never «Red social» logs or Hospeda's
 * echoes): dispatching an email draft would send it through Brevo. Access is checked by the service.
 */
async function scriptChannel(id:string){const row=(await sql<{status:string;channel:string;ownerEmail:string|null;destinationDetail:string|null}>`SELECT status,channel,owner_email AS "ownerEmail",destination_detail AS "destinationDetail" FROM crm_messages WHERE id=${id}::uuid AND channel IN ('whatsapp','social')`.execute(db)).rows[0];if(!row||(row.channel==='social'&&!isInstagramAttempt(row)))return null;return {status:row.status,channel:row.channel==='whatsapp'?'whatsapp' as const:'instagram' as const};}
/** WhatsApp only (sales material stays out of Instagram, decision 12.5). */
async function scriptWhatsapp(id:string){const row=await scriptChannel(id);return row?.channel==='whatsapp'?row:null;}
export async function dispatch(request:Request){try{const auth=await scriptAuth(request);if(auth.response)return auth.response;const b=z.object({id:z.string().uuid(),revision:z.number().int()}).parse(await request.json());if(!await scriptChannel(b.id))return plain({error:'Solo se pueden preparar WhatsApp o Instagram desde el script.'},400);const value=await mutateCommunication(db,communicationMutation.parse({action:'dispatch',...b,confirm:true}),auth.user) as {message:Message;alreadyConfirmed?:boolean};return plain({messageId:value.message.id,status:value.message.status,...(value.alreadyConfirmed?{alreadyConfirmed:true}:{})});}catch(e){if(e instanceof CrmForbidden||e instanceof CommunicationForbidden||e instanceof CommunicationConflict)return failure(e,communicationError(e));return failure(e);}}
export async function outcome(request:Request){try{const auth=await scriptAuth(request);if(auth.response)return auth.response;const b=z.object({id:z.string().uuid(),event:z.literal('manual_not_sent')}).parse(await request.json());const current=await scriptChannel(b.id);if(!current)return plain({error:'Solo se pueden preparar WhatsApp o Instagram desde el script.'},400);if(current.status!==(current.channel==='instagram'?'instagram_opened':'whatsapp_opened'))return plain({error:'Este intento ya fue resuelto.'},409);const result=await mutateCommunication(db,communicationMutation.parse({action:'outcome',...b,notes:''}),auth.user);return plain(result);}catch(e){if(e instanceof CrmForbidden||e instanceof CommunicationForbidden||e instanceof CommunicationConflict)return failure(e,communicationError(e));return failure(e);}}
/** Search of the panel's «Agregar material»: title or description, accent-insensitive on the server (the list is capped, so the panel never filters locally). */
const materialSearch=z.string().trim().max(200);
/**
 * Active deliverable sales material for the panel's «Agregar material» (spec 89 §9): id, title, categories and format, only when WhatsApp is not
 * blocked for the business (same rules as `templates`). Read-only; the link is created by `material_add`.
 */
export async function materials(request:Request){try{const auth=await scriptAuth(request);if(auth.response)return auth.response;const accountId=new URL(request.url).searchParams.get('accountId');if(!accountId||!scriptId.safeParse(accountId).success)return plain({error:'Indicá un negocio válido.'},400);
 const scope=await scriptWhatsappScope(accountId,auth.user);if(!scope)return plain({materials:[],blocked:null});if(scope.blocked)return plain({materials:[],blocked:scope.blocked});
 const search=materialSearch.safeParse(new URL(request.url).searchParams.get('search')??'');if(!search.success)return plain({error:'La búsqueda es demasiado larga.'},400);
 const list=await listSalesMaterials(db,{user:auth.user,query:{search:search.data,kind:'deliverable',includeArchived:'0'}});
 return plain({blocked:null,truncated:list.truncated,materials:list.materials.filter(m=>m.kind==='deliverable'&&m.status==='active'&&m.currentVersion).map(m=>{const format=salesMaterialFormat({mimeType:m.currentVersion!.url?null:m.currentVersion!.mimeType});return {id:m.id,title:m.title,categories:m.categories.filter(c=>c.active).map(c=>c.name),format,formatLabel:SALES_MATERIAL_FORMAT_LABELS[format]};})});
}catch(e){if(e instanceof CrmForbidden)return failure(e,403);return failure(e,400);}}
const materialAddInput=z.object({messageId:z.string().uuid(),revision:z.number().int(),materialId:z.string().uuid()});
/** Adds one material to a WhatsApp draft prepared by the script, as `material_add` with the token's user (permissions and No contactar on the server). */
export async function materialAdd(request:Request){try{const auth=await scriptAuth(request);if(auth.response)return auth.response;const b=materialAddInput.parse(await request.json());if(!await scriptWhatsapp(b.messageId))return plain({error:'Solo se pueden preparar WhatsApp desde el script.'},400);
 const value=await mutateCommunication(db,communicationMutation.parse({action:'material_add',id:b.messageId,revision:b.revision,materialId:b.materialId,attach:false}),auth.user) as {message:Message};
 return plain({revision:value.message.revision,body:value.message.body});
}catch(e){if(e instanceof CrmForbidden||e instanceof CommunicationForbidden||e instanceof CommunicationConflict)return failure(e,communicationError(e));if(e instanceof SalesMaterialNotFound)return failure(e,404);return failure(e);}}
/**
 * Spec 97 §4.4 / §5.2: the user script reports where the chat of a CRM business's Instagram lives for the Hospeda account. Requires a visible
 * business with that username that the user can contact (else 404, never says whether it exists); «No contactar» does not block it (not contact).
 */
export async function instagramThread(request:Request){try{
 const auth=await scriptAuth(request);if(auth.response)return auth.response;
 const body=instagramThreadInput.safeParse(await request.json().catch(()=>null));if(!body.success)return plain({error:'Datos inválidos.'},400);
 const viewer=instagramAccountUsername();if(!viewer)return plain({error:'Falta configurar la cuenta de Instagram de Hospeda en el CRM.'},409);
 if(!allowInstagramThreadReport(auth.user.tokenId))return plain({error:'Demasiadas consultas. Esperá un minuto.'},429);
 if(!await canReportInstagramThread(db,{username:body.data.username,user:auth.user}))return plain({error:'No encontré un negocio con ese Instagram.'},404);
 await saveInstagramThread(db,{viewer,...body.data,userId:auth.user.id});return plain({threadId:body.data.threadId});
}catch(e){return failure(e,500);}}
/** D2: a header proof contradicted a stored thread; deletes it only while it still holds that id (compare-and-delete). Same permission as the report. */
export async function instagramThreadStale(request:Request){try{
 const auth=await scriptAuth(request);if(auth.response)return auth.response;
 const body=instagramThreadStaleInput.safeParse(await request.json().catch(()=>null));if(!body.success)return plain({error:'Datos inválidos.'},400);
 const viewer=instagramAccountUsername();if(!viewer)return plain({error:'Falta configurar la cuenta de Instagram de Hospeda en el CRM.'},409);
 if(!allowInstagramThreadReport(auth.user.tokenId))return plain({error:'Demasiadas consultas. Esperá un minuto.'},429);
 if(!await canReportInstagramThread(db,{username:body.data.username,user:auth.user}))return plain({error:'No encontré un negocio con ese Instagram.'},404);
 return plain({deleted:await deleteStaleInstagramThread(db,{viewer,...body.data})});
}catch(e){return failure(e,500);}}
