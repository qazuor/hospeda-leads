import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sql} from 'kysely';
import {db} from '../src/helpers/db';
import {addresses,post} from '../src/endpoints/inbound';

assert.equal(process.env.CRM_TEST_DATABASE,'1');
// Fixture businesses sort after the browser suite's names: the Negocios list is name-ordered and loads a first batch only.
const previous=process.env.INBOUND_EMAIL_TOKEN,token='inbound-test-token-'+randomUUID().replaceAll('-','');
process.env.INBOUND_EMAIL_TOKEN=token;
const request=(body?:unknown,auth=`Bearer ${token}`)=>new Request('http://localhost/_api/inbound/email',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
const run=randomUUID().slice(0,8);const base=(id:string)=>({messageId:`<${id}-${run}@example.test>`,inReplyTo:null,references:[],from:{email:'unknown@example.test',name:'Unknown'},to:['inbound@example.test'],cc:[],subject:'Inbound fixture',date:new Date().toISOString(),text:'Reply',html:null,headers:{},attachments:[]});
try{
 delete process.env.INBOUND_EMAIL_TOKEN;assert.equal((await post(request(base('missing')))).status,503);process.env.INBOUND_EMAIL_TOKEN='short';assert.equal((await post(request(base('short')))).status,503);process.env.INBOUND_EMAIL_TOKEN=token;
 assert.equal((await post(request(base('bad'),'Bearer wrong'))).status,401);
 assert.equal((await post(request())).status,400);
 assert.equal((await post(new Request('http://localhost/_api/inbound/email',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:' '.repeat(1048577)}))).status,413);
 const account=await db.insertInto('crmAccounts').values({nombre:`Zz inbound fixture ${randomUUID()}`,email:`inbound-${randomUUID()}@example.test`,ciudad:'Colón'}).returningAll().executeTakeFirstOrThrow();
 const openStage=await db.selectFrom('crmStages').select('name').where('classification','=','open').executeTakeFirstOrThrow();
 await db.insertInto('leads').values({accountId:account.id,nombre:account.nombre,estado:openStage.name}).execute();
 const key=`inbound-${randomUUID()}@example.test`;await db.updateTable('crmAccounts').set({email:key}).where('id','=',account.id).execute();
 const spoofed=await post(request({...base('spoof'),from:{email:key,name:'Spoofed'},envelopeFrom:'bounce@example.test',headers:{authenticationResults:'mx.cloudflare.net; spf=fail smtp.mailfrom=bounce@example.test; dmarc=fail header.from=example.test'}}));assert.equal((await spoofed.json() as {matched:boolean}).matched,false,'A From header without an aligned envelope sender is not trusted');
 const senderPayload={...base('good'),from:{email:key,name:'Fixture Sender'},envelopeFrom:'bounce@example.test',headers:{autoSubmitted:'auto-replied',authenticationResults:'mx.cloudflare.net; spf=pass smtp.mailfrom=bounce@example.test'}};
 const received=await post(request(senderPayload));assert.equal(received.status,200);const result=await received.json() as {id:string;matched:boolean;matchMethod:string;duplicate:boolean};assert.equal(result.matched,true);assert.equal(result.matchMethod,'sender_email');assert.equal(result.duplicate,false);
 const duplicate=await post(request(senderPayload));assert.equal(duplicate.status,200);assert.equal((await duplicate.json() as {duplicate:boolean}).duplicate,true);
 const count=await sql<{count:string}>`SELECT count(*)::text AS count FROM crm_inbound_messages WHERE external_id=${senderPayload.messageId.replace(/[<>]/g,'')}`.execute(db);
 assert.equal(Number(count.rows[0]?.count),1);
 const addressResponse=await addresses(new Request('http://localhost/_api/inbound/addresses',{headers:{Authorization:`Bearer ${token}`}}));assert.equal(addressResponse.status,200);
 const journal=async(id:string)=>Number((await sql<{n:string}>`SELECT count(*)::text n FROM crm_communication_journal WHERE entity_type='inbound' AND entity_id=${id}`.execute(db)).rows[0].n);
 assert.equal(await journal(result.id),1,'Matched inbound writes one journal entry; the duplicate adds none');
 const auto=(await sql<{isAutomatic:boolean;status:string}>`SELECT is_automatic AS "isAutomatic",status FROM crm_inbound_messages WHERE id=${result.id}::uuid`.execute(db)).rows[0];assert.equal(auto.isAutomatic,true);assert.equal(auto.status,'pending_review');
 const owner=await db.insertInto('users').values({email:`inbound-owner-${randomUUID()}@example.test`,displayName:'Inbound owner',role:'user'}).returningAll().executeTakeFirstOrThrow();
 const lead=await db.selectFrom('leads').select('id').where('accountId','=',account.id).executeTakeFirstOrThrow();
 const outboxId=`brevo-${randomUUID()}@smtp-relay.test`;
 const outbox=await db.insertInto('emailOutbox').values({leadId:lead.id,recipientEmail:'person@example.test',senderEmail:'seller@hospeda.test',senderName:'Seller',subject:'Hola',htmlBody:'<p>Hola</p>',textBody:'Hola',status:'accepted',messageId:`<${outboxId}>`}).returning('id').executeTakeFirstOrThrow();
 const messageRow=randomUUID();await sql`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,channel,recipient,owner_email,outbox_id,status) VALUES(${messageRow}::uuid,${account.id},${account.id},${lead.id},'email','person@example.test',${owner.email},${outbox.id},'accepted')`.execute(db);
 const replied=await post(request({...base('reply-'+randomUUID()),from:{email:'someone-else@example.test',name:'Forwarded'},inReplyTo:`<${outboxId}>`}));const replyResult=await replied.json() as {id:string;matched:boolean;matchMethod:string};
 assert.equal(replyResult.matchMethod,'in_reply_to');
 const replyRow=(await sql<{accountId:string;leadId:string;linkedMessageId:string;status:string}>`SELECT account_id::text AS "accountId",lead_id::text AS "leadId",linked_message_id::text AS "linkedMessageId",status FROM crm_inbound_messages WHERE id=${replyResult.id}::uuid`.execute(db)).rows[0];
 assert.equal(replyRow.accountId,String(account.id));assert.equal(replyRow.leadId,String(lead.id));assert.equal(replyRow.linkedMessageId,messageRow);assert.equal(replyRow.status,'pending_review');
 assert.equal((await sql<{status:string}>`SELECT status FROM crm_messages WHERE id=${messageRow}::uuid`.execute(db)).rows[0].status,'accepted','Receiving a reply never changes the linked message status');
 const viaRefs=await post(request({...base('refs-'+randomUUID()),from:{email:'third@example.test',name:''},references:['<unrelated@example.test>',`<${outboxId}>`]}));assert.equal((await viaRefs.json() as {matchMethod:string}).matchMethod,'references');
 const chained=await post(request({...base('chain-'+randomUUID()),from:{email:'fourth@example.test',name:''},references:[senderPayload.messageId]}));assert.equal((await chained.json() as {matchMethod:string}).matchMethod,'references','An already matched inbound email anchors later replies');
 const shared=`shared-${randomUUID()}@example.test`;for(const n of [1,2])await db.insertInto('crmAccounts').values({nombre:`Zz inbound fixture shared ${n} ${randomUUID()}`,email:shared,ciudad:'Colón'}).execute();
 const ambiguous=await post(request({...base('ambiguous-'+randomUUID()),from:{email:shared.toUpperCase(),name:''},envelopeFrom:'bounce@example.test',headers:{authenticationResults:'mx.cloudflare.net; dmarc=pass header.from=example.test'}}));const ambiguousResult=await ambiguous.json() as {id:string;matched:boolean;matchMethod:string};assert.equal(ambiguousResult.matched,false);assert.equal(ambiguousResult.matchMethod,'none');
 const unmatchedRow=(await sql<{accountId:string|null;status:string}>`SELECT account_id AS "accountId",status FROM crm_inbound_messages WHERE id=${ambiguousResult.id}::uuid`.execute(db)).rows[0];assert.equal(unmatchedRow.accountId,null);assert.equal(unmatchedRow.status,'unmatched');assert.equal(await journal(ambiguousResult.id),0,'Unmatched inbound emails do not write a business journal entry');
 const unknown=await post(request(base('unknown-'+randomUUID())));assert.equal((await unknown.json() as {matched:boolean}).matched,false);
 const senderLocal=`inbound.${randomUUID().slice(0,8)}`;await db.updateTable('users').set({senderEmail:`${senderLocal}@hospeda.com.ar`}).where('id','=',owner.id).execute();
 const list=await (await addresses(new Request('http://localhost/_api/inbound/addresses',{headers:{Authorization:`Bearer ${token}`}}))).json() as {addresses:string[]};assert(list.addresses.includes(`${senderLocal}@hospeda.com.ar`),'Seller addresses are listed');
 assert.equal((await addresses(new Request('http://localhost/_api/inbound/addresses',{headers:{Authorization:'Bearer wrong'}}))).status,401);
 // Regression: headers/attachments must be stored as JSON objects/arrays, not JSON strings (the reply path reads headers->references).
 const shapes=(await sql<{h:string;a:string;n:string}>`SELECT jsonb_typeof(headers) h,jsonb_typeof(attachments) a,count(*)::text n FROM crm_inbound_messages WHERE source='email_worker' GROUP BY 1,2`.execute(db)).rows;
 assert(shapes.length>0&&shapes.every(r=>r.h==='object'&&r.a==='array'),'Inbound headers and attachments are stored as jsonb object/array: '+JSON.stringify(shapes));
 console.log('Inbound email auth, validation, In-Reply-To/References/sender matching, ambiguity, idempotency, auto replies, journal and address listing passed');
}finally{if(previous===undefined)delete process.env.INBOUND_EMAIL_TOKEN;else process.env.INBOUND_EMAIL_TOKEN=previous;await db.destroy();}
