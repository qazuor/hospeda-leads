import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {sql} from 'kysely';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {encryptInstagramToken} from '../src/helpers/instagram';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {post as webhook} from '../src/endpoints/inboundInstagram';
import {post as communication} from '../src/endpoints/communication';
import {pendingContactFollowUps} from '../src/helpers/communicationService';
import {CompiledQuery} from 'kysely';
import {NO_SECRET_SNAPSHOT,assertLocalTestDatabase,cleanupThenRestore,instagramSecretFingerprint,restoreInstagramSecret,snapshotInstagramSecret,type SecretQuery} from './lib/instagram-secret';

/**
 * Spec 92: Instagram chats opened from the composer. Communication gates (prepare / prepare_general / edit / dispatch /
 * outcome), the opened journal and activity, the waiting period of pending outcomes, and the echo-to-attempt resolution
 * of the Instagram webhook with Meta mocked (no network, nothing is ever sent to Instagram).
 */
assertLocalTestDatabase({url:process.env.DATABASE_URL,optIn:process.env.CRM_TEST_DATABASE});
const run=randomUUID(),hex=run.replaceAll('-',''),secret='instagram-open-chat-secret',igAccount='instagram-open-chat-'+run;
const old={secret:process.env.INSTAGRAM_APP_SECRET,account:process.env.INSTAGRAM_ACCOUNT_ID,key:process.env.INTEGRATION_SECRETS_KEY,fetch:globalThis.fetch,warn:console.warn};
const key=Buffer.alloc(32,9);
process.env.INSTAGRAM_APP_SECRET=secret;process.env.INSTAGRAM_ACCOUNT_ID=igAccount;process.env.INTEGRATION_SECRETS_KEY=key.toString('base64');
const warnings:string[]=[];console.warn=(...args:unknown[])=>{warnings.push(args.map(String).join(' '));};

// Meta is mocked: profile lookups answer from `profiles` (igsid -> username).
const profiles=new Map<string,string>();
globalThis.fetch=(async(input:Parameters<typeof fetch>[0])=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 assert.equal(url.hostname,'graph.instagram.com','tests must never reach a real network host');
 const name=profiles.get(decodeURIComponent(url.pathname.slice(1)));
 return name?Response.json({username:name,name:'Instagram fixture'}):Response.json({},{status:500});
}) as typeof fetch;

