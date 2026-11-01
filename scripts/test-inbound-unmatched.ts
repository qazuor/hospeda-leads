import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import superjson from 'superjson';
import {sql,CompiledQuery} from 'kysely';
import {db} from '../src/helpers/db';
import {encryptInstagramToken} from '../src/helpers/instagram';
import {assignPOST,dismissPOST,rescanPOST,restorePOST,unmatchedGET} from '../src/endpoints/inbound';
import postgres from 'postgres';
import {RESCAN_LOCK_KEY,rescanUnmatched} from '../src/helpers/inboundUnmatched';
import {globalHistory} from '../src/helpers/globalHistoryServer';
import {setServerSession} from '../src/helpers/getSetServerSession';
import type {UnmatchedGroup,UnmatchedList} from '../src/helpers/inboundUnmatchedShared';
import {NO_SECRET_SNAPSHOT,assertLocalTestDatabase,restoreInstagramSecret,snapshotInstagramSecret,type SecretQuery} from './lib/instagram-secret';

// Spec 103 D1–D5: «Mensajes sin asociar» by conversation, dismiss/restore, storing the address (D4) and «Volver a buscar negocios» (D5).
assertLocalTestDatabase({url:process.env.DATABASE_URL,optIn:process.env.CRM_TEST_DATABASE});
const run=randomUUID().slice(0,8),key=Buffer.alloc(32,9),oldKey=process.env.INTEGRATION_SECRETS_KEY,oldFetch=globalThis.fetch;
process.env.INTEGRATION_SECRETS_KEY=key.toString('base64');
const secretQuery:SecretQuery=async(text,params=[])=>(await db.executeQuery(CompiledQuery.raw(text,[...params]))).rows as Record<string,unknown>[];
let snapshot=NO_SECRET_SNAPSHOT;
// Meta is mocked: profiles answer from `profiles` (igsid -> username); anything else fails. No test reaches the network.
const profiles=new Map<string,string>(),calls:string[]=[];
globalThis.fetch=(async(input:Parameters<typeof fetch>[0])=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);assert.equal(url.hostname,'graph.instagram.com','tests never reach a real host');const id=decodeURIComponent(url.pathname.slice(1));calls.push(id);const name=profiles.get(id);return name?Response.json({username:name,name:'Fixture'}):Response.json({},{status:500});}) as typeof fetch;

