import {sql} from 'kysely';
import superjson from 'superjson';
import {db} from '../helpers/db';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {NotAuthenticatedError} from '../helpers/getSetServerSession';
import {searchSql} from '../helpers/searchSql';
import {searchQuery,type SearchResult} from './search.schema';
const response=(value:unknown,status=200)=>new Response(superjson.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function get(request:Request){
 try{
  const {user}=await getServerUserSession(request);
  const {q}=searchQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  // All entities use the same active-account scope. No file contents or binary data are returned.
  const accounts=sql`a.deleted_at IS NULL AND a.archived_at IS NULL AND a.merged_into_id IS NULL`;
  const queries=[
   sql<SearchResult>`SELECT 'business:'||a.id AS id,'Negocios' AS kind,a.nombre AS label,coalesce(a.ciudad,'') AS description,'/accounts/'||a.id AS url FROM crm_accounts a WHERE ${accounts} AND (${searchSql('a.nombre',q)} OR ${searchSql('a.email',q)} OR ${searchSql('a.telefono',q)} OR ${searchSql('a.ciudad',q)}) ORDER BY a.nombre,a.id LIMIT 8`,
   sql<SearchResult>`SELECT 'lead:'||l.id AS id,'Gestiones' AS kind,coalesce(l.opportunity_name,l.nombre) AS label,a.nombre AS description,'/sales/'||l.id AS url FROM leads l JOIN crm_accounts a ON a.id=l.account_id WHERE ${accounts} AND l.deleted_at IS NULL AND (${searchSql('l.opportunity_name',q)} OR ${searchSql('l.service_interest',q)} OR ${searchSql('l.nombre',q)}) ORDER BY l.updated_at DESC,l.id LIMIT 8`,
   sql<SearchResult>`SELECT 'contact:'||c.id AS id,'Contactos' AS kind,c.name AS label,a.nombre AS description,'/accounts/'||a.id||'?section=contacts&contactId='||c.id AS url FROM crm_contacts c JOIN crm_accounts a ON a.id=c.account_id WHERE ${accounts} AND c.deleted_at IS NULL AND (${searchSql('c.name',q)} OR ${searchSql('c.email',q)} OR ${searchSql('c.phone',q)}) ORDER BY c.name,c.id LIMIT 8`,
   sql<SearchResult>`SELECT 'note:'||n.id AS id,'Notas' AS kind,left(regexp_replace(n.note,'<[^>]*>','','g'),120) AS label,a.nombre||' · '||coalesce(l.opportunity_name,'Gestión') AS description,'/sales/'||l.id AS url FROM lead_notes n JOIN leads l ON l.id=n.lead_id JOIN crm_accounts a ON a.id=l.account_id WHERE ${accounts} AND l.deleted_at IS NULL AND ${searchSql('n.note',q)} ORDER BY n.created_at DESC,n.id LIMIT 8`,
   sql<SearchResult>`SELECT 'business-note:'||a.id AS id,'Notas' AS kind,left(a.business_notes,120) AS label,a.nombre AS description,'/accounts/'||a.id AS url FROM crm_accounts a WHERE ${accounts} AND ${searchSql('a.business_notes',q)} ORDER BY a.updated_at DESC,a.id LIMIT 8`,
   sql<SearchResult>`SELECT 'task:'||t.id AS id,'Pendientes' AS kind,t.title AS label,a.nombre AS description,'/accounts/'||a.id||'?section=work&taskId='||t.id AS url FROM crm_tasks t JOIN crm_accounts a ON a.id=t.account_id LEFT JOIN leads l ON l.id=t.lead_id WHERE ${accounts} AND t.deleted_at IS NULL AND t.status='pending' AND (t.lead_id IS NULL OR l.deleted_at IS NULL) AND (${user.role==='admin'} OR t.assigned_user_email=${user.email}) AND (${searchSql('t.title',q)} OR ${searchSql('t.description',q)}) ORDER BY t.due_date,t.id LIMIT 8`,
   sql<SearchResult>`SELECT 'file:'||d.id AS id,'Archivos' AS kind,d.title AS label,coalesce(a.nombre,'Biblioteca comercial') AS description,CASE WHEN d.account_id IS NULL THEN '/library' ELSE '/accounts/'||a.id||'?section=documents' END AS url FROM crm_documents d LEFT JOIN crm_accounts a ON a.id=d.account_id LEFT JOIN leads l ON l.id=d.lead_id WHERE d.deleted_at IS NULL AND (d.account_id IS NOT NULL OR ${user.role==='admin'}) AND (d.account_id IS NULL OR ${accounts}) AND (d.lead_id IS NULL OR l.deleted_at IS NULL) AND (${user.role==='admin'} OR d.owner_email=${user.email} OR d.library AND d.status='approved' OR NOT d.library AND d.account_id IS NOT NULL) AND (${searchSql('d.title',q)} OR EXISTS(SELECT 1 FROM crm_document_versions v WHERE v.document_id=d.id AND (${user.role==='admin'} OR d.owner_email=${user.email} OR NOT d.library OR d.status<>'approved' OR v.approved_at IS NOT NULL) AND ${searchSql('v.file_name',q)})) ORDER BY d.updated_at DESC,d.id LIMIT 8`,
   sql<SearchResult>`SELECT 'message:'||m.id AS id,'Mensajes' AS kind,coalesce(nullif(m.subject,''),left(m.body,100),'Mensaje') AS label,a.nombre AS description,'/accounts/'||a.id||'?section=history' AS url FROM crm_messages m JOIN crm_accounts a ON a.id=m.account_id LEFT JOIN leads l ON l.id=m.lead_id WHERE ${accounts} AND (m.lead_id IS NULL OR l.deleted_at IS NULL) AND m.status NOT IN ('draft','cancelled') AND (${searchSql('m.subject',q)} OR ${searchSql('m.body',q)}) ORDER BY m.created_at DESC,m.id LIMIT 8`,
   sql<SearchResult>`SELECT 'activity:'||t.id AS id,'Actividades' AS kind,t.title AS label,a.nombre AS description,'/accounts/'||a.id||'?section=history' AS url FROM crm_activities t JOIN crm_accounts a ON a.id=t.account_id LEFT JOIN leads l ON l.id=t.lead_id WHERE ${accounts} AND t.deleted_at IS NULL AND (t.lead_id IS NULL OR l.deleted_at IS NULL) AND (${searchSql('t.title',q)} OR ${searchSql('t.notes',q)} OR ${searchSql('t.result',q)}) ORDER BY t.occurred_at DESC,t.id LIMIT 8`,
   sql<SearchResult>`SELECT 'template:'||t.id AS id,'Modelos de mensajes' AS kind,t.name AS label,t.channel AS description,'/templates' AS url FROM message_templates t WHERE ${user.role==='admin'} AND t.active AND (${searchSql('t.name',q)} OR ${searchSql('t.body',q)} OR ${searchSql('t.subject',q)}) ORDER BY t.name,t.id LIMIT 8`
  ];
  const results=await Promise.all(queries.map(query=>query.execute(db)));
  return response({results:results.flatMap(result=>result.rows)});
 }catch(error){return response({error:error instanceof NotAuthenticatedError?'Iniciá sesión para buscar.':'No se pudo completar la búsqueda.'},error instanceof NotAuthenticatedError?401:400);}
}