const accountIds:string[]=[],userEmails:string[]=[],igsids:string[]=[],templateIds:string[]=[];let tagSeq=0;
let secretSnapshot=NO_SECRET_SNAPSHOT;
const secretQuery:SecretQuery=async(text,params=[])=>(await db.executeQuery(CompiledQuery.raw(text,[...params]))).rows as Record<string,unknown>[];
const identity=async(role:'admin'|'user')=>{const u=await db.insertInto('users').values({email:`ig-open-${role}-${randomUUID()}@example.com`,displayName:role==='admin'?'Admin IG':'Vendedora IG',role}).returningAll().executeTakeFirstOrThrow();userEmails.push(u.email);await db.insertInto('sessions').values({id:u.email,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();const r=new Response();await setServerSession(r,{id:u.email,createdAt:Date.now(),lastAccessed:Date.now()});return {user:u,cookie:r.headers.get('set-cookie')!.split(';')[0]};};
async function call(body:unknown,cookie:string,status=200){const r=await communication(new Request('http://localhost/_api/communication',{method:'POST',headers:{cookie},body:superjson.stringify(body)}));const d=superjson.parse<any>(await r.text());assert.equal(r.status,status,`${(body as {action:string}).action}: ${d.error??''}`);return d;}
const row=async(id:string)=>(await sql<{id:string;status:string;externalId:string|null;body:string;textBody:string|null;recipient:string;channel:string;destinationDetail:string|null;activityId:string|null;ownerEmail:string;lastInteractionAt:Date;taskId:string|null;contactId:string|null;recipientName:string}>`SELECT id::text AS id,status,external_id,body,text_body,recipient,channel,destination_detail,activity_id::text AS activity_id,owner_email,last_interaction_at,task_id::text AS task_id,contact_id::text AS contact_id,recipient_name FROM crm_messages WHERE id=${id}::uuid`.execute(db)).rows[0]!;
const socialRows=async(account:string)=>(await sql<{id:string;owner:string;status:string;externalId:string|null}>`SELECT id::text AS id,owner_email AS owner,status,external_id FROM crm_messages WHERE account_id=${account}::bigint AND channel='social' ORDER BY created_at`.execute(db)).rows;
const journal=async(entityId:string,action:string)=>(await sql<{actor:string|null;automatic:boolean;triggeredBy:string|null;after:Record<string,unknown>|null}>`SELECT actor_email AS actor,is_automatic AS automatic,triggered_by_email AS "triggeredBy",after_value AS after FROM crm_communication_journal WHERE entity_id=${entityId} AND action=${action} ORDER BY id`.execute(db)).rows;
const activityResult=async(id:string|null)=>id?(await sql<{result:string;actorEmail:string}>`SELECT result,actor_email FROM crm_activities WHERE id=${id}`.execute(db)).rows[0]:undefined;

/** One business per case: its own Instagram username and chat IGSID, so open attempts never cross between cases. */
async function business(label:string,owner:string,over:Record<string,unknown>={}){
 const tag=++tagSeq,username=`zz${tag}_${hex.slice(0,18)}`,igsid=String(BigInt('0x'+hex.slice(0,12))*1000n+BigInt(tag));
 profiles.set(igsid,username);igsids.push(igsid);
 const a=await db.insertInto('crmAccounts').values({nombre:`Zz IG ${label} ${run.slice(0,8)}`,ciudad:'Colón',perfilInstagram:`https://www.instagram.com/${username}/`,assignedUserEmail:owner,status:'reviewed',...over} as never).returningAll().executeTakeFirstOrThrow();
 accountIds.push(String(a.id));return {id:String(a.id),username,igsid,nombre:a.nombre};
}
const openLead=async(account:string,owner:string)=>String((await db.insertInto('leads').values({accountId:account,nombre:'Zz IG lead '+run.slice(0,8),estado:'Cargado',assignedUserEmail:owner}).returningAll().executeTakeFirstOrThrow()).id);
const general=(accountId:string,over:Record<string,unknown>={})=>({action:'prepare_general',id:randomUUID(),accountId,leadId:null,contactId:null,channel:'instagram',purpose:'first_contact',otherPurpose:null,templateId:null,...over});
/** prepare_general → edit → dispatch; returns the dispatch answer and the attempt id. */
async function openAttempt(accountId:string,text:string,cookie:string){
 const draft=await call(general(accountId),cookie);const edited=await call({action:'edit',id:draft.id,revision:draft.revision,subject:'',body:text},cookie);
 const opened=await call({action:'dispatch',id:draft.id,revision:edited.revision,confirm:true},cookie);return {id:draft.id as string,opened};
}
const payload=(mid:string,text:string,igsid:string,timestamp=Date.now())=>({object:'instagram',entry:[{id:igAccount,messaging:[{sender:{id:igAccount},recipient:{id:igsid},timestamp,message:{mid,text,is_echo:true}}]}]});
const signed=(body:unknown)=>{const raw=JSON.stringify(body);return new Request('http://localhost/_api/inbound/instagram',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')},body:raw});};
const echo=async(mid:string,text:string,igsid:string,options:Parameters<typeof webhook>[1]={},timestamp=Date.now())=>{const r=await webhook(signed(payload(mid,text,igsid,timestamp)),options);assert.equal(r.status,200,'the webhook always answers 200 for an echo');};
const mid=(tag:string)=>`${tag}-${run}`;
/** Value of the Hoy outcome-tracking cutoff before the run (migration 028 sets it to the migration time), restored at the end. */
let outcomeSince:string|null|undefined;
/**
 * Moves an attempt's open `minutes` back, through every anchor the server reads: `last_interaction_at` (Hoy's waiting period,
 * the client and the echo pre-filter) and the `instagram_opened_unconfirmed` journal entry (the echo window). Hoy also skips
 * contacts older than `crm_contact_outcome_since`; on a database migrated minutes ago (CI) that cutoff is newer than the
 * backdated open, so it is moved before it too. Backdating only `last_interaction_at` made the 15-minute check pass locally
 * and fail on a fresh database.
 */
async function backdateOpen(id:string,minutes:number){
 if(outcomeSince===undefined)outcomeSince=(await sql<{value:string}>`SELECT value FROM app_settings WHERE key='crm_contact_outcome_since'`.execute(db)).rows[0]?.value??null;
 await sql`UPDATE crm_messages SET last_interaction_at=now()-make_interval(mins=>${minutes}::int) WHERE id=${id}::uuid`.execute(db);
 await sql`UPDATE crm_communication_journal SET created_at=now()-make_interval(mins=>${minutes}::int) WHERE entity_type='interaction' AND entity_id=${id} AND action='instagram_opened_unconfirmed'`.execute(db);
 await sql`UPDATE app_settings SET value=to_char((now()-make_interval(mins=>${minutes+60}::int)) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE key='crm_contact_outcome_since' AND value::timestamptz>now()-make_interval(mins=>${minutes}::int)`.execute(db);
}
const words=(seed:string)=>`Hola, soy de Hospeda. Te escribo por ${seed} para contarte cómo difundimos alojamientos ${seed} de la zona de Colón.`;

try{
 secretSnapshot=await snapshotInstagramSecret({query:secretQuery});
 // M2 check: a failing cleanup still restores the row exactly (timestamps included).
 {
  const before=await instagramSecretFingerprint({query:secretQuery});
  await sql`INSERT INTO crm_integration_secrets(name,ciphertext,iv,tag,expires_at,refreshed_at,last_error) VALUES('instagram','x','y','z',now(),now(),'probe') ON CONFLICT(name) DO UPDATE SET ciphertext='x',last_error='probe',updated_at=now()`.execute(db);
  const reported:unknown[]=[];
  await cleanupThenRestore({cleanup:async()=>{throw new Error('simulated cleanup failure');},restore:()=>restoreInstagramSecret({query:secretQuery,snapshot:secretSnapshot}),onCleanupError:error=>reported.push(error)});
  assert.equal(reported.length,1);assert.equal(await instagramSecretFingerprint({query:secretQuery}),before,'the secret row is restored even when the cleanup fails');
  // Without a snapshot the restore leaves the row alone.
  await restoreInstagramSecret({query:secretQuery,snapshot:NO_SECRET_SNAPSHOT});assert.equal(await instagramSecretFingerprint({query:secretQuery}),before);
 }
 const e=encryptInstagramToken('mock-token-'+run,key);
 await sql`INSERT INTO crm_integration_secrets(name,ciphertext,iv,tag,expires_at,refreshed_at,last_error) VALUES('instagram',${e.ciphertext},${e.iv},${e.tag},now()+interval '30 days',now(),NULL) ON CONFLICT(name) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,tag=excluded.tag,expires_at=excluded.expires_at,refreshed_at=excluded.refreshed_at,last_error=NULL`.execute(db);
 const admin=await identity('admin'),seller=await identity('user'),other=await identity('user');
 const template=await db.insertInto('messageTemplates').values({name:'Zz IG primer contacto '+run.slice(0,8),channel:'social',purpose:'first_contact',body:'<p>Hola <strong>{{name}}</strong>, te escribo de Hospeda.</p><p>¿Charlamos?</p>'} as never).returningAll().executeTakeFirstOrThrow();templateIds.push(String(template.id));

 // ── Communication: prepare, edit, dispatch and the flags.
 {
  const b=await business('flujo',seller.user.email);
  const draft=await call(general(b.id,{templateId:String(template.id)}),seller.cookie);
  const stored=await row(draft.id);
  assert.deepEqual([stored.channel,stored.destinationDetail,stored.recipient,stored.recipientName,stored.contactId],['social','instagram','@'+b.username,b.nombre,null],'Instagram drafts are business-level social rows');
  assert.equal(stored.body,`Hola ${b.nombre}, te escribo de Hospeda.\n\n¿Charlamos?`,'plain text: no HTML and no WhatsApp markup');
  assert.deepEqual([draft.instagramAutoConfirm,draft.instagramShared],[true,false],'read-only flags with the integration configured');
  // A second business with the same username flips instagramShared; nothing else of it is exposed.
  const twin=await db.insertInto('crmAccounts').values({nombre:'Zz IG gemelo '+run.slice(0,8),perfilInstagram:'@'+b.username}).returningAll().executeTakeFirstOrThrow();accountIds.push(String(twin.id));
  const shared=await call(general(b.id),seller.cookie);assert.equal(shared.instagramShared,true);const sharedJson=JSON.stringify(shared);assert.equal(new RegExp(`[:"\\[,]"?${twin.id}"?[,\\]}]`).test(sharedJson),false,'the twin id is not exposed');assert.equal(sharedJson.includes('IG gemelo'),false,'the twin name is not exposed');
  await db.updateTable('crmAccounts').set({perfilInstagram:null}).where('id','=',twin.id).execute();
  // Without the integration token the composer warns that it will not confirm on its own.
  await sql`UPDATE crm_integration_secrets SET expires_at=now()-interval '1 day' WHERE name='instagram'`.execute(db);
  assert.equal((await call(general(b.id),seller.cookie)).instagramAutoConfirm,false);
  await sql`UPDATE crm_integration_secrets SET expires_at=now()+interval '30 days' WHERE name='instagram'`.execute(db);

  const edited=await call({action:'edit',id:draft.id,revision:draft.revision,subject:'',body:'Hola *Sol*, ¿cómo va?'},seller.cookie);
  assert.equal((await row(draft.id)).textBody,'Hola *Sol*, ¿cómo va?');
  const opened=await call({action:'dispatch',id:draft.id,revision:edited.revision,confirm:true},seller.cookie);
  assert.equal(opened.username,b.username,'the server returns the validated username; the client picks chat or profile');assert.equal(opened.url,undefined);assert.equal(opened.message.status,'instagram_opened');
  const attempt=await row(draft.id);assert.equal(attempt.status,'instagram_opened');
  assert.equal((await activityResult(attempt.activityId))?.result,'Instagram abierto · envío no confirmado');
  const log=await journal(draft.id,'instagram_opened_unconfirmed');assert.equal(log.length,1);assert.deepEqual([log[0].actor,log[0].after?.recipient,log[0].after?.content],[seller.user.email,'@'+b.username,'Hola *Sol*, ¿cómo va?']);
  // A replay of dispatch changes nothing and opens nothing new.
  assert.equal((await call({action:'dispatch',id:draft.id,revision:edited.revision,confirm:true},seller.cookie)).username,undefined);

  // Waiting period: Hoy's pending outcomes skip the attempt for 15 minutes, then list it.
  // Spec 99 §3.6: an opened Instagram belongs to «Envíos sin confirmar» once the wait ends, never to «Anotá cómo salió».
  const pending=async()=>{const f=await pendingContactFollowUps(db,{ownerEmail:seller.user.email,isAdmin:false,accountId:b.id});assert(!f.outcomes.items.some(p=>p.status==='instagram_opened'));return f.unconfirmed.items;};
  assert.equal((await pending()).some(p=>p.id===draft.id),false,'an attempt waiting for the echo is not pending yet');
  await backdateOpen(draft.id,16);
  assert.equal((await pending()).some(p=>p.id===draft.id),true,'after 15 minutes it asks «¿Lo enviaste?» like WhatsApp');

  // outcome «No se envió» and «Sí, se envió».
  await call({action:'outcome',id:draft.id,event:'manual_not_sent',notes:''},seller.cookie);
  const notSent=await row(draft.id);assert.equal(notSent.status,'manual_not_done');assert.equal((await activityResult(notSent.activityId))?.result,'Instagram marcado como no enviado');
  const second=await openAttempt(b.id,'Segundo mensaje de prueba',seller.cookie);
  await call({action:'outcome',id:second.id,event:'manual_sent',notes:''},seller.cookie);assert.equal((await row(second.id)).status,'manual_sent');
  await call({action:'outcome',id:second.id,event:'manual_sent',notes:''},seller.cookie,400);// only an opened attempt is resolved
 }

 // ── Communication gates on every write path.
 {
  const b=await business('gates',seller.user.email),lead=await openLead(b.id,seller.user.email);
  // Management prepare with a template; the chosen person stays as context only.
  const contact=await db.insertInto('crmContacts').values({accountId:b.id,name:'Persona IG',phone:'+5493442000099'}).returningAll().executeTakeFirstOrThrow();
  const managed=await call({action:'prepare',id:randomUUID(),leadId:lead,contactId:String(contact.id),channel:'instagram',templateId:String(template.id)},seller.cookie);
  const managedRow=await row(managed.id);assert.deepEqual([managedRow.recipient,managedRow.contactId,managedRow.destinationDetail],['@'+b.username,String(contact.id),'instagram']);
  await call({action:'prepare',id:randomUUID(),leadId:lead,contactId:null,channel:'instagram',templateId:String(template.id)},other.cookie,403);// read access grants nothing
  await call(general(b.id),other.cookie,403);
  const draft=await call(general(b.id),seller.cookie);const reviewed=await call({action:'edit',id:draft.id,revision:draft.revision,subject:'',body:'Texto revisado'},seller.cookie);
  await call({action:'edit',id:draft.id,revision:reviewed.revision,subject:'',body:'x'},other.cookie,403);
  await call({action:'dispatch',id:draft.id,revision:reviewed.revision,confirm:true},other.cookie,403);
  const blocked=async(label:string,set:()=>Promise<unknown>,reset:()=>Promise<unknown>,status=403)=>{
   await set();
   await call(general(b.id),seller.cookie,status);
   await call({action:'prepare',id:randomUUID(),leadId:lead,contactId:null,channel:'instagram',templateId:null},seller.cookie,status);
   const current=await row(draft.id);const revision=(await sql<{revision:number}>`SELECT revision FROM crm_messages WHERE id=${draft.id}::uuid`.execute(db)).rows[0]!.revision;
   await call({action:'edit',id:draft.id,revision,subject:'',body:'Texto bloqueado'},seller.cookie,status);
   await call({action:'dispatch',id:draft.id,revision,confirm:true},seller.cookie,status);
   assert.equal((await row(draft.id)).status,current.status,label+': nothing changes');
   await reset();
  };
  await blocked('No contactar',()=>db.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',b.id).execute(),()=>db.updateTable('crmAccounts').set({doNotContact:false}).where('id','=',b.id).execute());
  for(const channel of ['social','all'])await blocked('restriction '+channel,()=>db.insertInto('crmContactRestrictions').values({accountId:b.id,channel,reason:'Zz restricción '+channel,actorEmail:admin.user.email,source:'manual'} as never).execute(),()=>sql`DELETE FROM crm_contact_restrictions WHERE account_id=${b.id}::bigint`.execute(db));
  await blocked('archived',()=>db.updateTable('crmAccounts').set({archivedAt:new Date()}).where('id','=',b.id).execute(),()=>db.updateTable('crmAccounts').set({archivedAt:null,status:'reviewed'} as never).where('id','=',b.id).execute());
  // A closed management refuses its own messages.
  const closedStage=(await db.selectFrom('crmStages').select('name').where('classification','=','won').executeTakeFirstOrThrow()).name;
  const closedLead=await openLead(b.id,seller.user.email);await sql`UPDATE leads SET estado=${closedStage} WHERE id=${closedLead}`.execute(db);
  await call({action:'prepare',id:randomUUID(),leadId:closedLead,contactId:null,channel:'instagram',templateId:null},seller.cookie,403);
  await call(general(b.id,{leadId:closedLead,purpose:null}),seller.cookie,403);
  // «Nuevo»: only the verification purpose.
  await db.updateTable('crmAccounts').set({status:'new',reviewStatus:null} as never).where('id','=',b.id).execute();
  await call(general(b.id),seller.cookie,403);await call(general(b.id,{purpose:'verification'}),seller.cookie);
  await db.updateTable('crmAccounts').set({status:'reviewed'} as never).where('id','=',b.id).execute();
  // Missing username: prepare refuses; a username changed after the draft refuses dispatch.
  const ready=await call(general(b.id),seller.cookie);const readyEdit=await call({action:'edit',id:ready.id,revision:ready.revision,subject:'',body:'Mensaje listo'},seller.cookie);
  await db.updateTable('crmAccounts').set({perfilInstagram:'otro_usuario_'+hex.slice(0,8)}).where('id','=',b.id).execute();
  const changed=await call({action:'dispatch',id:ready.id,revision:readyEdit.revision,confirm:true},seller.cookie,409);assert.equal(changed.error,'Cambió el Instagram del negocio. Prepará un nuevo borrador.');
  await db.updateTable('crmAccounts').set({perfilInstagram:'no es un perfil'}).where('id','=',b.id).execute();
  assert.equal((await call(general(b.id),seller.cookie,409)).error,'El negocio no tiene un usuario de Instagram válido.');
  await db.updateTable('crmAccounts').set({perfilInstagram:`https://www.instagram.com/${b.username}/`}).where('id','=',b.id).execute();
  // outcome gates: another seller cannot answer; No contactar refuses «Sí, se envió».
  const opened=await openAttempt(b.id,'Mensaje para responder',seller.cookie);
  await call({action:'outcome',id:opened.id,event:'manual_sent',notes:''},other.cookie,403);
  await db.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',b.id).execute();
  await call({action:'outcome',id:opened.id,event:'manual_sent',notes:''},seller.cookie,403);
  await db.updateTable('crmAccounts').set({doNotContact:false}).where('id','=',b.id).execute();
  // Delegation: the delegate prepares and opens from her task, and only from it.
  const task=await db.insertInto('crmTasks').values({accountId:b.id,leadId:lead,title:'Zz IG delegada',typeId:'message',assignedUserEmail:other.user.email,dueDate:'2026-11-05' as never,priority:'media'}).returningAll().executeTakeFirstOrThrow();
  const delegated=await call({action:'prepare',id:randomUUID(),leadId:lead,contactId:null,channel:'instagram',templateId:String(template.id),taskId:String(task.id)},other.cookie);
  const delegatedEdit=await call({action:'edit',id:delegated.id,revision:delegated.revision,subject:'',body:'Mensaje delegado',taskId:String(task.id)},other.cookie);
  await call({action:'dispatch',id:delegated.id,revision:delegatedEdit.revision,confirm:true},other.cookie,403);
  const delegatedOpen=await call({action:'dispatch',id:delegated.id,revision:delegatedEdit.revision,confirm:true,taskId:String(task.id)},other.cookie);assert.equal(delegatedOpen.message.status,'instagram_opened');
  assert.equal(String((await journal(delegated.id,'instagram_opened_unconfirmed'))[0].after?.delegatedTaskId),String(task.id));
 }

 // ── Webhook: an echo confirms the opened attempt, without a new row.
 {
  const b=await business('eco',seller.user.email),text=words('eco-'+run.slice(0,6));
  const {id}=await openAttempt(b.id,text,seller.cookie);
  const task=await db.insertInto('crmTasks').values({accountId:b.id,leadId:null,title:'Zz IG escribir',typeId:'message',assignedUserEmail:seller.user.email,dueDate:'2026-11-05' as never,priority:'media'}).returningAll().executeTakeFirstOrThrow();
  await sql`UPDATE crm_messages SET task_id=${task.id} WHERE id=${id}::uuid`.execute(db);
  const sent=text+' Saludos!';
  await echo(mid('resolve'),sent,b.igsid);
  const resolved=await row(id);
  assert.deepEqual([resolved.status,resolved.externalId,resolved.textBody,resolved.body,resolved.ownerEmail],['manual_sent',mid('resolve'),sent,text,seller.user.email]);
  assert.equal((await pendingContactFollowUps(db,{ownerEmail:seller.user.email,isAdmin:false,accountId:b.id})).outcomes.items.find(p=>p.id===id)?.externalId,mid('resolve'),'the pending outcome carries the echo mid for source labeling');
  assert.deepEqual((await socialRows(b.id)).map(r=>r.id),[id],'no echo row is inserted');
  assert.equal((await activityResult(resolved.activityId))?.result,'Envío confirmado por Instagram');assert.equal((await activityResult(resolved.activityId))?.actorEmail,seller.user.email);
  assert.equal((await db.selectFrom('crmTasks').select(['status','result']).where('id','=',task.id).executeTakeFirstOrThrow()).status,'completed');
  const log=await journal(id,'contact_resolved');assert.equal(log.length,1);
  assert.deepEqual([log[0].actor,log[0].automatic,log[0].triggeredBy,log[0].after?.source,log[0].after?.textEdited,log[0].after?.externalId],[null,true,'instagram-webhook','instagram_echo',true,mid('resolve')]);
  // Meta retries the same mid: nothing changes.
  await echo(mid('resolve'),sent,b.igsid);
  assert.equal((await socialRows(b.id)).length,1);assert.equal((await journal(id,'contact_resolved')).length,1);
 }

 // ── Two open attempts: the newest one with matching text wins; the other remains.
 {
  const b=await business('dos',seller.user.email),text=words('dos-'+run.slice(0,6));
  const older=await openAttempt(b.id,text,seller.cookie);await backdateOpen(older.id,120);
  const newer=await openAttempt(b.id,text,seller.cookie);
  await echo(mid('two'),text,b.igsid);
  assert.equal((await row(newer.id)).status,'manual_sent');assert.equal((await row(older.id)).status,'instagram_opened');
  assert.equal((await socialRows(b.id)).length,2);
 }

 // ── Different text, outside 24 h and no attempt: stored as a standalone echo, as today.
 {
  const b=await business('distinto',seller.user.email),text=words('distinto-'+run.slice(0,6));
  const {id}=await openAttempt(b.id,text,seller.cookie);
  await echo(mid('different'),'Hola! Te paso el link mañana temprano.',b.igsid);
  assert.equal((await row(id)).status,'instagram_opened');
  const rows=await socialRows(b.id);assert.equal(rows.length,2);assert.deepEqual([rows[1].owner,rows[1].status,rows[1].externalId],['instagram@hospeda','manual_sent',mid('different')]);
  await backdateOpen(id,25*60);
  await echo(mid('late'),text,b.igsid);
  assert.equal((await row(id)).status,'instagram_opened','an echo after 24 h never claims the attempt');
  const none=await business('sin-intento',seller.user.email);
  await echo(mid('none'),text,none.igsid);
  assert.deepEqual((await socialRows(none.id)).map(r=>r.owner),['instagram@hospeda']);
 }

 // ── L1: a manual «Red social» typed «instagram» never becomes a composer attempt, so an echo never claims it.
 {
  const b=await business('manual-red',seller.user.email),text=words('manualred-'+run.slice(0,6));
  const manual=await call({action:'manual_start',id:randomUUID(),accountId:b.id,leadId:null,contactId:null,channel:'social',purpose:'first_contact',otherPurpose:null,recipient:'@'+b.username,recipientName:b.nombre,destination:' Instagram ',body:text,result:null,templateId:null},seller.cookie);
  const stored=await row(manual.id);assert.equal(stored.destinationDetail,'Instagram (manual)');
  // A historical manual row stored before the fix with destination «instagram»: no open journal, so never a candidate.
  const legacy=randomUUID();
  await sql`INSERT INTO crm_messages(id,account_id,original_account_id,channel,destination_detail,recipient,recipient_name,body,text_body,owner_email,status,last_interaction_at) VALUES(${legacy}::uuid,${b.id},${b.id},'social','instagram',${'@'+b.username},${b.nombre},${text},${text},${seller.user.email},'manual_sent',now())`.execute(db);
  await echo(mid('manual-red'),text,b.igsid);
  assert.equal((await row(legacy)).externalId,null,'a manual record is not linked to the echo');
  assert.equal((await socialRows(b.id)).length,3,'the echo is stored on its own');
 }

 // ── M1: opened at T, sent at T+1, confirmed by hand at T+16; the echo arrives late with Meta's T+1 stamp: it links, no second row.
 {
  const b=await business('tarde',seller.user.email),text=words('tarde-'+run.slice(0,6));
  const late=await openAttempt(b.id,text,seller.cookie);
  const t=Date.now()-17*60_000;
  await sql`UPDATE crm_communication_journal SET created_at=${new Date(t)} WHERE entity_id=${late.id} AND action='instagram_opened_unconfirmed'`.execute(db);
  await sql`UPDATE crm_messages SET last_interaction_at=${new Date(t)} WHERE id=${late.id}::uuid`.execute(db);
  await call({action:'outcome',id:late.id,event:'manual_sent',notes:''},seller.cookie);// moves last_interaction_at to now (T+17)
  await echo(mid('late-hand'),text,b.igsid,{},t+60_000);
  assert.deepEqual([(await row(late.id)).status,(await row(late.id)).externalId],['manual_sent',mid('late-hand')]);
  assert.equal((await socialRows(b.id)).length,1,'a late echo never duplicates a send confirmed by hand');
  assert.equal((await journal(late.id,'contact_linked')).length,1);
 }

 // ── Hand-confirmed: the echo only links its mid. «No se envió»: the echo stays apart.
 {
  const b=await business('manual',seller.user.email),text=words('manual-'+run.slice(0,6));
  const confirmed=await openAttempt(b.id,text,seller.cookie);await call({action:'outcome',id:confirmed.id,event:'manual_sent',notes:''},seller.cookie);
  await echo(mid('linked'),text,b.igsid);
  const linked=await row(confirmed.id);assert.deepEqual([linked.status,linked.externalId,linked.textBody],['manual_sent',mid('linked'),text]);
  assert.equal((await socialRows(b.id)).length,1);assert.equal((await journal(confirmed.id,'contact_linked'))[0]?.triggeredBy,'instagram-webhook');
  const c=await business('no-enviado',seller.user.email),other2=words('noenviado-'+run.slice(0,6));
  const refused=await openAttempt(c.id,other2,seller.cookie);await call({action:'outcome',id:refused.id,event:'manual_not_sent',notes:''},seller.cookie);
  await echo(mid('refused'),other2,c.igsid);
  assert.deepEqual([(await row(refused.id)).status,(await row(refused.id)).externalId],['manual_not_done',null],'the seller answer is never rewritten');
  assert.equal((await socialRows(c.id)).length,2);
 }

 // ── Shared username: the chat is unmatched, so nothing resolves.
 {
  const b=await business('compartido',seller.user.email),text=words('compartido-'+run.slice(0,6));
  const {id}=await openAttempt(b.id,text,seller.cookie);
  const twin=await db.insertInto('crmAccounts').values({nombre:'Zz IG compartido 2 '+run.slice(0,8),perfilInstagram:'@'+b.username}).returningAll().executeTakeFirstOrThrow();accountIds.push(String(twin.id));
  await echo(mid('shared'),text,b.igsid);
  assert.equal((await row(id)).status,'instagram_opened');
  const unmatched=(await sql<{status:string;accountId:string|null}>`SELECT status,account_id::text AS "accountId" FROM crm_inbound_messages WHERE external_id=${mid('shared')}`.execute(db)).rows;
  assert.deepEqual(unmatched,[{status:'unmatched',accountId:null}]);
 }

 // ── The owner lost access, or No contactar was set after the open: the echo still resolves (system path) and answers 200.
 {
  const lost=await business('sin-acceso',seller.user.email),text=words('acceso-'+run.slice(0,6));
  const {id}=await openAttempt(lost.id,text,seller.cookie);
  await db.updateTable('crmAccounts').set({assignedUserEmail:other.user.email}).where('id','=',lost.id).execute();
  await echo(mid('lost'),text,lost.igsid);
  assert.equal((await row(id)).status,'manual_sent');assert.equal((await row(id)).ownerEmail,seller.user.email,'the attempt keeps its owner');
  const dnc=await business('dnc',seller.user.email,{isClient:false} as Record<string,unknown>),dncText=words('dnc-'+run.slice(0,6));
  const care=await call(general(dnc.id,{purpose:'care',confirmedClient:true}),seller.cookie);const careEdit=await call({action:'edit',id:care.id,revision:care.revision,subject:'',body:dncText},seller.cookie);await call({action:'dispatch',id:care.id,revision:careEdit.revision,confirm:true},seller.cookie);
  await db.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',dnc.id).execute();
  await echo(mid('dnc'),dncText,dnc.igsid);
  assert.equal((await row(care.id)).status,'manual_sent','receiving the echo is not blocked by No contactar');
  assert.equal((await db.selectFrom('crmAccounts').select('isClient').where('id','=',dnc.id).executeTakeFirstOrThrow()).isClient,false,'D4: the webhook never marks a No contactar business as client');
 }

 // ── A forced error in the resolution step: the echo is stored on its own and Meta gets 200.
 {
  const b=await business('error',seller.user.email),text=words('error-'+run.slice(0,6));
  const {id}=await openAttempt(b.id,text,seller.cookie);
  await echo(mid('boom'),text,b.igsid,{echoResolver:async()=>{throw new Error('forced resolution error');}});
  assert.equal((await row(id)).status,'instagram_opened');
  const rows=await socialRows(b.id);assert.deepEqual(rows.map(r=>r.owner),[seller.user.email,'instagram@hospeda']);
  assert(warnings.some(w=>w.includes('Instagram echo resolution failed')));
 }

 // ── Echo first, then «Abrir Instagram» within 10 minutes: one row, the echo is voided, the composer is told.
 {
  const b=await business('eco-antes',seller.user.email),text=words('antes-'+run.slice(0,6));
  await echo(mid('early'),text,b.igsid);
  const early=(await socialRows(b.id))[0]!;assert.equal(early.owner,'instagram@hospeda');
  const draft=await call(general(b.id),seller.cookie);const edited=await call({action:'edit',id:draft.id,revision:draft.revision,subject:'',body:text},seller.cookie);
  const answer=await call({action:'dispatch',id:draft.id,revision:edited.revision,confirm:true},seller.cookie);
  assert.equal(answer.alreadyConfirmed,true);assert.equal(answer.username,undefined,'nothing is opened');
  const attempt=await row(draft.id);assert.deepEqual([attempt.status,attempt.externalId],['manual_sent',mid('early')]);
  const voided=(await socialRows(b.id)).find(r=>r.id===early.id)!;assert.deepEqual([voided.status,voided.externalId],['voided',null]);
  assert.match(String((await journal(early.id,'interaction_voided'))[0]?.after?.reason),/^Unido al intento .+ abierto desde el CRM$/);
  assert.equal((await journal(draft.id,'contact_resolved'))[0]?.after?.source,'instagram_echo_earlier');
  await echo(mid('early'),text,b.igsid);// Meta retry: still a no-op
  assert.equal((await socialRows(b.id)).length,2);
 }
 console.log('Instagram open chat: prepare/edit/dispatch/outcome with every gate, flags, waiting period, echo resolution, retries, two attempts, different text, 24 h window, hand-confirmed link, «No se envió», shared username, lost access, No contactar, forced error, echo-first merge, late echo after a hand confirmation and manual «instagram» records passed');
}catch(error){console.error(error);process.exitCode=1;}finally{
 console.warn=old.warn;
 try{
  await cleanupThenRestore({onCleanupError:error=>{console.error('Fixture cleanup failed',error);process.exitCode=1;},restore:()=>restoreInstagramSecret({query:secretQuery,snapshot:secretSnapshot}),cleanup:async()=>{
  if(typeof outcomeSince==='string')await sql`UPDATE app_settings SET value=${outcomeSince} WHERE key='crm_contact_outcome_since'`.execute(db);
  if(accountIds.length){
   await sql`DELETE FROM crm_communication_journal WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db);
   for(const table of ['crm_work_journal','crm_communication_reads','crm_auto_registrations','crm_data_evidence'])await sql.raw(`DELETE FROM ${table} WHERE account_id=ANY('{${accountIds.join(',')}}'::bigint[])`).execute(db);
   await sql`DELETE FROM crm_messages WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db);
   await sql`DELETE FROM crm_activities WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db);
   await sql`DELETE FROM crm_tasks WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db);
   await sql`DELETE FROM crm_inbound_messages WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db);
   await sql`DELETE FROM crm_contact_restrictions WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db);
   await sql`DELETE FROM crm_contacts WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db);
   for(const table of ['lead_journal','crm_pipeline_events','crm_objections'])await sql.raw(`DELETE FROM ${table} WHERE account_id=ANY('{${accountIds.join(',')}}'::bigint[])`).execute(db);
   await sql`DELETE FROM leads WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db);
   await sql`DELETE FROM crm_commercial_journal WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db);
   // Deleting tasks and activities writes crm_work_journal rows, so it goes last.
   await sql`DELETE FROM crm_work_journal WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db);
   await sql`DELETE FROM crm_accounts WHERE id=ANY(${accountIds}::bigint[])`.execute(db);
  }
  const like='%-'+run;await sql`DELETE FROM crm_inbound_messages WHERE external_id LIKE ${like}`.execute(db);
  if(igsids.length)await sql`DELETE FROM crm_instagram_contacts WHERE igsid=ANY(${igsids})`.execute(db);
  if(templateIds.length)await sql`DELETE FROM message_templates WHERE id=ANY(${templateIds}::bigint[])`.execute(db);
  if(userEmails.length){await sql`DELETE FROM sessions WHERE id=ANY(${userEmails})`.execute(db);await sql`DELETE FROM users WHERE email=ANY(${userEmails})`.execute(db);}
  }});
 }finally{globalThis.fetch=old.fetch;for(const [name,value] of Object.entries({INSTAGRAM_APP_SECRET:old.secret,INSTAGRAM_ACCOUNT_ID:old.account,INTEGRATION_SECRETS_KEY:old.key}))if(value===undefined)delete process.env[name];else process.env[name]=value;await db.destroy();}
}