async function identity(role:'admin'|'user'){const u=await db.insertInto('users').values({email:`unmatched-${role}-${randomUUID()}@example.com`,displayName:`${role} ${run}`,role}).returningAll().executeTakeFirstOrThrow();const s={id:u.email,createdAt:Date.now(),lastAccessed:Date.now()};await db.insertInto('sessions').values({id:s.id,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();const r=new Response();await setServerSession(r,s);return {user:u,cookie:r.headers.get('set-cookie')!.split(';')[0]};}
const parse=async(r:Response)=>superjson.parse<any>(await r.text());
const post=(fn:(r:Request)=>Promise<Response>,path:string)=>async(body:unknown,cookie:string)=>fn(new Request('http://localhost/_api/inbound/'+path,{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify(body)}));
const assign=post(assignPOST,'assign'),dismiss=post(dismissPOST,'unmatched/dismiss'),restore=post(restorePOST,'unmatched/restore'),rescan=post(rescanPOST,'unmatched/rescan');
const list=async(cookie:string,query='')=>{const r=await unmatchedGET(new Request('http://localhost/_api/inbound/unmatched'+query,{headers:{cookie}}));assert.equal(r.status,200,await r.clone().text());return await parse(r) as UnmatchedList;};
const card=(l:UnmatchedList,address:string):UnmatchedGroup|undefined=>l.groups.find(g=>g.address.toLowerCase()===address.toLowerCase());
const DMARC=(domain:string)=>`mx.cloudflare.net; dmarc=pass header.from=${domain}`;
// Fixture messages are dated in the future so they are the newest cards (listing and D5 go newest first).
let minute=0;const soon=()=>new Date(Date.now()+86400000+(++minute)*60000);
async function email(from:string,extra:{verified?:boolean;subject?:string}={}){const id=randomUUID();const domain=from.split('@')[1];await sql`INSERT INTO crm_inbound_messages(id,channel,external_id,match_method,from_address,from_name,subject,text_body,headers,received_at,status,source) VALUES(${id}::uuid,'email',${'um-'+id},'none',${from},'Remitente',${extra.subject??'Consulta'},'Hola',${JSON.stringify(extra.verified?{authenticationResults:DMARC(domain)}:{})}::text::jsonb,${soon()},'unmatched','email_worker')`.execute(db);return id;}
async function instagram(igsid:string,address:string,echo=false){const id=randomUUID();await sql`INSERT INTO crm_inbound_messages(id,channel,channel_detail,external_id,match_method,from_address,from_name,text_body,received_at,status,source,is_outgoing,instagram_igsid) VALUES(${id}::uuid,'social','instagram',${'um-'+id},'none',${address},'',${echo?'Respuesta':'Hola'},${soon()},'unmatched','instagram_webhook',${echo},${igsid})`.execute(db);return id;}
const row=async(id:string)=>(await sql<{status:string;accountId:string|null;contactId:string|null;matchMethod:string;responseId:string|null;fromAddress:string}>`SELECT status,account_id::text AS "accountId",contact_id::text AS "contactId",match_method AS "matchMethod",response_id::text AS "responseId",from_address AS "fromAddress" FROM crm_inbound_messages WHERE id=${id}::uuid`.execute(db)).rows[0];
const matchedJournal=async(id:string)=>Number((await sql<{n:string}>`SELECT count(*)::text n FROM crm_communication_journal WHERE entity_type='inbound' AND entity_id=${id} AND action='inbound_matched'`.execute(db)).rows[0].n);
const resourceJournal=async(id:string,action:string)=>(await sql<{reason:string|null;actor:string|null}>`SELECT after_value->>'reason' AS reason,actor_email AS actor FROM crm_resource_journal WHERE entity='crm_inbound_messages' AND entity_id=${id} AND action=${action} ORDER BY id`.execute(db)).rows;
const business=async(over:Record<string,unknown>={})=>db.insertInto('crmAccounts').values({nombre:`Zz unmatched ${run} ${randomUUID().slice(0,6)}`,ciudad:'Colón',...over}).returningAll().executeTakeFirstOrThrow();
const tag=(t:string)=>`u${t}${run}`.toLowerCase();

const admin=await identity('admin'),seller=await identity('user');
try{
 snapshot=await snapshotInstagramSecret({query:secretQuery});
 const enc=encryptInstagramToken('unmatched-token-'+run,key);
 await sql`INSERT INTO crm_integration_secrets(name,ciphertext,iv,tag,expires_at,refreshed_at) VALUES('instagram',${enc.ciphertext},${enc.iv},${enc.tag},now()+interval '30 days',now()) ON CONFLICT(name) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,tag=excluded.tag,expires_at=excluded.expires_at,refreshed_at=excluded.refreshed_at,last_error=NULL`.execute(db);
 const openStage=(await sql<{name:string}>`SELECT name FROM crm_stages WHERE classification='open' ORDER BY name LIMIT 1`.execute(db)).rows[0];

 // Every action is admin only.
 {const someId=await email(`perm-${run}@example.test`);
  assert.equal((await unmatchedGET(new Request('http://localhost/_api/inbound/unmatched',{headers:{cookie:seller.cookie}}))).status,403);
  const target=await business();
  for(const [name,r] of [['assign',await assign({ids:[someId],accountId:String(target.id)},seller.cookie)],['dismiss',await dismiss({ids:[someId],reason:'spam'},seller.cookie)],['restore',await restore({ids:[someId]},seller.cookie)],['rescan',await rescan({},seller.cookie)]] as const)assert.equal(r.status,403,`${name} is admin only`);
  assert.equal((await row(someId)).status,'unmatched','nothing moves for a seller');
  for(const q of ['?view=nope','?channel=fax'])assert.equal((await unmatchedGET(new Request('http://localhost/_api/inbound/unmatched'+q,{headers:{cookie:admin.cookie}}))).status,400,`an invalid ${q} is a 400, not a 500`);}

 // D1/D2: one card per sender with every message, one per Instagram chat; exact suggestion from the stored email / Instagram.
 const sender=`ana-${run}@cabanas-${run}.test`,igUser=tag('ig');
 const known=await business({email:sender});await db.insertInto('leads').values({accountId:known.id,nombre:known.nombre,estado:openStage.name}).execute();
 const igBusiness=await business({perfilInstagram:'@'+igUser});
 const e1=await email(sender,{subject:'Primera'}),e2=await email(sender.toUpperCase(),{subject:'Segunda'}),e3=await email(sender,{subject:'Tercera'});
 const igsid=`9${Date.now()}1`,i1=await instagram(igsid,'@'+igUser),i2=await instagram(igsid,'@'+igUser,true);
 {const l=await list(admin.cookie);const c=card(l,sender)!;
  assert.deepEqual(new Set(c.messages.map(m=>m.id)),new Set([e1,e2,e3]),'one card per sender with all its messages');
  assert.equal(c.suggestions[0].accountId,String(known.id));assert.equal(c.suggestions[0].reason,'email_account');assert.equal(c.suggestions[0].exact,true);assert.ok(c.suggestions[0].openLeadId,'the only open management is offered');
  const ig=card(l,'@'+igUser)!;assert.deepEqual(new Set(ig.messages.map(m=>m.id)),new Set([i1,i2]));assert.equal(ig.channel,'instagram');assert.deepEqual([ig.suggestions[0].accountId,ig.suggestions[0].exact,ig.suggestions[0].instagramEmpty],[String(igBusiness.id),true,false]);
  assert.ok(l.total>=2);
  const onlyIg=await list(admin.cookie,'?channel=instagram');assert.ok(onlyIg.groups.every(g=>g.channel==='instagram'));assert.ok(card(onlyIg,'@'+igUser));}

 // D2: associating applies to the ticked messages only; an id that is no longer unmatched is reported, the rest move. Never a response.
 {const already=await email(`gone-${run}@example.test`);await sql`UPDATE crm_inbound_messages SET status='dismissed' WHERE id=${already}::uuid`.execute(db);
  const r=await assign({ids:[e1,e2,already],accountId:String(known.id)},admin.cookie);const d=await parse(r);assert.equal(r.status,200,JSON.stringify(d));
  assert.deepEqual([d.movedCount,d.skipped],[2,1]);
  for(const id of [e1,e2]){const m=await row(id);assert.deepEqual([m.status,m.accountId,m.matchMethod,m.responseId],['pending_review',String(known.id),'manual',null]);assert.equal(await matchedJournal(id),1);}
  assert.equal((await row(e3)).status,'unmatched','an unticked message stays');assert.equal((await row(already)).status,'dismissed');
  const none=await assign({ids:[already],accountId:String(known.id)},admin.cookie);assert.equal(none.status,400);assert.match((await parse(none)).error,/ya se asociaron o se descartaron/);}

 // Regression: the screen posts SuperJSON (`postJson`), the scripts post plain JSON; both must work for every action.
 {const sj=await email(`superjson-${run}@example.test`),target=await business();
  const r=await assignPOST(new Request('http://localhost/_api/inbound/assign',{method:'POST',headers:{cookie:admin.cookie,'Content-Type':'application/json'},body:superjson.stringify({ids:[sj],accountId:String(target.id),leadId:null,contactId:null})}));assert.equal(r.status,200,await r.clone().text());assert.equal((await row(sj)).status,'pending_review');
  const d=await email(`superjson-d-${run}@example.test`);const r2=await dismissPOST(new Request('http://localhost/_api/inbound/unmatched/dismiss',{method:'POST',headers:{cookie:admin.cookie,'Content-Type':'application/json'},body:superjson.stringify({ids:[d],reason:'spam',detail:null})}));assert.equal(r2.status,200,await r2.clone().text());
  const r3=await restorePOST(new Request('http://localhost/_api/inbound/unmatched/restore',{method:'POST',headers:{cookie:admin.cookie,'Content-Type':'application/json'},body:superjson.stringify({ids:[d]})}));assert.equal(r3.status,200,await r3.clone().text());}

 // D4 Instagram: stored only when the business has none, never overwritten; a No contactar duplicate blocks and nothing moves.
 {const user=tag('save'),sid=`9${Date.now()}2`,m1=await instagram(sid,'@'+user),m2=await instagram(sid,'@'+user,true);
  const dnc=await business({perfilInstagram:'@'+user,doNotContact:true}),empty=await business();
  const blocked=await assign({ids:[m1],accountId:String(empty.id),saveAddress:true},admin.cookie);assert.equal(blocked.status,400,'a No contactar duplicate blocks the save');assert.equal((await row(m1)).status,'unmatched','and the association with it');
  assert.equal((await db.selectFrom('crmAccounts').select('perfilInstagram').where('id','=',empty.id).executeTakeFirstOrThrow()).perfilInstagram,null);
  await db.updateTable('crmAccounts').set({doNotContact:false,perfilInstagram:'@otro'+run}).where('id','=',dnc.id).execute();
  const ok=await assign({ids:[m1],accountId:String(empty.id),saveAddress:true},admin.cookie);const d=await parse(ok);assert.equal(ok.status,200,JSON.stringify(d));
  assert.deepEqual([d.savedAddress,d.associatedChat,d.movedCount],['instagram',true,2],'the whole chat moves and the user is stored');
  assert.equal((await db.selectFrom('crmAccounts').select('perfilInstagram').where('id','=',empty.id).executeTakeFirstOrThrow()).perfilInstagram,`https://www.instagram.com/${user}/`);
  assert.equal((await row(m2)),undefined,'the echo became a sent message');
  const meta=(await sql<{source:string|null;after:string|null;profile:string|null}>`SELECT metadata->>'source' AS source,jsonb_typeof(metadata->'after') AS after,metadata->'after'->>'perfilInstagram' AS profile FROM crm_commercial_journal WHERE account_id=${empty.id} AND action='account_updated'`.execute(db)).rows;
  assert.deepEqual(meta,[{source:'inbound_unmatched',after:'object',profile:`https://www.instagram.com/${user}/`}],'journal like a business edit: metadata is a jsonb object, not a JSON string');
  const filled=await business({perfilInstagram:'@ya'+run}),m3=await instagram(`9${Date.now()}3`,'@'+tag('other'));
  const kept=await parse(await assign({ids:[m3],accountId:String(filled.id),saveAddress:true},admin.cookie));assert.equal(kept.savedAddress,null);
  assert.equal((await db.selectFrom('crmAccounts').select('perfilInstagram').where('id','=',filled.id).executeTakeFirstOrThrow()).perfilInstagram,'@ya'+run,'never overwrites');}

 // D4 Instagram, user known only from Meta's cache (message stored with the IGSID): the card offers it and the save stores it.
 {const user=tag('cache'),sid=`9${Date.now()}4`,m=await instagram(sid,sid);await sql`INSERT INTO crm_instagram_contacts(igsid,username,name,fetched_at) VALUES(${sid},${user},'Cache',now())`.execute(db);
  const target=await business();const c=card(await list(admin.cookie),'@'+user)!;assert.equal(c.instagramUsername,user,'the card names the chat by the cached user');
  const r=await assign({ids:[m],accountId:String(target.id),saveAddress:true},admin.cookie);const d=await parse(r);assert.equal(r.status,200,JSON.stringify(d));assert.equal(d.savedAddress,'instagram');
  assert.equal((await db.selectFrom('crmAccounts').select('perfilInstagram').where('id','=',target.id).executeTakeFirstOrThrow()).perfilInstagram,`https://www.instagram.com/${user}/`);}

 // D4: an @usuario or email another live business already has is never stored (the matching needs exactly one business); the card says where.
 {const user=tag('owned'),sid=`9${Date.now()}5`,m=await instagram(sid,'@'+user),owner=await business({perfilInstagram:`https://www.instagram.com/${user}/`}),target=await business();
  const c=card(await list(admin.cookie),'@'+user)!;assert.deepEqual(c.addressOwners.map(o=>o.accountId),[String(owner.id)]);
  const r=await assign({ids:[m],accountId:String(target.id),saveAddress:true},admin.cookie);assert.equal(r.status,400);assert.equal((await parse(r)).error,`Ese @${user} ya está en H${owner.id} · ${owner.nombre} · Colón.`);
  assert.equal((await row(m)).status,'unmatched','the association rolls back with it');assert.equal((await db.selectFrom('crmAccounts').select('perfilInstagram').where('id','=',target.id).executeTakeFirstOrThrow()).perfilInstagram,null);
  const plain=await assign({ids:[m],accountId:String(target.id)},admin.cookie);assert.equal(plain.status,200,'associating without storing still works');
  const from=`owned-${run}@shared-${run}.test`,v=await email(from,{verified:true}),holder=await business(),other=await business();await db.insertInto('crmContacts').values({accountId:holder.id,name:'Holder',email:from}).execute();
  const er=await assign({ids:[v],accountId:String(other.id),saveAddress:true},admin.cookie);assert.equal(er.status,400);assert.match((await parse(er)).error,new RegExp(`Ese email ya está en H${holder.id}`));assert.equal((await row(v)).status,'unmatched');}

 // D4 email: only a verified sender; to the chosen empty person, else to the empty business.
 {const from=`marta-${run}@hotel-${run}.test`,unverified=await email(from),verified=await email(from,{verified:true});
  const target=await business(),person=await db.insertInto('crmContacts').values({accountId:target.id,name:'Marta'}).returningAll().executeTakeFirstOrThrow();
  const refused=await assign({ids:[unverified],accountId:String(target.id),saveAddress:true},admin.cookie);assert.equal(refused.status,400);assert.match((await parse(refused)).error,/no está verificado/);assert.equal((await row(unverified)).status,'unmatched');
  const toPerson=await parse(await assign({ids:[verified],accountId:String(target.id),contactId:String(person.id),saveAddress:true},admin.cookie));assert.equal(toPerson.savedAddress,'email');
  assert.equal((await db.selectFrom('crmContacts').select('email').where('id','=',person.id).executeTakeFirstOrThrow()).email,from);assert.equal((await row(verified)).contactId,String(person.id));
  const other=`luis-${run}@posada-${run}.test`,v2=await email(other,{verified:true}),noEmail=await business();
  assert.equal((await parse(await assign({ids:[v2],accountId:String(noEmail.id),saveAddress:true},admin.cookie))).savedAddress,'email');
  assert.equal((await db.selectFrom('crmAccounts').select('email').where('id','=',noEmail.id).executeTakeFirstOrThrow()).email,other);
  const upper=`Rosa-${run}@Quinta-${run}.test`,v3=await email(upper,{verified:true}),blank=await business({email:'  '});
  assert.equal((await parse(await assign({ids:[v3],accountId:String(blank.id),saveAddress:true},admin.cookie))).savedAddress,'email','a blank field counts as empty');
  assert.equal((await db.selectFrom('crmAccounts').select('email').where('id','=',blank.id).executeTakeFirstOrThrow()).email,upper.toLowerCase(),'stored trimmed and lower-case, like the edit path');}

 // D3: dismiss with a reason, listed in «Descartados», restorable; associated messages are never dismissed.
 {const spam=`promo-${run}@spam-${run}.test`,s1=await email(spam),s2=await email(spam);
  const noReason=await dismiss({ids:[s1],reason:'other'},admin.cookie);assert.equal(noReason.status,400);assert.match((await parse(noReason)).error,/motivo/);
  const r=await dismiss({ids:[s1,s2,e1],reason:'other',detail:'Proveedor de software'},admin.cookie);const d=await parse(r);assert.equal(r.status,200,JSON.stringify(d));assert.deepEqual([d.dismissed,d.skipped],[2,1]);
  assert.equal((await row(e1)).status,'pending_review','an associated message is not dismissed');
  for(const id of [s1,s2]){const m=await row(id);assert.deepEqual([m.status,m.accountId],['dismissed',null]);const j=await resourceJournal(id,'inbound_dismissed');assert.equal(j.length,1);assert.deepEqual([j[0].reason,j[0].actor],['Otro: Proveedor de software',admin.user.email]);}
  assert.equal(card(await list(admin.cookie),spam),undefined,'gone from «Sin asociar»');
  const gone=card(await list(admin.cookie,'?view=dismissed'),spam)!;assert.equal(gone.messages.length,2);assert.equal(gone.dismissal?.reason,'Otro: Proveedor de software');assert.equal(gone.dismissal?.by,admin.user.displayName);
  const back=await restore({ids:[s1,s2]},admin.cookie);assert.equal(back.status,200);assert.equal((await parse(back)).restored,2);
  for(const id of [s1,s2]){assert.equal((await row(id)).status,'unmatched');assert.equal((await resourceJournal(id,'inbound_restored')).length,1);}
  const again=await restore({ids:[s1]},admin.cookie);assert.equal(again.status,400,'restoring twice is refused');
  for(const action of ['resource_inbound_dismissed','resource_inbound_restored']){const h=await globalHistory({action,page:1,pageSize:100});const mine=h.rows.filter(x=>x.actorEmail===admin.user.email);assert.ok(mine.length>=2,action);assert.ok(mine.every(x=>x.leadName==='Mensajes sin asociar'),`${action} is shown under «Mensajes sin asociar»`);assert.ok(h.filters.actions.includes(action));}}

 // D5: the automatic rules again. An IGSID chat whose user Meta now returns and is stored in one business is associated; an ambiguous one is not;
 // a verified email stored in one business is associated, an unverified one is not. Meta lookups are capped per click.
 {const user=tag('scan'),amb=tag('amb'),sidOk=`8${Date.now()}1`,sidAmb=`8${Date.now()}2`,sidNone=`8${Date.now()}3`;
  profiles.set(sidOk,user);profiles.set(sidAmb,amb);
  const target=await business({perfilInstagram:`https://instagram.com/${user}`});await business({perfilInstagram:'@'+amb});await business({perfilInstagram:amb});
  const ok1=await instagram(sidOk,sidOk),ok2=await instagram(sidOk,sidOk,true),ambRow=await instagram(sidAmb,sidAmb),noneRow=await instagram(sidNone,sidNone);
  const mailFrom=`dueño-${run}@estancia-${run}.test`.replace('ñ','n'),mailTarget=await business({email:mailFrom}),mv=await email(mailFrom,{verified:true}),mu=await email(`x-${run}@estancia-${run}.test`),stored=await business({email:`x-${run}@estancia-${run}.test`});
  // Cap: with one lookup left only the newest IGSID chat reaches Meta; the rest wait for the next click.
  const before=calls.length;const capped=await rescanUnmatched({user:{id:Number(admin.user.id),email:admin.user.email,displayName:admin.user.displayName,fullName:null,avatarUrl:null,role:'admin'},lookups:1});
  assert.equal(calls.length-before,1,'only one lookup reached Meta');assert.equal(capped.lookups,1);assert.ok(capped.lookupsPending>=2,'the other IGSID chats are left for the next click');assert.ok(capped.associated>=1,'emails need no lookup: the verified one is associated on the first click');assert.equal((await row(ok1)).status,'unmatched','a chat left without a lookup is not associated yet');
  const r=await rescan({},admin.cookie);const d=await parse(r);assert.equal(r.status,200,JSON.stringify(d));assert.ok(d.associated>=1);assert.ok(d.lookups<=50);assert.equal(typeof d.remaining,'number');
  const m=await row(ok1);assert.deepEqual([m.status,m.accountId,m.matchMethod,m.fromAddress],['pending_review',String(target.id),'instagram_handle','@'+user]);assert.equal(await row(ok2),undefined,'the echo became a sent message');
  const a=await row(ambRow);assert.deepEqual([a.status,a.fromAddress],['unmatched','@'+amb],'ambiguous stays, now named by its user');
  assert.deepEqual([(await row(noneRow)).status,(await row(noneRow)).fromAddress],['unmatched',sidNone]);
  const e=await row(mv);assert.deepEqual([e.status,e.accountId,e.matchMethod],['pending_review',String(mailTarget.id),'sender_email']);
  assert.equal((await row(mu)).status,'unmatched','an unverified sender is never associated automatically');void stored;
  const cached=calls.length;await rescan({},admin.cookie);assert.ok(!calls.slice(cached).some(c=>c===sidOk||c===sidAmb),'a chat named by its user is not looked up again');}

 // D5 deadline: the whole click stops in time and reports what is left; nothing is half-done and the lock is released.
 {const adminUser={id:Number(admin.user.id),email:admin.user.email,displayName:admin.user.displayName,fullName:null,avatarUrl:null,role:'admin' as const};
  const pending=await email(`late-${run}@late-${run}.test`,{verified:true});await business({email:`late-${run}@late-${run}.test`});
  const out=await rescanUnmatched({user:adminUser,deadlineMs:0});assert.equal(out.associated,0);assert.ok(out.unchecked>=1&&out.unchecked===out.remaining,'every card is left for the next click');
  assert.equal((await row(pending)).status,'unmatched');
  // Concurrency: another session holds the rescan lock (a click still running on another connection or process) -> 409, nothing touched.
  const other=postgres(process.env.DATABASE_URL!,{max:1,path:process.env.CRM_TEST_DATABASE_SOCKET});
  try{await other`SELECT pg_advisory_lock(${RESCAN_LOCK_KEY})`;const busy=await rescan({},admin.cookie);assert.equal(busy.status,409);assert.equal((await parse(busy)).error,'Ya hay una búsqueda en curso. Esperá a que termine.');assert.equal((await row(pending)).status,'unmatched');await other`SELECT pg_advisory_unlock(${RESCAN_LOCK_KEY})`;}finally{await other.end();}
  const next=await rescan({},admin.cookie);assert.equal(next.status,200,'the lock is free again');assert.equal((await row(pending)).status,'pending_review');
  // Instagram echo moved by the rescan goes to the business's only open management, as the webhook does.
  const user=tag('echo'),sid=`7${Date.now()}1`;profiles.set(sid,user);const owner=await business({perfilInstagram:'@'+user});const lead=await db.insertInto('leads').values({accountId:owner.id,nombre:owner.nombre,estado:openStage.name}).returning('id').executeTakeFirstOrThrow();
  const inc=await instagram(sid,sid),echo=await instagram(sid,sid,true);const r=await rescan({},admin.cookie);assert.equal(r.status,200);
  assert.deepEqual([(await row(inc)).status,(await row(inc)).accountId],['pending_review',String(owner.id)]);assert.equal(await row(echo),undefined);
  const sent=(await sql<{leadId:string|null}>`SELECT lead_id::text AS "leadId" FROM crm_messages WHERE account_id=${owner.id} AND channel='social' AND status='manual_sent'`.execute(db)).rows;assert.deepEqual(sent,[{leadId:String(lead.id)}]);}

 // Nothing associated here is a response, a task or a stage change.
 assert.equal(Number((await sql<{n:string}>`SELECT count(*)::text n FROM crm_inbound_messages WHERE external_id LIKE 'um-%' AND (response_id IS NOT NULL OR status='registered')`.execute(db)).rows[0].n),0);
 console.log('Inbound unmatched (spec 103 D1–D5): admin-only actions, cards by conversation with suggestions, ticked association, address saving without overwriting, dismiss/restore with reason, rescan with capped Meta lookups passed');
}finally{
 globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.INTEGRATION_SECRETS_KEY;else process.env.INTEGRATION_SECRETS_KEY=oldKey;
 try{await restoreInstagramSecret({query:secretQuery,snapshot});}finally{await db.destroy();}
}
