import {searchSql} from '../helpers/searchSql';
import {CrmForbidden,assertBusinessAccess,assertLeadAccess} from '../helpers/crmPermissions';
import {sql} from 'kysely';import superjson from 'superjson';import {z} from 'zod';
import {db} from '../helpers/db';import {getServerUserSession} from '../helpers/getServerUserSession';import {NotAuthenticatedError} from '../helpers/getSetServerSession';
import {CommunicationForbidden,CommunicationConflict,communicationConfig} from '../helpers/communicationService';import {documentFor,mutateResource} from '../helpers/resourceService';import {resourceMutation,type ResourceDocument,type ResourceVersion,type ResourceLink} from './resources.schema';
const response=(v:unknown,status=200)=>new Response(superjson.stringify(v),{status,headers:{'Content-Type':'application/json'}});
const failure=(e:unknown)=>response({error:e instanceof Error?e.message:'Error'},e instanceof NotAuthenticatedError?401:e instanceof CommunicationForbidden||e instanceof CrmForbidden?403:e instanceof CommunicationConflict?409:400);
export async function get(request:Request){try{
 const {user}=await getServerUserSession(request);
 const params=new URL(request.url).searchParams;
 const accountId=params.get('accountId'),leadId=params.get('leadId');
 if(accountId){z.string().regex(/^[1-9]\d*$/).parse(accountId);await assertBusinessAccess(db,accountId,user);}
 if(leadId){
  z.string().regex(/^[1-9]\d*$/).parse(leadId);
  if(!accountId)throw new Error('Seleccioná negocio');
  const lead=await assertLeadAccess(db,leadId,user);
  if(String(lead.accountId)!==accountId)throw new Error('La gestión no corresponde al negocio');
 }
 const search=z.string().max(200).parse(params.get('search')??'');
 const rows=(await sql<ResourceDocument>`
  SELECT d.* FROM crm_documents d WHERE d.deleted_at IS NULL
  AND (${accountId}::bigint IS NULL AND d.library OR d.account_id=${accountId}::bigint
   OR EXISTS(SELECT 1 FROM crm_document_links l WHERE l.document_id=d.id AND l.account_id=${accountId}::bigint
    AND (${user.role==='admin'} OR l.lead_id IS NULL OR EXISTS(SELECT 1 FROM leads cl WHERE cl.id=l.lead_id AND cl.deleted_at IS NULL))))
  AND (${leadId}::bigint IS NULL OR d.lead_id=${leadId}::bigint
   OR EXISTS(SELECT 1 FROM crm_document_links l WHERE l.document_id=d.id AND l.account_id=${accountId}::bigint AND l.lead_id=${leadId}::bigint))
  AND ${searchSql("d.title",search)} ORDER BY d.updated_at DESC LIMIT 200
 `.execute(db)).rows;
 const documents:ResourceDocument[]=[];
 for(const d of rows){try{
  await documentFor(db,d.id,user);
  const [versionsResult,linksResult]=await Promise.all([
   sql<ResourceVersion>`SELECT id,document_id,version,url,file_name,mime_type,byte_size,expires_on,actor_email,created_at
    FROM crm_document_versions WHERE document_id=${d.id}::uuid
    AND (${user.role==='admin'||d.ownerEmail===user.email||!d.library||d.status!=='approved'} OR approved_at IS NOT NULL)
    ORDER BY version DESC`.execute(db),
   accountId?sql<ResourceLink>`SELECT l.lead_id,l.activity_id,ld.opportunity_name AS lead_name,a.title AS activity_title
    FROM crm_document_links l LEFT JOIN leads ld ON ld.id=l.lead_id
    LEFT JOIN crm_activities a ON a.id=l.activity_id AND a.deleted_at IS NULL
    WHERE l.document_id=${d.id}::uuid AND l.account_id=${accountId}::bigint
    AND (${user.role==='admin'} OR l.lead_id IS NULL OR ld.deleted_at IS NULL) ORDER BY l.id`.execute(db):Promise.resolve({rows:[]})
  ]);
  documents.push({...d,versions:versionsResult.rows,links:linksResult.rows});
 }catch(e){if(!(e instanceof CommunicationForbidden)&&!(e instanceof CrmForbidden))throw e;}}
 return response({documents,categories:(await sql`SELECT * FROM crm_document_categories ORDER BY name`.execute(db)).rows,maxDocumentBytes:(await communicationConfig(db)).maxDocumentBytes});
 }catch(e){return failure(e)}}
export async function post(request:Request){try{const {user}=await getServerUserSession(request);const raw=await request.text();if(Buffer.byteLength(raw)>2900000)throw new Error('Solicitud demasiado grande');return response(await mutateResource(db,resourceMutation.parse(superjson.parse(raw)),user));}catch(e){return failure(e)}}
export async function download(request:Request){try{const {user}=await getServerUserSession(request);const id=z.string().uuid().parse(new URL(request.url).searchParams.get('versionId'));const v=(await sql<ResourceVersion&{fileData:string|null}>`SELECT * FROM crm_document_versions WHERE id=${id}::uuid`.execute(db)).rows[0];if(!v)throw new Error('Versión inexistente');const doc=await documentFor(db,v.documentId,user);if(user.role!=='admin'&&doc.ownerEmail!==user.email&&doc.library&&doc.status==='approved'&&!(v as ResourceVersion&{approvedAt?:Date}).approvedAt)throw new CommunicationForbidden('Esta versión no fue aprobada');
 if(v.url){let u:URL;try{u=new URL(v.url)}catch{throw new Error('Referencia histórica sin URL válida; consultá el adjunto original')}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('Referencia histórica no navegable');return new Response(null,{status:302,headers:{Location:u.href,'Cache-Control':'no-store'}});}
 return new Response(new Uint8Array(Buffer.from(v.fileData!,'base64')),{headers:{'Content-Type':v.mimeType!,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(v.fileName!)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
 }catch(e){return failure(e)}}
