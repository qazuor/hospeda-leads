import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import superjson from 'superjson';
import {sql} from 'kysely';
import {db} from '../src/helpers/db';
import {get,post} from '../src/endpoints/communication';
import {assignPOST,reviewGET,unmatchedGET} from '../src/endpoints/inbound';
import {setServerSession} from '../src/helpers/getSetServerSession';

assert.equal(process.env.CRM_TEST_DATABASE,'1');
// Fixture businesses sort after the browser suite's names: the Negocios list is name-ordered and loads a first batch only.
async function identity(role:'admin'|'user'){const u=await db.insertInto('users').values({email:`inbound-ui-${role}-${randomUUID()}@example.com`,displayName:role,role}).returningAll().executeTakeFirstOrThrow();const s={id:u.email,createdAt:Date.now(),lastAccessed:Date.now()};await db.insertInto('sessions').values({id:s.id,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();const r=new Response();await setServerSession(r,s);return {user:u,cookie:r.headers.get('set-cookie')!.split(';')[0]};}
const parse=async(r:Response)=>superjson.parse<any>(await r.text());
const mutate=async(body:unknown,cookie:string,status=200)=>{const r=await post(new Request('http://localhost/_api/communication',{method:'POST',headers:{cookie},body:superjson.stringify(body)}));const d=await parse(r);assert.equal(r.status,status,JSON.stringify(d.error??d));return d;};
const review=async(cookie:string)=>{const r=await reviewGET(new Request('http://localhost/_api/inbound/review',{headers:{cookie}}));assert.equal(r.status,200);return (await parse(r)).rows as {id:string}[];};
const assign=async(body:unknown,cookie:string)=>assignPOST(new Request('http://localhost/_api/inbound/assign',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify(body)}));
async function inbound(accountId:string|null,status:'pending_review'|'unmatched',extra:{linkedMessageId?:string|null;automatic?:boolean}={}){const id=randomUUID();await sql`INSERT INTO crm_inbound_messages(id,channel,external_id,account_id,linked_message_id,match_method,from_address,from_name,subject,text_body,html_body,headers,is_automatic,received_at,status,source) VALUES(${id}::uuid,'email',${'ui-'+id+'@example.test'},${accountId},${extra.linkedMessageId??null},${accountId?'sender_email':'none'},'owner@example.test','Owner','Consulta','Hola, me interesa.\nGracias','<p>secret html</p>','{"messageId":"x"}'::jsonb,${extra.automatic??false},now(),${status},'email_worker')`.execute(db);return id;}
const row=async(id:string)=>(await sql<{status:string;responseId:string|null;accountId:string|null;leadId:string|null;matchMethod:string;linkedMessageId:string|null}>`SELECT status,response_id AS "responseId",account_id::text AS "accountId",lead_id::text AS "leadId",match_method AS "matchMethod",linked_message_id::text AS "linkedMessageId" FROM crm_inbound_messages WHERE id=${id}::uuid`.execute(db)).rows[0];
const journal=async(id:string,action:string)=>Number((await sql<{n:string}>`SELECT count(*)::text n FROM crm_communication_journal WHERE entity_type='inbound' AND entity_id=${id} AND action=${action}`.execute(db)).rows[0].n);

const admin=await identity('admin'),seller=await identity('user'),other=await identity('user');
try{
 const account=await db.insertInto('crmAccounts').values({nombre:`Zz inbound ui ${randomUUID()}`,ciudad:'Colón',email:`ui-${randomUUID()}@example.test`,assignedUserEmail:seller.user.email}).returningAll().executeTakeFirstOrThrow();
 const elsewhere=await db.insertInto('crmAccounts').values({nombre:`Zz inbound ui other ${randomUUID()}`,ciudad:'Colón',assignedUserEmail:other.user.email}).returningAll().executeTakeFirstOrThrow();
 const openStage=await db.selectFrom('crmStages').select('name').where('classification','=','open').executeTakeFirstOrThrow();
 const foreignLead=await db.insertInto('leads').values({accountId:elsewhere.id,nombre:elsewhere.nombre,estado:openStage.name}).returningAll().executeTakeFirstOrThrow();
 const foreignContact=await db.insertInto('crmContacts').values({accountId:elsewhere.id,name:'Otra persona'}).returningAll().executeTakeFirstOrThrow();
 const accountId=String(account.id);
 const pending=await inbound(accountId,'pending_review'),automatic=await inbound(accountId,'pending_review',{automatic:true});

 // The business payload carries inbound emails as plain text only.
 const detail=await parse(await get(new Request('http://localhost/_api/communication?accountId='+accountId,{headers:{cookie:seller.cookie}})));
 const listed=detail.inbound.find((i:any)=>i.id===pending);assert(listed,'Inbound email is part of the business payload');assert.equal(listed.textBody,'Hola, me interesa.\nGracias');
 assert(!('htmlBody' in listed)&&!('headers' in listed),'HTML body and raw headers never reach the client');

 // Hoy: the responsible seller and admin see it; another seller does not; automatic replies are left out.
 assert((await review(seller.cookie)).some(r=>r.id===pending));assert(!(await review(seller.cookie)).some(r=>r.id===automatic),'Automatic replies are not new responses');
 assert((await review(admin.cookie)).some(r=>r.id===pending));assert(!(await review(other.cookie)).some(r=>r.id===pending));

 // Register follows response_create: anyone who can read the business may register a response (D1 limits only do_not_contact).
 const register=(cookie:string,status=200,id=randomUUID(),inboundId=pending)=>mutate({action:'inbound_register',id,inboundId,category:'interested',summary:'Quiere conocer los planes',otherDetail:null},cookie,status);
 const byColleague=await inbound(accountId,'pending_review');await register(other.cookie,200,randomUUID(),byColleague);assert.equal((await row(byColleague)).status,'registered');
 const created=await register(seller.cookie);const registered=await row(pending);
 assert.equal(registered.status,'registered');assert.equal(registered.responseId,created.id);
 const response=(await sql<{exactText:string;channel:string;actorEmail:string}>`SELECT exact_text AS "exactText",channel,actor_email AS "actorEmail" FROM crm_communication_responses WHERE id=${created.id}::uuid`.execute(db)).rows[0];
 assert.equal(response.exactText,'Hola, me interesa.\nGracias');assert.equal(response.channel,'email');assert.equal(response.actorEmail,seller.user.email);
 const again=await register(seller.cookie);assert.equal(again.id,created.id,'A repeated register returns the same response');
 assert.equal(Number((await sql<{n:string}>`SELECT count(*)::text n FROM crm_communication_responses WHERE account_id=${accountId} AND summary='Quiere conocer los planes' AND actor_email=${seller.user.email}`.execute(db)).rows[0].n),1);
 const dnc=await inbound(accountId,'pending_review');await mutate({action:'inbound_register',id:randomUUID(),inboundId:dnc,category:'do_not_contact',summary:'Pidió no ser contactado',otherDetail:null,confirmDoNotContact:true},other.cookie,403);assert.equal((await row(dnc)).status,'pending_review','D1: only the responsible or an admin registers do_not_contact');
 assert.equal(await journal(pending,'inbound_registered'),1);
 assert(!(await review(seller.cookie)).some(r=>r.id===pending),'Registered emails leave Hoy');

 // Dismiss: needs a reason, writes the journal, then the email is no longer pending.
 const toDismiss=await inbound(accountId,'pending_review');
 await assert.rejects(()=>mutate({action:'inbound_dismiss',id:randomUUID(),inboundId:toDismiss,reason:'no'},seller.cookie));
 await mutate({action:'inbound_dismiss',id:randomUUID(),inboundId:toDismiss,reason:'Es publicidad'},other.cookie,403);
 await mutate({action:'inbound_dismiss',id:randomUUID(),inboundId:toDismiss,reason:'Es publicidad'},seller.cookie);
 assert.equal((await row(toDismiss)).status,'dismissed');assert.equal(await journal(toDismiss,'inbound_dismissed'),1);
 await mutate({action:'inbound_dismiss',id:randomUUID(),inboundId:toDismiss,reason:'Es publicidad'},seller.cookie,409);

 // Unmatched list and manual assignment are admin only and validate ownership.
 const unmatched=await inbound(null,'unmatched');
 assert.equal((await unmatchedGET(new Request('http://localhost/_api/inbound/unmatched',{headers:{cookie:seller.cookie}}))).status,403);
 const list=await parse(await unmatchedGET(new Request('http://localhost/_api/inbound/unmatched',{headers:{cookie:admin.cookie}})));assert(list.groups.some((g:any)=>g.messages.some((m:any)=>m.id===unmatched)),'Spec 103 D2: the message is listed inside its sender card');
 assert.equal((await assign({id:unmatched,accountId},seller.cookie)).status,403);
 assert.equal((await assign({id:unmatched,accountId,leadId:String(foreignLead.id)},admin.cookie)).status,400,'A management from another business is rejected');
 assert.equal((await assign({id:unmatched,accountId,contactId:String(foreignContact.id)},admin.cookie)).status,400,'A person from another business is rejected');
 assert.equal((await row(unmatched)).status,'unmatched');
 assert.equal((await assign({id:unmatched,accountId},admin.cookie)).status,200);
 const assigned=await row(unmatched);assert.equal(assigned.accountId,accountId);assert.equal(assigned.status,'pending_review');assert.equal(assigned.matchMethod,'manual');
 assert.equal(await journal(unmatched,'inbound_matched'),1);
 assert((await review(seller.cookie)).some(r=>r.id===unmatched),'A manually assigned email reaches the responsible seller');

 // Moving an email to another business drops the link to the first business's message.
 const outbox=await db.insertInto('emailOutbox').values({recipientEmail:'owner@example.test',senderEmail:'seller@hospeda.test',senderName:'Seller',subject:'Hola',htmlBody:'<p>Hola</p>',textBody:'Hola',status:'accepted'}).returning('id').executeTakeFirstOrThrow();
 const message=randomUUID();await sql`INSERT INTO crm_messages(id,account_id,original_account_id,channel,recipient,owner_email,outbox_id,status) VALUES(${message}::uuid,${accountId},${accountId},'email','owner@example.test',${seller.user.email},${outbox.id},'accepted')`.execute(db);
 const linked=await inbound(accountId,'pending_review',{linkedMessageId:message});
 assert.equal((await assign({id:linked,accountId:String(elsewhere.id)},admin.cookie)).status,200);
 assert.equal((await row(linked)).linkedMessageId,null,'Reassignment never keeps a link to another business message');
 // Spec 103 B3 (finding 16): the target must be a live business (not merged or in the trash) and a chosen management must be open.
 // Archived blocks outputs, not inputs (decisiones.md), so an archived business is a valid target, as in the automatic matching.
 {
  const survivor=await db.insertInto('crmAccounts').values({nombre:`Zz inbound ui survivor ${randomUUID()}`,ciudad:'Colón',assignedUserEmail:seller.user.email}).returningAll().executeTakeFirstOrThrow();
  const merged=await db.insertInto('crmAccounts').values({nombre:`Zz inbound ui merged ${randomUUID()}`,ciudad:'Colón',assignedUserEmail:seller.user.email}).returningAll().executeTakeFirstOrThrow();await db.updateTable('crmAccounts').set({mergedIntoId:survivor.id}).where('id','=',merged.id).execute();
  const archivedTarget=await db.insertInto('crmAccounts').values({nombre:`Zz inbound ui archived ${randomUUID()}`,ciudad:'Colón',assignedUserEmail:seller.user.email,archivedAt:new Date()}).returningAll().executeTakeFirstOrThrow();
  const trashed=await db.insertInto('crmAccounts').values({nombre:`Zz inbound ui trashed ${randomUUID()}`,ciudad:'Colón',assignedUserEmail:seller.user.email,deletedAt:new Date()}).returningAll().executeTakeFirstOrThrow();
  const closedStage=await db.selectFrom('crmStages').select('name').where('classification','=','won').executeTakeFirstOrThrow();
  const closedLead=await db.insertInto('leads').values({accountId:account.id,nombre:account.nombre,estado:openStage.name,assignedUserEmail:seller.user.email}).returningAll().executeTakeFirstOrThrow();await sql`UPDATE leads SET estado=${closedStage.name} WHERE id=${closedLead.id}`.execute(db);
  const target=await inbound(null,'unmatched');
  const rejected=async(body:Record<string,unknown>,pattern:RegExp,why:string)=>{const r=await assign({id:target,...body},admin.cookie);const d=await parse(r);assert.equal(r.status,400,why);assert.match(String(d.error),pattern,why);};
  await rejected({accountId:String(merged.id)},/se fusionó con otro/,'A merged business is rejected');
  await rejected({accountId:String(trashed.id)},/papelera/,'A business in the trash is rejected');
  await rejected({accountId:'999999999999'},/papelera|no existe/,'A missing business is rejected with a readable error');
  await rejected({accountId,leadId:String(closedLead.id)},/abierta/,'A closed management is rejected');
  assert.equal((await row(target)).status,'unmatched','Nothing moves on a rejection');assert.equal(await journal(target,'inbound_matched'),0);
  const ok=await assign({id:target,accountId:String(survivor.id)},admin.cookie);assert.equal(ok.status,200);assert.deepEqual(await parse(ok),{ok:true,accountName:survivor.nombre,accountCode:`H${survivor.id}`},'The answer names the business for the notice');
  const after=await row(target);assert.deepEqual([after.status,after.responseId,after.leadId],['pending_review',null,null],'Associating is only the association: no response, no management');
  const toArchived=await inbound(null,'unmatched');const archivedOk=await assign({id:toArchived,accountId:String(archivedTarget.id)},admin.cookie);assert.equal(archivedOk.status,200,'An archived business accepts an incoming message');assert.equal((await row(toArchived)).accountId,String(archivedTarget.id));
 }
 console.log('Inbound email UI: payload without HTML/headers, Hoy visibility, register/dismiss permissions and idempotency, unmatched admin assignment and ownership checks passed');
}finally{await db.destroy();}
