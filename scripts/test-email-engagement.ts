// Spec 93: Brevo delivery, opens, clicks and spam. Signed webhook events reach GET /_api/communication as read-only
// `emailEngagement` fields, and an open, a click or a spam complaint changes nothing else: no status, contact, reply,
// task, activity, «Último contacto» or journal. Also: a soft bounce followed by a delivery ends delivered, and a
// redelivered hard bounce or an unrelated event never re-adds a restriction an admin lifted.
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import superjson from 'superjson';import {sql} from 'kysely';
import {db} from '../src/helpers/db';import {get,webhook} from '../src/endpoints/communication';import {app} from '../src/server/app';import {setServerSession} from '../src/helpers/getSetServerSession';
assert.equal(process.env.CRM_TEST_DATABASE,'1');const stamp=Date.now();
const TOKEN='zz-engagement-webhook-token-at-least-32-chars-'+stamp;
const users:number[]=[],accounts:string[]=[],outboxes:string[]=[];
async function identity(role:'admin'|'user'){const u=await db.insertInto('users').values({email:`zz-email-engagement-${role}-${randomUUID()}@example.com`,displayName:'Zz '+role,role}).returningAll().executeTakeFirstOrThrow();users.push(u.id);const s={id:u.email,createdAt:Date.now(),lastAccessed:Date.now()};await db.insertInto('sessions').values({id:s.id,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();const r=new Response();await setServerSession(r,s);return {user:u,cookie:r.headers.get('set-cookie')!.split(';')[0]};}
const read=async(accountId:string,cookie:string)=>{const r=await get(new Request('http://localhost/_api/communication?accountId='+accountId,{headers:{cookie}}));const d=superjson.parse<any>(await r.text());assert.equal(r.status,200,d?.error);return d;};
// Through the server app, so the registered route, its auth and its body handling are all exercised.
const post=async(body:unknown,auth:string|null='Bearer '+TOKEN)=>(await app.request('/_api/brevo/events',{method:'POST',headers:{...(auth?{Authorization:auth}:{}),'content-type':'application/json'},body:JSON.stringify(body)})).status;
const count=async(query:ReturnType<typeof sql<{n:string}>>)=>Number((await query.execute(db)).rows[0].n);
try{
 process.env.BREVO_WEBHOOK_TOKEN=TOKEN;delete process.env.BREVO_API_KEY;
 const owner=await identity('user');
 const a=await db.insertInto('crmAccounts').values({nombre:'Zz Email engagement '+stamp,assignedUserEmail:owner.user.email,email:'zz-hotel@example.test'}).returningAll().executeTakeFirstOrThrow();const accountId=String(a.id);accounts.push(accountId);
 const lead=await db.insertInto('leads').values({accountId:a.id,nombre:a.nombre,estado:'Cargado',assignedUserEmail:owner.user.email}).returningAll().executeTakeFirstOrThrow();
 const sentAt=new Date(Date.now()-3600000);
 /** A sent email as `dispatch` leaves it: accepted by Brevo, with its activity and a pending task of the management. */
 async function sentEmail(tag:string,recipient=`zz-${tag}-${stamp}@example.test`){
  const id=randomUUID(),messageId=`<zz-${tag}-${stamp}@brevo.test>`;
  const out=await db.insertInto('emailOutbox').values({leadId:lead.id,recipientEmail:recipient,senderEmail:'sender@example.test',senderName:'Hospeda',subject:'Zz '+tag,htmlBody:'<p>Hola</p>',textBody:'Hola',status:'accepted',messageId}).returning('id').executeTakeFirstOrThrow();outboxes.push(String(out.id));
  const activity=await db.insertInto('crmActivities').values({accountId:a.id,leadId:lead.id,typeId:'message',title:'Email enviado',channel:'email',result:'Email aceptado por proveedor · entrega no confirmada',occurredAt:sentAt,actorEmail:owner.user.email}).returning('id').executeTakeFirstOrThrow();
  const task=await db.insertInto('crmTasks').values({accountId:a.id,leadId:lead.id,title:'Zz seguimiento '+tag,typeId:'call',dueDate:'2027-01-15',assignedUserEmail:owner.user.email}).returningAll().executeTakeFirstOrThrow();
  await sql`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,channel,recipient,recipient_name,subject,body,html_body,text_body,owner_email,status,outbox_id,activity_id,last_interaction_at,last_actor_email) VALUES(${id}::uuid,${a.id},${a.id},${lead.id},'email',${recipient},'Zz Hotel',${'Zz '+tag},'Hola','<p>Hola</p>','Hola',${owner.user.email},'accepted',${out.id},${activity.id},${sentAt},${owner.user.email})`.execute(db);
  const ts=Math.floor(sentAt.getTime()/1000);
  const event=(event:string,offset:number,extra:Record<string,unknown>={})=>({event,email:recipient,'message-id':messageId.slice(1,-1),ts_event:ts+offset,ts_epoch:sentAt.getTime(),id:1,...extra});
  return {id,outboxId:String(out.id),activityId:String(activity.id),taskId:String(task.id),recipient,event,at:(offset:number)=>new Date((ts+offset)*1000)};
 }
 /** Everything an open, a click or a spam complaint must not touch. */
 const snapshot=async(m:{id:string;activityId:string;taskId:string})=>({
  message:(await sql`SELECT status,last_interaction_at,last_actor_email,updated_at FROM crm_messages WHERE id=${m.id}::uuid`.execute(db)).rows[0],
  activity:(await sql`SELECT result,outcome,occurred_at,updated_at FROM crm_activities WHERE id=${m.activityId}`.execute(db)).rows[0],
  task:(await sql`SELECT status,completed_at,result FROM crm_tasks WHERE id=${m.taskId}`.execute(db)).rows[0],
  lead:(await sql`SELECT fecha_ultimo_contacto,resultado_ultimo_contacto,estado FROM leads WHERE id=${lead.id}`.execute(db)).rows[0],
  journal:await count(sql<{n:string}>`SELECT count(*) n FROM crm_communication_journal WHERE account_id=${accountId}`),
  history:await count(sql<{n:string}>`SELECT count(*) n FROM crm_commercial_journal WHERE account_id=${accountId}`),
  work:await count(sql<{n:string}>`SELECT count(*) n FROM crm_work_journal WHERE entity='crm_activities' AND entity_id=${m.activityId}`),
  responses:await count(sql<{n:string}>`SELECT count(*) n FROM crm_communication_responses WHERE account_id=${accountId}`),
  restrictions:await count(sql<{n:string}>`SELECT count(*) n FROM crm_contact_restrictions WHERE account_id=${accountId}`),
 });

 // Auth: no token or a wrong one is 401; a missing or short server token is 503. Nothing is stored.
 const main=await sentEmail('main');
 assert.equal(await post(main.event('delivered',60),null),401);assert.equal(await post(main.event('delivered',60),'Bearer wrong'),401);
 process.env.BREVO_WEBHOOK_TOKEN='short';assert.equal(await post(main.event('delivered',60)),503);process.env.BREVO_WEBHOOK_TOKEN=TOKEN;
 assert.equal(await count(sql<{n:string}>`SELECT count(*) n FROM crm_email_events WHERE outbox_id=${main.outboxId}`),0);
 assert.equal((await read(accountId,owner.cookie)).messages.find((m:any)=>m.id===main.id).emailEngagement,null,'no events: no engagement');

 // Delivery: status and activity result change, once, with one journal entry.
 const beforeDelivery=await snapshot(main);
 assert.equal(await post(main.event('delivered',60)),200);
 const delivered=await snapshot(main);
 assert.equal(delivered.message.status,'delivery_confirmed');assert.equal(delivered.activity.result,'Entrega confirmada por Brevo');
 assert.equal(delivered.journal,beforeDelivery.journal+1,'one brevo_event_delivered journal entry');
 assert.equal((delivered.message.lastInteractionAt as Date).getTime(),sentAt.getTime(),'delivery does not invent a contact date');
 assert.equal(delivered.task.status,'pending','delivery does not complete the task');

 // Opens ×2 (Brevo also sends unique_opened for the first), a click with a tracking query string, spam, deferred and unsubscribed.
 assert.equal(await post([main.event('unique_opened',120),main.event('opened',120,{user_agent:'Mozilla/5.0'}),main.event('opened',300)]),200);
 assert.equal(await post(main.event('click',400,{link:'https://hospeda.com.ar/planes/anual?utm_source=crm&email=zz@example.test#precio'})),200);
 assert.equal(await post(main.event('spam',500)),200);
 assert.equal(await post([main.event('deferred',510),main.event('unsubscribed',520)]),200);
 // A redelivered duplicate is deduplicated (same message, recipient, type and second).
 assert.equal(await post(main.event('opened',300)),200);
 const after=await snapshot(main);
 assert.deepEqual(after,delivered,'opens, clicks, spam, deferred and unsubscribed change no status, contact, reply, task, activity, «Último contacto», restriction or journal');

 const engagement=(await read(accountId,owner.cookie)).messages.find((m:any)=>m.id===main.id).emailEngagement;
 assert.equal(engagement.deliveredAt.getTime(),main.at(60).getTime());
 assert.equal(engagement.firstOpenedAt.getTime(),main.at(120).getTime());assert.equal(engagement.openCount,2,'unique_opened + opened of the first opening count once');
 assert.equal(engagement.proxyOpenCount,0);assert.equal(engagement.firstProxyOpenedAt,null);
 assert.equal(engagement.firstClickedAt.getTime(),main.at(400).getTime());assert.equal(engagement.clickCount,1);
 assert.deepEqual(engagement.clickedLinks,['hospeda.com.ar/planes/anual'],'links are sanitized text without query string');
 assert.equal(engagement.spamAt.getTime(),main.at(500).getTime());assert.equal(engagement.lastEventAt.getTime(),main.at(520).getTime());
 assert.equal(JSON.stringify(engagement).includes('utm_source'),false,'the raw payload never leaves the server');

 // Proxy opens are counted apart, never as «Abierto».
 const proxied=await sentEmail('proxy');
 assert.equal(await post([proxied.event('unique_proxy_open',30),proxied.event('proxy_open',30),proxied.event('proxy_open',90)]),200);
 const proxy=(await read(accountId,owner.cookie)).messages.find((m:any)=>m.id===proxied.id).emailEngagement;
 assert.equal(proxy.openCount,0);assert.equal(proxy.firstOpenedAt,null);assert.equal(proxy.proxyOpenCount,2);assert.equal(proxy.firstProxyOpenedAt.getTime(),proxied.at(30).getTime());
 assert.equal((await snapshot(proxied)).message.status,'accepted');

 // A soft bounce or a deferral followed by a delivery ends delivered, also when both share the same second.
 const soft=await sentEmail('soft');
 assert.equal(await post([soft.event('deferred',10),soft.event('soft_bounce',20)]),200);assert.equal((await snapshot(soft)).message.status,'failed');
 assert.equal(await post(soft.event('delivered',20)),200);assert.equal((await snapshot(soft)).message.status,'delivery_confirmed','delivery wins a same-second soft bounce');
 assert.equal(await post(soft.event('soft_bounce',900)),200);assert.equal((await snapshot(soft)).message.status,'delivery_confirmed','a later soft bounce never overrides a delivery');

 // A hard bounce adds the automatic restriction once. After an admin lifts it, neither a redelivered bounce nor an open re-adds it.
 const bounced=await sentEmail('bounce');
 assert.equal(await post(bounced.event('hard_bounce',40)),200);assert.equal((await snapshot(bounced)).message.status,'failed');
 const active=async()=>count(sql<{n:string}>`SELECT count(*) n FROM crm_contact_restrictions WHERE account_id=${accountId} AND channel='email' AND source='automatic' AND lifted_at IS NULL`);
 assert.equal(await active(),1);
 await sql`UPDATE crm_contact_restrictions SET lifted_at=now(),lifted_by='zz-admin',lift_reason='Zz revisado' WHERE account_id=${accountId} AND lifted_at IS NULL`.execute(db);
 const lifted=await snapshot(bounced);
 assert.equal(await post(bounced.event('hard_bounce',40)),200);assert.equal(await post(bounced.event('opened',80)),200);assert.equal(await post(bounced.event('click',81,{link:'javascript:alert(1)'})),200);
 assert.equal(await active(),0,'a redelivered bounce or an unrelated event does not re-add a lifted restriction');assert.deepEqual(await snapshot(bounced),lifted);
 assert.deepEqual((await read(accountId,owner.cookie)).messages.find((m:any)=>m.id===bounced.id).emailEngagement.clickedLinks,[],'unsafe links are dropped');

 const lift=async()=>{await sql`UPDATE crm_contact_restrictions SET lifted_at=now(),lifted_by='zz-admin',lift_reason='Zz revisado' WHERE account_id=${accountId} AND lifted_at IS NULL`.execute(db);assert.equal(await active(),0);};
 const deliveredJournal=async(m:{id:string})=>count(sql<{n:string}>`SELECT count(*) n FROM crm_communication_journal WHERE entity_id=${m.id} AND action='brevo_event_delivered'`);
 // Review B4: a NEW hard bounce (another ts_event) after the lift is new evidence and adds the restriction again.
 assert.equal(await post(bounced.event('hard_bounce',200)),200);assert.equal(await active(),1,'a new hard bounce re-adds the restriction');assert.equal((await snapshot(bounced)).message.status,'failed');
 await lift();

 // Review M1: delivered, then hard bounce, then a soft bounce stays failed; the restriction stays and the delivery is not replayed.
 const m1=await sentEmail('m1');
 assert.equal(await post([m1.event('delivered',10),m1.event('hard_bounce',20)]),200);assert.equal((await snapshot(m1)).message.status,'failed');assert.equal(await active(),1);
 const m1Journal=await deliveredJournal(m1);
 assert.equal(await post(m1.event('soft_bounce',30)),200);
 assert.equal((await snapshot(m1)).message.status,'failed','a soft bounce after a hard bounce never revives the delivery');assert.equal(await active(),1,'the restriction of the hard bounce stays active');
 assert.equal(await deliveredJournal(m1),m1Journal,'no brevo_event_delivered replay');assert.equal((await sql<{result:string}>`SELECT result FROM crm_activities WHERE id=${m1.activityId}`.execute(db)).rows[0].result,'Rebote/fallo: hard_bounce');
 await lift();

 // Review B3: an orphan delivered event (unknown message-id, no tag) is adopted by the next event once the outbox knows its message-id.
 const orphan=await sentEmail('orphan');const orphanMid=(await sql<{messageId:string}>`SELECT message_id FROM email_outbox WHERE id=${orphan.outboxId}`.execute(db)).rows[0].messageId;
 await sql`UPDATE email_outbox SET message_id=NULL WHERE id=${orphan.outboxId}`.execute(db);
 assert.equal(await post(orphan.event('delivered',10)),200);
 assert.equal((await sql<{outboxId:string|null}>`SELECT outbox_id FROM crm_email_events WHERE recipient=${orphan.recipient} AND event='delivered'`.execute(db)).rows[0].outboxId,null,'unknown message-id: orphan');
 assert.equal((await snapshot(orphan)).message.status,'accepted');
 await sql`UPDATE email_outbox SET message_id=${orphanMid} WHERE id=${orphan.outboxId}`.execute(db);
 const orphanBefore=(await snapshot(orphan)).journal;
 assert.equal(await post(orphan.event('opened',20)),200);
 assert.equal((await snapshot(orphan)).message.status,'delivery_confirmed','the adopted delivery applies');assert.equal((await snapshot(orphan)).journal,orphanBefore+1,'exactly one journal entry');
 assert.equal(await count(sql<{n:string}>`SELECT count(*) n FROM crm_email_events WHERE recipient=${orphan.recipient} AND outbox_id IS NULL`),0);

 console.log('Email engagement: auth, delivery, opens, proxy opens, clicks, spam, dedupe, no side effects, soft bounce then delivered, lifted restrictions, orphan adoption and review M1/B3/B4 passed');
}finally{
 for(const id of outboxes)await sql`DELETE FROM crm_email_events WHERE outbox_id=${id}`.execute(db).catch(()=>{});
 for(const id of accounts){
  for(const q of [sql`DELETE FROM crm_communication_journal WHERE account_id=${id}`,sql`DELETE FROM crm_contact_restrictions WHERE account_id=${id}`,sql`DELETE FROM crm_messages WHERE account_id=${id}`,sql`DELETE FROM email_outbox WHERE id=ANY(${outboxes}::bigint[])`,sql`DELETE FROM crm_tasks WHERE account_id=${id}`,sql`DELETE FROM crm_activities WHERE account_id=${id}`,sql`DELETE FROM leads WHERE account_id=${id}`,sql`DELETE FROM crm_pipeline_events WHERE account_id=${id}`,sql`DELETE FROM crm_work_journal WHERE account_id=${id}`,sql`DELETE FROM lead_journal WHERE account_id=${id}`,sql`DELETE FROM crm_commercial_journal WHERE account_id=${id}`,sql`DELETE FROM crm_communication_journal WHERE account_id=${id}`,sql`DELETE FROM crm_accounts WHERE id=${id}`])await q.execute(db).catch(e=>console.warn('cleanup:',String(e).slice(0,200)));
 }
 for(const id of users){await sql`DELETE FROM sessions WHERE user_id=${id}`.execute(db).catch(()=>{});await sql`DELETE FROM users WHERE id=${id}`.execute(db).catch(()=>{});}
 await db.destroy();
}
