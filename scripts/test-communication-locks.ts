// Real two-connection concurrency checks for the per-business communication locks (row locks instead of table locks).
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import superjson from 'superjson';
import {CamelCasePlugin,Kysely,sql,type Transaction} from 'kysely';import {PostgresJSDialect} from 'kysely-postgres-js';import postgres from 'postgres';
import {db} from '../src/helpers/db';import type {DB} from '../src/helpers/schema';
import {post,webhook} from '../src/endpoints/communication';import {handle as saveSettings} from '../src/endpoints/settings_save_POST';import {mutateResource} from '../src/helpers/resourceService';import type {User} from '../src/helpers/User';import {post as quality} from '../src/endpoints/dataQuality';
import {lockCommunication} from '../src/helpers/communicationService';import {lockAccounts} from '../src/helpers/crmPermissions';
import {setServerSession} from '../src/helpers/getSetServerSession';import {businessFields} from '../src/helpers/dataNormalization';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable DB');
// The shared test pool has a single connection, so the competing transactions run on their own pool.
const url=process.env.DATABASE_URL;assert(url,'DATABASE_URL is required');
const other=new Kysely<DB>({plugins:[new CamelCasePlugin()],dialect:new PostgresJSDialect({postgres:postgres(url,{prepare:false,max:4,connection:{application_name:'crm-lock-test'}})})});
const stamp=Date.now();
const u=await db.insertInto('users').values({email:`locks-admin-${randomUUID()}@example.com`,displayName:'Locks admin',role:'admin'}).returningAll().executeTakeFirstOrThrow();
const session={id:u.email,createdAt:Date.now(),lastAccessed:Date.now()};await db.insertInto('sessions').values({id:session.id,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();
const cookieResponse=new Response();await setServerSession(cookieResponse,session);const cookie=cookieResponse.headers.get('set-cookie')!.split(';')[0];
async function call(endpoint:(r:Request)=>Promise<Response>,body:unknown){const r=await endpoint(new Request('http://localhost/_api/x',{method:'POST',headers:{cookie},body:superjson.stringify(body)}));return {status:r.status,data:superjson.parse<any>(await r.text())};}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
/** True when the promise is still pending after `ms`: the operation is waiting for a lock. */
async function waiting(p:Promise<unknown>,ms=700){return Promise.race([p.then(()=>false,()=>false),sleep(ms).then(()=>true)]);}
/** Opens a transaction on its own connection, runs `setup` and keeps it open until `release()`. */
async function hold(setup:(trx:Transaction<DB>)=>Promise<void>){
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);let ready!:()=>void;const started=new Promise<void>(r=>ready=r);
 const done=other.transaction().execute(async trx=>{await setup(trx);ready();await gate;});done.catch(()=>ready());
 await started;return {release,done};
}
/** Runs `statement` in its own transaction with a short lock_timeout; returns the SQLSTATE on failure. */
async function attempt(statement:(trx:Transaction<DB>)=>Promise<unknown>,timeout=2000){
 try{await other.transaction().execute(async trx=>{await sql`SELECT set_config('lock_timeout',${String(timeout)},true)`.execute(trx);await statement(trx);});return 'ok';}
 catch(e){return String((e as {code?:string}).code??e);}
}
const lockScope=(...ids:unknown[])=>async()=>({accountIds:ids});
const account=async(name:string)=>db.insertInto('crmAccounts').values({nombre:name+' '+stamp,ciudad:'Colón',telefono:'5493442'+String(stamp).slice(-6),assignedUserEmail:u.email}).returningAll().executeTakeFirstOrThrow();
try{
 const a=await account('Locks A'),b=await account('Locks B');
 const leadA=await db.insertInto('leads').values({accountId:a.id,nombre:a.nombre,estado:'Cargado',assignedUserEmail:u.email}).returningAll().executeTakeFirstOrThrow();
 const leadB=await db.insertInto('leads').values({accountId:b.id,nombre:b.nombre,estado:'Cargado',assignedUserEmail:u.email}).returningAll().executeTakeFirstOrThrow();

 // 1. A communication transaction on A no longer blocks writers of other businesses (the old table lock did), but still owns A.
 {const h=await hold(trx=>lockCommunication(trx,lockScope(a.id)));
  try{
   assert.equal(await attempt(trx=>trx.updateTable('leads').set({notas:'Unrelated write '+stamp,updatedAt:new Date()}).where('id','=',leadB.id).execute()),'ok','A write to another business must not wait for a communication on A');
   assert.equal(await attempt(trx=>lockCommunication(trx,lockScope(b.id))),'ok','Communications on different businesses run concurrently');
   assert.equal(await attempt(trx=>trx.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',a.id).execute(),300),'55P03','No contactar on A must wait for the communication on A');
   assert.equal(await attempt(trx=>trx.updateTable('leads').set({estado:'Perdida',updatedAt:new Date()}).where('id','=',leadA.id).execute(),300),'55P03','A stage change on A must wait (crm_leads_active_guard takes FOR SHARE on the locked business row)');
  }finally{h.release();await h.done;}
  console.log('Unrelated writes proceed while a communication holds its business');}

 // 2a. A restriction requested while a send on A is in flight waits for it.
 {const h=await hold(trx=>lockCommunication(trx,lockScope(a.id)));
  const restriction=call(post,{action:'restrict',accountId:a.id,leadId:null,contactId:null,channel:'email',reason:'Restricción concurrente '+stamp});
  try{assert.equal(await waiting(restriction),true,'The restriction must wait for the in-flight communication on the same business');}finally{h.release();await h.done;}
  assert.equal((await restriction).status,200);console.log('Restrictions serialize after in-flight sends');}

 // 2b. A send that starts while a restriction on A is being written waits and then sees it.
 {const draft=await call(post,{action:'prepare',id:randomUUID(),leadId:leadA.id,contactId:null,channel:'whatsapp',templateId:null});assert.equal(draft.status,200,draft.data.error);
  const edited=await call(post,{action:'edit',id:draft.data.id,revision:draft.data.revision,subject:'',body:'Hola desde la prueba de bloqueos'});assert.equal(edited.status,200,edited.data.error);
  const h=await hold(async trx=>{await lockCommunication(trx,lockScope(a.id));await sql`INSERT INTO crm_contact_restrictions(account_id,channel,reason,actor_email,source,evidence) VALUES(${a.id},'all','Bloqueo durante el envío','locks@example.com','manual','test')`.execute(trx);});
  const send=call(post,{action:'dispatch',id:draft.data.id,revision:edited.data.revision,confirm:true});
  try{assert.equal(await waiting(send),true,'The send must wait for the restriction transaction on the same business');}finally{h.release();await h.done;}
  const sent=await send;assert.equal(sent.status,403,'The send must see the committed restriction');assert.match(sent.data.error,/No contactar/);
  assert.equal((await sql<{status:string}>`SELECT status FROM crm_messages WHERE id=${draft.data.id}::uuid`.execute(db)).rows[0].status,'draft');
  console.log('Sends see restrictions committed while they waited');}

 // 4. Opposite lock orders never deadlock: account rows are always locked in ascending id order.
 {assert(Number(a.id)<Number(b.id));
  const first=await hold(trx=>lockAccounts(trx,[a.id]));
  const second=other.transaction().execute(async trx=>{await lockCommunication(trx,lockScope(b.id,a.id));});
  try{
   assert.equal(await waiting(second),true,'The reversed request waits on the lower id first');
   assert.equal(await attempt(trx=>lockAccounts(trx,[b.id]),1000),'ok','B stays free: the waiting transaction did not lock B before A');
  }finally{first.release();await first.done;}
  await second;
  const p1=hold(trx=>lockCommunication(trx,lockScope(a.id,b.id))),p2=other.transaction().execute(trx=>lockCommunication(trx,lockScope(b.id,a.id)));
  const h1=await p1;h1.release();await h1.done;await p2;
  console.log('Reversed multi-business locks do not deadlock');}

 // 3. Merges and communications on the same business exclude each other.
 {const source=await account('Locks merge source'),dest=await account('Locks merge destination');
  const preview=await call(quality,{action:'merge_preview',sourceId:source.id,destinationId:dest.id});assert.equal(preview.status,200,preview.data.error);
  const selections=Object.fromEntries(businessFields.map(f=>[f,'destination']));
  const h=await hold(trx=>lockCommunication(trx,lockScope(dest.id)));
  const merge=call(quality,{action:'merge_confirm',sourceId:source.id,destinationId:dest.id,token:preview.data.token,selections,reason:'Prueba de bloqueos',confirm:true});
  try{assert.equal(await waiting(merge),true,'The merge must wait for the communication on its destination');}finally{h.release();await h.done;}
  assert.equal((await merge).status,200,(await merge).data.error);
  const target=await account('Locks merge running');
  const m=await hold(async trx=>{await sql`LOCK TABLE crm_accounts,leads,crm_contact_restrictions,crm_messages IN SHARE ROW EXCLUSIVE MODE`.execute(trx);await lockAccounts(trx,[target.id]);});
  const contact=call(post,{action:'prepare_general',id:randomUUID(),accountId:target.id,leadId:null,contactId:null,channel:'whatsapp',purpose:'verification',otherPurpose:null,templateId:null});
  try{assert.equal(await waiting(contact),true,'A communication must wait for a running merge');}finally{m.release();await m.done;}
  const prepared=await contact;assert.equal(prepared.status,200,prepared.data.error);
  const stale=await call(post,{action:'prepare_general',id:randomUUID(),accountId:source.id,leadId:null,contactId:null,channel:'whatsapp',purpose:'verification',otherPurpose:null,templateId:null});assert.notEqual(stale.status,200,'The merged source no longer accepts communications');
  console.log('Merges and communications serialize per business');}
 // 5. Each action resolves its business and locks it BEFORE its checks. The holder locks only the business row (no table lock,
 // no FK insert) and, where an FK/guard would make any implementation wait, commits a change the action must observe.
 {const business=async(name:string)=>{const acc=await account(name);const lead=await db.insertInto('leads').values({accountId:acc.id,nombre:acc.nombre,estado:'Cargado',assignedUserEmail:u.email}).returningAll().executeTakeFirstOrThrow();return {acc,lead};};
  const whatsappDraft=async(leadId:string)=>{const d=await call(post,{action:'prepare',id:randomUUID(),leadId,contactId:null,channel:'whatsapp',templateId:null});assert.equal(d.status,200,d.data.error);const e=await call(post,{action:'edit',id:d.data.id,revision:d.data.revision,subject:'',body:'Hola alcance'});assert.equal(e.status,200,e.data.error);return e.data;};
  async function underLock<T>(label:string,accountId:string,change:((trx:Transaction<DB>)=>Promise<unknown>)|null,op:()=>Promise<T>){
   const h=await hold(async trx=>{await lockAccounts(trx,[accountId]);if(change)await change(trx);});const p=op();
   try{assert.equal(await waiting(p),true,label+' must wait for the business row');}finally{h.release();await h.done;}return p;
  }
  const noContact=(id:string)=>(trx:Transaction<DB>)=>trx.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',id).execute();
  {const {acc,lead}=await business('Scope edit');const d=await whatsappDraft(String(lead.id));
   assert.equal((await underLock('edit',String(acc.id),null,()=>call(post,{action:'edit',id:d.id,revision:d.revision,subject:'',body:'Hola otra vez'}))).status,200);}
  {const {acc}=await business('Scope lift');const added=await call(post,{action:'restrict',accountId:acc.id,leadId:null,contactId:null,channel:'call',reason:'Para levantar'});assert.equal(added.status,200);
   const restriction=(await sql<{id:string}>`SELECT id FROM crm_contact_restrictions WHERE account_id=${acc.id} AND lifted_at IS NULL`.execute(db)).rows[0];
   // The journal FK would make any lift wait eventually; the restriction row staying untouched proves it waited before acting.
   const h=await hold(trx=>lockAccounts(trx,[acc.id]));const lift=call(post,{action:'lift',id:String(restriction.id),reason:'Levantada en prueba'});
   try{assert.equal(await waiting(lift),true,'lift must wait for the business row');assert.equal(await attempt(trx=>sql`SELECT id FROM crm_contact_restrictions WHERE id=${restriction.id} FOR UPDATE NOWAIT`.execute(trx)),'ok','lift must not touch the restriction before locking its business');}finally{h.release();await h.done;}
   assert.equal((await lift).status,200);}
  {const {acc,lead}=await business('Scope outcome');const d=await whatsappDraft(String(lead.id));const opened=await call(post,{action:'dispatch',id:d.id,revision:d.revision,confirm:true});assert.equal(opened.status,200,opened.data.error);
   const r=await underLock('outcome manual_sent',String(acc.id),noContact(String(acc.id)),()=>call(post,{action:'outcome',id:d.id,event:'manual_sent',notes:''}));assert.equal(r.status,403,'outcome must see No contactar committed while it waited');}
  {const {acc}=await business('Scope general');
   const r=await underLock('prepare_general',String(acc.id),noContact(String(acc.id)),()=>call(post,{action:'prepare_general',id:randomUUID(),accountId:acc.id,leadId:null,contactId:null,channel:'whatsapp',purpose:'first_contact',otherPurpose:null,templateId:null}));assert.equal(r.status,403,'prepare_general must see No contactar committed while it waited');}
  {const {acc}=await business('Scope response');const id=randomUUID();
   const r=await underLock('response_create',String(acc.id),noContact(String(acc.id)),()=>call(post,{action:'response_create',id,accountId:acc.id,leadId:null,contactId:null,channel:'whatsapp',recipient:'x',recipientName:'x',destination:null,linkedMessageId:null,category:'do_not_contact',summary:'No quiere',exactText:null,otherDetail:null,confirmDoNotContact:true,closeLeadIds:[],reminder:null}));assert.equal(r.status,200,r.data.error);
   assert.equal(Number((await sql<{n:string}>`SELECT count(*) n FROM crm_communication_journal WHERE account_id=${acc.id} AND action='do_not_contact_activated'`.execute(db)).rows[0].n),0,'response_create must see No contactar already active and not activate it again');}
  {const {acc,lead}=await business('Scope prepare');const t=await db.insertInto('messageTemplates').values({name:'Locks scope '+stamp,channel:'whatsapp',body:'<p>Hola {{name}}</p>'}).returningAll().executeTakeFirstOrThrow();const id=randomUUID();
   const r=await underLock('lead prepare',String(acc.id),trx=>trx.updateTable('crmAccounts').set({isClient:true}).where('id','=',acc.id).execute(),()=>call(post,{action:'prepare',id,leadId:lead.id,contactId:null,channel:'whatsapp',templateId:t.id}));assert.equal(r.status,200,r.data.error);
   assert.equal((await sql<{v:string}>`SELECT template_snapshot->'context'->>'is_client' AS v FROM crm_messages WHERE id=${id}::uuid`.execute(db)).rows[0].v,'Sí','prepare must render with the business state committed while it waited');}
  console.log('Every communication action locks its business before checking it');}

 // 6. A subtype rename touching managements of a locked business waits instead of deadlocking.
 {const {id:subtypeId}=await db.insertInto('crmSubtypes').values({name:'Locks sub '+stamp,typeName:null}).returning('id').executeTakeFirstOrThrow();
  const lead=await db.insertInto('leads').values({accountId:b.id,nombre:b.nombre,estado:'Cargado',subtipo:'Locks sub '+stamp,assignedUserEmail:u.email}).returningAll().executeTakeFirstOrThrow();
  const h=await hold(trx=>lockAccounts(trx,[b.id]));
  const rename=saveSettings(new Request('http://localhost/_api/settings',{method:'POST',headers:{cookie},body:superjson.stringify({action:'editSubtype',id:String(subtypeId),name:'Locks sub renamed '+stamp})}));
  try{assert.equal(await waiting(rename),true,'The rename must wait for the business row');}finally{h.release();await h.done;}
  assert.equal((await rename).status,200);assert.equal((await db.selectFrom('leads').select('subtipo').where('id','=',lead.id).executeTakeFirstOrThrow()).subtipo,'Locks sub renamed '+stamp);
  console.log('Subtype renames wait for communications on affected businesses');}

 // 7. Webhook: lock timeouts are retryable (503) while invalid payloads stay 400. Run with DB_LOCK_TIMEOUT_MS=2000.
 {assert.equal(process.env.DB_LOCK_TIMEOUT_MS,'2000','Run this script with DB_LOCK_TIMEOUT_MS=2000');process.env.BREVO_WEBHOOK_TOKEN='fixture-webhook-token-at-least-32-characters';
  const hook=(body:string)=>webhook(new Request('http://localhost/_api/communication/webhook',{method:'POST',headers:{Authorization:'Bearer '+process.env.BREVO_WEBHOOK_TOKEN},body}));
  const event=JSON.stringify({event:'delivered',email:'nobody@example.com','message-id':'locks-'+stamp+'@brevo.test',ts_event:Math.floor(Date.now()/1000)-5});
  const h=await hold(async trx=>{await sql`LOCK TABLE crm_accounts IN SHARE ROW EXCLUSIVE MODE`.execute(trx);});
  try{assert.equal((await hook(event)).status,503,'A lock timeout must ask the provider to retry');}finally{h.release();await h.done;}
  assert.equal((await hook(event)).status,200);assert.equal((await hook('{"event":1}')).status,400);
  console.log('Webhook lock timeouts return 503');}

 // 8. Concurrent double submits of the same library document return the same id instead of a duplicate-key error.
 {const actor={id:u.id,email:u.email,displayName:u.displayName,fullName:null,avatarUrl:null,role:'admin'} as User;
  for(let round=0;round<5;round++){const id=randomUUID();const create=()=>mutateResource(other,{action:'create',id,title:'Recurso concurrente '+round,type:'Guía',accountId:null,leadId:null,activityId:null,library:true,categoryId:null,version:{url:'https://example.com/recurso-'+round,expiresOn:null}},actor);
   const results=await Promise.allSettled([create(),create()]);for(const r of results)assert.equal(r.status,'fulfilled',r.status==='rejected'?String(r.reason):'');
   assert.equal(Number((await sql<{n:string}>`SELECT count(*) n FROM crm_document_versions WHERE document_id=${id}::uuid`.execute(db)).rows[0].n),1);}
  console.log('Concurrent document creates are idempotent');}
 console.log('Communication lock tests passed');
}finally{await other.destroy();await db.destroy();}
