import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {sql} from 'kysely';
import postgres from 'postgres';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {decryptInstagramToken,encryptInstagramToken} from '../src/helpers/instagram';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {post,verify,refreshInstagramToken,integrationGET,integrationPOST} from '../src/endpoints/inboundInstagram';
import {assignPOST,unmatchedGET} from '../src/endpoints/inbound';

if(process.env.CRM_TEST_DATABASE!=='1'||!/@(localhost|127\.0\.0\.1|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)[:/]/.test(process.env.DATABASE_URL??''))throw new Error('Instagram integration tests require CRM_TEST_DATABASE=1 and a local DATABASE_URL (localhost or a private Docker address)');
const run=randomUUID(),hex=run.replaceAll('-',''),secret='instagram-test-secret',accountId='instagram-account-'+run,usedIgsids:string[]=[],igs=(tag:number)=>{const v=String(BigInt('0x'+hex.slice(0,13))*1000n+BigInt(tag));if(!usedIgsids.includes(v))usedIgsids.push(v);return v;},igsid=igs(1);
const uname=(tag:string)=>`t${tag}_${hex.slice(0,20)}`;
const username=uname('a');
const old={secret:process.env.INSTAGRAM_APP_SECRET,account:process.env.INSTAGRAM_ACCOUNT_ID,verify:process.env.INSTAGRAM_VERIFY_TOKEN,key:process.env.INTEGRATION_SECRETS_KEY,fetch:globalThis.fetch,log:console.log,warn:console.warn,error:console.error,info:console.info};
type SecretRow={ciphertext:string;iv:string;tag:string;expiresAt:Date|null;refreshedAt:Date|null;lastError:string|null};
let previousSecret:SecretRow|undefined;const accountIds:string[]=[];const userEmails:string[]=[];
const key=Buffer.alloc(32,7);
process.env.INSTAGRAM_APP_SECRET=secret;process.env.INSTAGRAM_ACCOUNT_ID=accountId;process.env.INSTAGRAM_VERIFY_TOKEN='instagram-verify-test-token-0123456789';process.env.INTEGRATION_SECRETS_KEY=key.toString('base64');

// Everything printed during the run is captured to prove the token never reaches the logs. Output is still forwarded.
const logged:string[]=[];
for(const level of ['log','warn','error','info'] as const)console[level]=(...args:unknown[])=>{logged.push(args.map(a=>a instanceof Error?a.stack??a.message:typeof a==='string'?a:JSON.stringify(a)).join(' '));(old[level] as (...a:unknown[])=>void)(...args);};
const responses:string[]=[];

// Meta is mocked: the profile endpoint answers from `profiles` (igsid -> username, null = failure) and the renewal endpoint from `refreshMode`.
const profiles=new Map<string,string|null>();let refreshMode:'ok'|'fail'|'malformed'='ok',lookupDelay=0;const noUsername=new Set<string>();const refreshedToken='refreshed-token-'+run,pastedToken='pasted-token-'+run;
const calls:{kind:'profile'|'refresh';url:string}[]=[];
globalThis.fetch=(async(input:Parameters<typeof fetch>[0])=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 assert.equal(url.hostname,'graph.instagram.com','tests must never reach a real network host');
 if(url.pathname==='/refresh_access_token'){calls.push({kind:'refresh',url:url.href});return refreshMode==='ok'?Response.json({access_token:refreshedToken,token_type:'bearer',expires_in:5184000}):refreshMode==='malformed'?Response.json({access_token:12345,expires_in:'soon'}):Response.json({error:{message:'denied'}},{status:400});}
 const id=decodeURIComponent(url.pathname.slice(1));calls.push({kind:'profile',url:url.href});if(lookupDelay)await new Promise(r=>setTimeout(r,lookupDelay));if(noUsername.has(id))return Response.json({name:'No Handle'});const name=profiles.get(id);
 return name?Response.json({username:name,name:'Instagram Fixture'}):Response.json({},{status:500});
}) as typeof fetch;
const profileCalls=()=>calls.filter(c=>c.kind==='profile').length,refreshCalls=()=>calls.filter(c=>c.kind==='refresh').length;

const payload=(mid:string,text:string,echo=false,contactId=igsid,entryId=accountId)=>({object:'instagram',entry:[{id:entryId,messaging:[{sender:{id:echo?entryId:contactId},recipient:{id:echo?contactId:entryId},timestamp:Date.now(),message:{mid,text,...(echo?{is_echo:true}:{})}}]}]});
const request=(body:unknown)=>{const raw=JSON.stringify(body);return new Request('http://localhost/_api/inbound/instagram',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')},body:raw});};
const send=async(body:unknown)=>{const r=await post(request(body));responses.push(await r.clone().text());return r;};
const mid=(tag:string)=>`${tag}-${run}`;
const inboundRow=async(external:string)=>(await sql<{status:string;address:string;accountId:string|null;leadId:string|null;matchMethod:string;isOutgoing:boolean;igsid:string|null}>`SELECT status,from_address AS address,account_id::text AS "accountId",lead_id::text AS "leadId",match_method AS "matchMethod",is_outgoing AS "isOutgoing",instagram_igsid AS igsid FROM crm_inbound_messages WHERE external_id=${external}`.execute(db)).rows;
const messageRows=async(external:string)=>(await sql<{accountId:string;leadId:string|null;owner:string;status:string;recipient:string;channel:string}>`SELECT account_id::text AS "accountId",lead_id::text AS "leadId",owner_email AS owner,status,recipient,channel FROM crm_messages WHERE external_id=${external}`.execute(db)).rows;
const secretRow=async()=>(await sql<SecretRow>`SELECT ciphertext,iv,tag,expires_at AS "expiresAt",refreshed_at AS "refreshedAt",last_error AS "lastError" FROM crm_integration_secrets WHERE name='instagram'`.execute(db)).rows[0];
const setSecret=async(token:string,refreshedAgo:string,expiresIn:string)=>{const e=encryptInstagramToken(token,key);await sql`INSERT INTO crm_integration_secrets(name,ciphertext,iv,tag,expires_at,refreshed_at,last_error) VALUES('instagram',${e.ciphertext},${e.iv},${e.tag},now()+${expiresIn}::interval,now()-${refreshedAgo}::interval,NULL) ON CONFLICT(name) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,tag=excluded.tag,expires_at=excluded.expires_at,refreshed_at=excluded.refreshed_at,last_error=NULL`.execute(db);};
const makeAccount=async(label:string,profile:string|null)=>{const a=await db.insertInto('crmAccounts').values({nombre:`Instagram fixture ${label} ${run}`,perfilInstagram:profile,ciudad:'Colón'}).returningAll().executeTakeFirstOrThrow();accountIds.push(String(a.id));return String(a.id);};
const makeLead=async(account:string)=>{const stage=await db.selectFrom('crmStages').select('name').where('classification','=','open').executeTakeFirstOrThrow();return String((await db.insertInto('leads').values({accountId:account,nombre:`Instagram lead ${run}`,estado:stage.name}).returningAll().executeTakeFirstOrThrow()).id);};
const identity=async(role:'admin'|'user')=>{const u=await db.insertInto('users').values({email:`instagram-${role}-${randomUUID()}@example.com`,displayName:role,role}).returningAll().executeTakeFirstOrThrow();userEmails.push(u.email);await db.insertInto('sessions').values({id:u.email,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();const r=new Response();await setServerSession(r,{id:u.email,createdAt:Date.now(),lastAccessed:Date.now()});return {user:u,cookie:r.headers.get('set-cookie')!.split(';')[0]};};
const journalIds=async(account:string,entityType:string,action:string)=>(await sql<{entityId:string;actor:string|null}>`SELECT entity_id AS "entityId",actor_email AS actor FROM crm_communication_journal WHERE account_id=${account}::bigint AND entity_type=${entityType} AND action=${action}`.execute(db)).rows;
const signed=(raw:string,body=raw)=>new Request('http://localhost/_api/inbound/instagram',{method:'POST',headers:{'X-Hub-Signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')},body});
const holder=postgres(process.env.DATABASE_URL!,{max:1,prepare:false});

try{
 // GET verification.
 const verifyOk=await verify(new Request('http://localhost/_api/inbound/instagram?hub.mode=subscribe&hub.verify_token=instagram-verify-test-token-0123456789&hub.challenge=fixture'));assert.equal(await verifyOk.text(),'fixture');assert.equal((await verify(new Request('http://localhost/_api/inbound/instagram?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=x'))).status,403);

 previousSecret=(await secretRow());
 const accountPlain=await makeAccount('plain',`https://www.instagram.com/${username}/`);
 await setSecret('mock-token','0 seconds','30 days');
 profiles.set(igsid,username);

 // Signature failures register nothing.
 assert.equal((await post(new Request('http://localhost/_api/inbound/instagram',{method:'POST',headers:{'X-Hub-Signature-256':'sha256='+'0'.repeat(64)},body:'{}'}))).status,401);
 assert.equal((await post(new Request('http://localhost/_api/inbound/instagram',{method:'POST',body:'{}'}))).status,401);

 // Matched inbound, retried with the same mid: one row.
 const inBody=payload(mid('in'),'Hello');assert.equal((await send(inBody)).status,200);assert.equal((await send(inBody)).status,200);
 let rows=await inboundRow(mid('in'));assert.equal(rows.length,1);assert.equal(rows[0].status,'pending_review');assert.equal(rows[0].address,'@'+username);assert.equal(rows[0].accountId,accountPlain);assert.equal(rows[0].matchMethod,'instagram_handle');

 // Unmatched: profile lookup fails, the message is kept with the IGSID.
 const igsidFail=igs(2);profiles.set(igsidFail,null);
 assert.equal((await send(payload(mid('unmatched'),'Still received',false,igsidFail))).status,200);
 rows=await inboundRow(mid('unmatched'));assert.equal(rows[0].status,'unmatched');assert.equal(rows[0].address,igsidFail);assert.equal(rows[0].accountId,null);assert.equal(rows[0].matchMethod,'none');

 // Unmatched: a profile that matches no business.
 const igsidNone=igs(3);profiles.set(igsidNone,uname('n'));
 assert.equal((await send(payload(mid('nomatch'),'Nobody knows me',false,igsidNone))).status,200);
 rows=await inboundRow(mid('nomatch'));assert.equal(rows[0].status,'unmatched');assert.equal(rows[0].address,'@'+uname('n'));assert.equal(rows[0].igsid,igsidNone);

 // Ambiguous: two live businesses share the handle (URL and @ spellings), so nothing is associated.
 const igsidAmb=igs(4),ambName=uname('m');profiles.set(igsidAmb,ambName);
 await makeAccount('amb1',`https://instagram.com/${ambName}`);await makeAccount('amb2',`@${ambName.toUpperCase()}`);
 assert.equal((await send(payload(mid('amb'),'Which one am I?',false,igsidAmb))).status,200);
 rows=await inboundRow(mid('amb'));assert.equal(rows[0].status,'unmatched');assert.equal(rows[0].accountId,null);assert.equal(rows[0].address,'@'+ambName);

 // A trashed business is ignored by the match.
 const igsidTrash=igs(5),trashName=uname('t');profiles.set(igsidTrash,trashName);
 const trashed=await makeAccount('trash',`https://www.instagram.com/${trashName}/`);await sql`UPDATE crm_accounts SET deleted_at=now() WHERE id=${trashed}::bigint`.execute(db);
 assert.equal((await send(payload(mid('trash'),'Deleted business',false,igsidTrash))).status,200);
 assert.equal((await inboundRow(mid('trash')))[0].status,'unmatched');

 // Echo without management: stored on the business only, as a manual_sent message of the system actor. Same mid twice: one row.
 const echoBody=payload(mid('out'),'Welcome',true);assert.equal((await send(echoBody)).status,200);assert.equal((await send(echoBody)).status,200);
 let sent=await messageRows(mid('out'));assert.equal(sent.length,1);assert.equal(sent[0].owner,'instagram@hospeda');assert.equal(sent[0].status,'manual_sent');assert.equal(sent[0].channel,'social');assert.equal(sent[0].accountId,accountPlain);assert.equal(sent[0].leadId,null);assert.equal(sent[0].recipient,'@'+username);
 assert.equal((await inboundRow(mid('out'))).length,0,'a matched echo is a sent message, not an inbound row');

 // Echo with exactly one open management links to it; with two open managements it stays at business level.
 const igsidLead=igs(6),leadName=uname('l');profiles.set(igsidLead,leadName);
 const accountLead=await makeAccount('lead',`https://www.instagram.com/${leadName}/`),lead=await makeLead(accountLead);
 assert.equal((await send(payload(mid('echo-lead'),'With management',true,igsidLead))).status,200);
 sent=await messageRows(mid('echo-lead'));assert.equal(sent.length,1);assert.equal(sent[0].leadId,lead);assert.equal(sent[0].accountId,accountLead);
 await makeLead(accountLead);
 assert.equal((await send(payload(mid('echo-two'),'Two managements',true,igsidLead))).status,200);
 sent=await messageRows(mid('echo-two'));assert.equal(sent.length,1);assert.equal(sent[0].leadId,null);assert.equal(sent[0].accountId,accountLead);

 // Echo of an unmatched chat is kept as an outgoing inbound row (D2).
 assert.equal((await send(payload(mid('echo-unmatched'),'Sent to nobody',true,igsidFail))).status,200);
 rows=await inboundRow(mid('echo-unmatched'));assert.equal(rows.length,1);assert.equal(rows[0].status,'unmatched');assert.equal(rows[0].isOutgoing,true);assert.equal(rows[0].igsid,igsidFail);assert.equal((await messageRows(mid('echo-unmatched'))).length,0);

 // Manual association moves every unmatched row of the same IGSID together (D2): incoming stays for review, outgoing becomes a sent message. Other chats are untouched.
 const admin=await identity('admin'),target=await makeAccount('target',null);
 assert.equal((await send(payload(mid('chat-in2'),'Second incoming',false,igsidFail))).status,200);
 const unmatchedList=await unmatchedGET(new Request('http://localhost/_api/inbound/unmatched',{headers:{cookie:admin.cookie}}));assert.equal(unmatchedList.status,200);
 const assignee=(await sql<{id:string}>`SELECT id::text AS id FROM crm_inbound_messages WHERE external_id=${mid('unmatched')}`.execute(db)).rows[0].id;
 const assigned=await assignPOST(new Request('http://localhost/_api/inbound/assign',{method:'POST',headers:{cookie:admin.cookie,'Content-Type':'application/json'},body:JSON.stringify({id:assignee,accountId:target})}));assert.equal(assigned.status,200,await assigned.clone().text());assert.equal(superjson.parse<{associatedChat?:boolean}>(await assigned.text()).associatedChat,true);
 for(const m of ['unmatched','chat-in2']){const [r]=await inboundRow(mid(m));assert.equal(r.status,'pending_review');assert.equal(r.accountId,target);assert.equal(r.matchMethod,'manual');}
 assert.equal((await inboundRow(mid('echo-unmatched'))).length,0,'the outgoing row left the inbox');
 sent=await messageRows(mid('echo-unmatched'));assert.equal(sent.length,1);assert.equal(sent[0].accountId,target);assert.equal(sent[0].owner,'instagram@hospeda');assert.equal(sent[0].status,'manual_sent');
 assert.equal((await inboundRow(mid('nomatch')))[0].status,'unmatched','another chat is not moved');assert.equal((await inboundRow(mid('amb')))[0].status,'unmatched');

 // The chat-wide association writes the same journal as a single one: inbound_matched per moved incoming row and one entry per converted echo.
 for(const m of ['unmatched','chat-in2']){const rowId=(await sql<{id:string}>`SELECT id::text AS id FROM crm_inbound_messages WHERE external_id=${mid(m)}`.execute(db)).rows[0].id;const entries=(await journalIds(target,'inbound','inbound_matched')).filter(j=>j.entityId===rowId);assert.equal(entries.length,1,`inbound_matched for ${m}`);assert.equal(entries[0].actor,admin.user.email);}
 const movedEcho=(await sql<{id:string}>`SELECT id::text AS id FROM crm_messages WHERE external_id=${mid('echo-unmatched')}`.execute(db)).rows[0].id;assert.equal((await journalIds(target,'interaction','contact_completed')).filter(j=>j.entityId===movedEcho).length,1,'one journal entry for the converted echo');

 // Entries for another account are ignored.
 const profilesBefore=profileCalls();
 assert.equal((await send(payload(mid('foreign'),'Not ours',false,igsid,'foreign-'+run))).status,200);assert.equal((await send(payload(mid('foreign-echo'),'Not ours',true,igsid,'foreign-'+run))).status,200);
 assert.equal((await inboundRow(mid('foreign'))).length,0);assert.equal((await inboundRow(mid('foreign-echo'))).length+(await messageRows(mid('foreign-echo'))).length,0);assert.equal(profileCalls(),profilesBefore,'foreign entries do not trigger Meta lookups');
 assert.equal((await send({object:'instagram',entry:[{id:'foreign',messaging:[]}]})).status,200);

 // A batch with reactions, read receipts, postbacks, a bad IGSID, a long text and absurd timestamps still stores every real DM.
 const mixId=mid('mix'),now=Date.now(),envelope=(...messaging:unknown[])=>({object:'instagram',entry:[{id:accountId,messaging}]});
 const party={sender:{id:igsid},recipient:{id:accountId}};
 const callsMix=profileCalls();
 assert.equal((await send(envelope(
  {...party,timestamp:now,reaction:{mid:'r1',action:'react',reaction:'love'}},
  {...party,timestamp:now,read:{mid:'r2'}},
  {...party,timestamp:now,postback:{mid:'r3',payload:'p'}},
  {sender:{id:'not-numeric'},recipient:{id:accountId},timestamp:now,message:{mid:mid('badid'),text:'bad igsid'}},
  {...party,timestamp:'garbage',message:{mid:mixId,text:'x'.repeat(60000)}},
  {...party,timestamp:9e20,message:{mid:mid('badts'),text:'absurd timestamp'}},
 ))).status,200);
 const mixRow=(await sql<{len:number;at:Date;status:string}>`SELECT length(text_body) AS len,received_at AS at,status FROM crm_inbound_messages WHERE external_id=${mixId}`.execute(db)).rows;
 assert.equal(mixRow.length,1,'the real DM next to a reaction/read/postback is stored');assert.equal(mixRow[0].len,50000,'long text is truncated, not rejected');assert.ok(Math.abs(Date.now()-mixRow[0].at.getTime())<120000,'an invalid timestamp falls back to now');
 assert.equal((await inboundRow(mid('badid'))).length,0,'a non-numeric IGSID is skipped');assert.ok(!calls.some(c=>c.url.includes('not-numeric')),'no Meta lookup for an invalid IGSID');
 assert.equal((await inboundRow(mid('badts'))).length,1);assert.equal(profileCalls(),callsMix,'cached profile, no extra Meta calls');

 // Handle matching is equivalent to the JS normalizer: case, query/fragment suffixes, whitespace, no scheme, m. host. A longer handle never matches.
 const spellings=(u:string)=>[`https://www.instagram.com/${u}/?igshid=x`,` @${u.toUpperCase()} `,`instagram.com/${u}`,`m.instagram.com/${u}`,`HTTPS://Instagram.com/${u.toUpperCase()}`,`https://instagram.com/${u}#top`];
 for(let i=0;i<6;i++){const u=uname('v'+i),spelled=spellings(u)[i],owner=await makeAccount('spell'+i,spelled);await makeAccount('decoy'+i,`https://instagram.com/${u}2`);const ig=igs(10+i);profiles.set(ig,u);
  assert.equal((await send(payload(mid('sp'+i),'Hi',false,ig))).status,200);const [r]=await inboundRow(mid('sp'+i));assert.equal(r.status,'pending_review',`spelling ${spelled}`);assert.equal(r.accountId,owner,`spelling ${spelled}`);}

 // Retries journal once, keyed by the stored row (not by Meta's mid); a matched echo journals once as well.
 const jIn=payload(mid('j-in'),'Journal me');assert.equal((await send(jIn)).status,200);assert.equal((await send(jIn)).status,200);assert.equal((await send(jIn)).status,200);
 const jRow=(await sql<{id:string}>`SELECT id::text AS id FROM crm_inbound_messages WHERE external_id=${mid('j-in')}`.execute(db)).rows;assert.equal(jRow.length,1);
 const received=await journalIds(accountPlain,'inbound','inbound_received');assert.equal(received.filter(j=>j.entityId===jRow[0].id).length,1,'one inbound_received per stored row');assert.equal(received.filter(j=>j.entityId===mid('j-in')).length,0,'the journal is not keyed by the Meta mid');
 const jOut=payload(mid('j-out'),'Echo journal',true);assert.equal((await send(jOut)).status,200);assert.equal((await send(jOut)).status,200);
 const echoId=(await sql<{id:string}>`SELECT id::text AS id FROM crm_messages WHERE external_id=${mid('j-out')}`.execute(db)).rows;assert.equal(echoId.length,1);assert.equal((await journalIds(accountPlain,'interaction','contact_completed')).filter(j=>j.entityId===echoId[0].id).length,1);

 // A retry never stores the same mid in both tables, whichever way the lookup flipped.
 const flipUser=uname('x'),flipAccount=await makeAccount('flip','@'+flipUser),flipA=igs(30),flipB=igs(31);
 profiles.set(flipA,null);assert.equal((await send(payload(mid('flip-a'),'first fails',true,flipA))).status,200);assert.equal((await inboundRow(mid('flip-a'))).length,1);
 profiles.set(flipA,flipUser);assert.equal((await send(payload(mid('flip-a'),'first fails',true,flipA))).status,200);assert.equal((await inboundRow(mid('flip-a'))).length,1);assert.equal((await messageRows(mid('flip-a'))).length,0,'echo kept in the inbox is not duplicated into the business');
 profiles.set(flipB,flipUser);assert.equal((await send(payload(mid('flip-b'),'first works',true,flipB))).status,200);assert.equal((await messageRows(mid('flip-b'))).length,1);assert.equal((await messageRows(mid('flip-b')))[0].accountId,flipAccount);
 await sql`DELETE FROM crm_instagram_contacts WHERE igsid=${flipB}`.execute(db);profiles.set(flipB,null);assert.equal((await send(payload(mid('flip-b'),'first works',true,flipB))).status,200);assert.equal((await inboundRow(mid('flip-b'))).length,0,'a stored echo is not duplicated into the inbox');assert.equal((await messageRows(mid('flip-b'))).length,1);

 // A profile without username is cached for one day, not 30.
 const bare=igs(40);noUsername.add(bare);const contactAge=async(age:string)=>sql`UPDATE crm_instagram_contacts SET fetched_at=now()-${age}::interval WHERE igsid=${bare}`.execute(db);
 assert.equal((await send(payload(mid('nu1'),'no handle',false,bare))).status,200);assert.equal((await sql<{username:string|null}>`SELECT username FROM crm_instagram_contacts WHERE igsid=${bare}`.execute(db)).rows[0].username,null);
 let lookups=profileCalls();await contactAge('1 hour');assert.equal((await send(payload(mid('nu2'),'still cached',false,bare))).status,200);assert.equal(profileCalls(),lookups,'cached for a day');
 await contactAge('2 days');assert.equal((await send(payload(mid('nu3'),'retry',false,bare))).status,200);assert.equal(profileCalls(),lookups+1,'a null username is looked up again after a day');

 // The request has an overall deadline: later messages are stored unmatched with the IGSID instead of calling Meta again.
 const slow=[20,21,22,23].map(igs);slow.forEach((id,i)=>profiles.set(id,uname('d'+i)));lookupDelay=250;lookups=profileCalls();
 const slowRes=await post(request(envelope(...slow.map((id,i)=>({sender:{id},recipient:{id:accountId},timestamp:Date.now(),message:{mid:mid('dl'+i),text:'deadline '+i}})))),{deadlineMs:400});lookupDelay=0;assert.equal(slowRes.status,200);
 assert.ok(profileCalls()-lookups>=1&&profileCalls()-lookups<=2,'Meta is not called after the deadline');
 const slowRows=await Promise.all(slow.map((_,i)=>inboundRow(mid('dl'+i))));assert.equal(slowRows[0][0].address,'@'+uname('d0'));assert.equal(slowRows[3][0].status,'unmatched');assert.equal(slowRows[3][0].address,slow[3]);assert.equal(slowRows[3][0].igsid,slow[3]);

 // HTTP edges: oversized body, malformed JSON, valid-format signature over a tampered body.
 assert.equal((await post(signed('x'.repeat(1048577)))).status,413);
 assert.equal((await post(signed('{not json'))).status,400);
 const tamperedMid=mid('tamper'),tampered=await post(signed(JSON.stringify(payload('other-'+run,'original')),JSON.stringify(payload(tamperedMid,'tampered'))));assert.equal(tampered.status,401);assert.equal((await inboundRow(tamperedMid)).length,0);

 // GET verification needs a configured token of at least 32 characters.
 const verifyUrl='http://localhost/_api/inbound/instagram?hub.mode=subscribe&hub.verify_token=short&hub.challenge=x',keepVerify=process.env.INSTAGRAM_VERIFY_TOKEN;
 process.env.INSTAGRAM_VERIFY_TOKEN='short';assert.equal((await verify(new Request(verifyUrl))).status,503);delete process.env.INSTAGRAM_VERIFY_TOKEN;assert.equal((await verify(new Request(verifyUrl))).status,503);process.env.INSTAGRAM_VERIFY_TOKEN=keepVerify;

 // Missing app secret answers 503 and registers nothing.
 const keep=process.env.INSTAGRAM_APP_SECRET;delete process.env.INSTAGRAM_APP_SECRET;
 const noSecret=await send(payload(mid('nosecret'),'No secret'));assert.equal(noSecret.status,503);assert.equal((await inboundRow(mid('nosecret'))).length,0);process.env.INSTAGRAM_APP_SECRET=keep;

 // Expired token: stored unmatched with the IGSID and Meta is never called.
 const igsidExp=igs(7);profiles.set(igsidExp,username);
 await sql`UPDATE crm_integration_secrets SET expires_at=now()-interval '1 day' WHERE name='instagram'`.execute(db);const callsExp=profileCalls();
 assert.equal((await send(payload(mid('expired'),'No profile lookup',false,igsidExp))).status,200);assert.equal(profileCalls(),callsExp,'expired account tokens never call Meta');
 rows=await inboundRow(mid('expired'));assert.equal(rows[0].status,'unmatched');assert.equal(rows[0].address,igsidExp);

 // Renewal skipped when the advisory lock is held by another session.
 await setSecret('mock-token','2 days','30 days');const heldBefore=await secretRow();
 await holder.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(881045)`;await refreshInstagramToken();});
 assert.equal(refreshCalls(),0,'renewal must not call Meta while the lock is taken');const held=await secretRow();assert.equal(held.ciphertext,heldBefore.ciphertext);assert.equal(held.lastError,null);

 // Token younger than 24 h is not renewed.
 await setSecret('mock-token','1 hour','30 days');await refreshInstagramToken();assert.equal(refreshCalls(),0);

 // Failed renewal stores a fixed non-sensitive error and keeps the token.
 await setSecret('mock-token','2 days','30 days');refreshMode='fail';const failBefore=await secretRow();await refreshInstagramToken();
 assert.equal(refreshCalls(),1);const failed=await secretRow();assert.ok(failed.lastError&&failed.lastError.length>0);assert.ok(!failed.lastError.includes('mock-token')&&!failed.lastError.includes('denied'));assert.equal(failed.ciphertext,failBefore.ciphertext);
 const status=await integrationGET(new Request('http://localhost/_api/inbound/instagram/integration',{headers:{cookie:admin.cookie}}));const statusText=await status.text();responses.push(statusText);assert.equal(status.status,200);assert.equal(JSON.parse(statusText).lastError,failed.lastError);

 // A malformed renewal response keeps the old token and stores the same fixed error.
 refreshMode='malformed';await refreshInstagramToken();assert.equal(refreshCalls(),2);const malformed=await secretRow();assert.equal(malformed.ciphertext,failBefore.ciphertext);assert.equal(malformed.lastError,failed.lastError);assert.equal(decryptInstagramToken(malformed,key),'mock-token');

 // Successful renewal replaces the token, clears the error and moves the expiry.
 refreshMode='ok';await refreshInstagramToken();assert.equal(refreshCalls(),3);const renewed=await secretRow();assert.equal(renewed.lastError,null);assert.notEqual(renewed.ciphertext,failed.ciphertext);assert.equal(decryptInstagramToken(renewed,key),refreshedToken);assert.ok(renewed.expiresAt&&renewed.expiresAt.getTime()>Date.now()+50*86400000);

 // An admin pastes a token: write-only, never echoed back, the journal only says it was updated.
 const seller=await identity('user');
 const denied=await integrationPOST(new Request('http://localhost/_api/inbound/instagram/integration',{method:'POST',headers:{cookie:seller.cookie,'Content-Type':'application/json'},body:JSON.stringify({token:pastedToken})}));assert.equal(denied.status,403);responses.push(await denied.text());
 const saved=await integrationPOST(new Request('http://localhost/_api/inbound/instagram/integration',{method:'POST',headers:{cookie:admin.cookie,'Content-Type':'application/json'},body:JSON.stringify({token:pastedToken})}));assert.equal(saved.status,200);responses.push(await saved.text());
 assert.equal(decryptInstagramToken(await secretRow(),key),pastedToken);
 const journalText=JSON.stringify((await sql`SELECT * FROM crm_resource_journal WHERE entity='crm_integration_secrets' AND actor_email=${admin.user.email}`.execute(db)).rows)+JSON.stringify((await sql`SELECT * FROM crm_communication_journal WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db)).rows);
 assert.match(journalText,/token_updated/);

 // The token is nowhere visible: responses, logs, journals, stored columns.
 const stored=JSON.stringify(await secretRow());
 for(const token of ['mock-token',refreshedToken,pastedToken])for(const [where,text] of Object.entries({responses:responses.join('\n'),logs:logged.join('\n'),journals:journalText,stored})){assert.ok(!text.includes(token),`token "${token}" leaked into ${where}`);assert.ok(!text.includes(Buffer.from(token).toString('base64')),`encoded token leaked into ${where}`);}
 console.log('Instagram webhook integration checks passed');
}finally{
 for(const level of ['log','warn','error','info'] as const)console[level]=old[level] as typeof console.log;
 try{
  const like='%-'+run;
  await sql`DELETE FROM crm_messages WHERE external_id LIKE ${like}`.execute(db);
  await sql`DELETE FROM crm_inbound_messages WHERE external_id LIKE ${like}`.execute(db);
  await sql`DELETE FROM crm_instagram_contacts WHERE igsid=ANY(${usedIgsids})`.execute(db);
  if(accountIds.length){await sql`DELETE FROM crm_communication_journal WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db);await sql`DELETE FROM crm_messages WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db);await sql`DELETE FROM crm_inbound_messages WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db);for(const table of ['lead_journal','crm_pipeline_events','crm_objections'])await sql.raw(`DELETE FROM ${table} WHERE account_id=ANY('{${accountIds.join(',')}}'::bigint[])`).execute(db);await sql`DELETE FROM leads WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db);await sql`DELETE FROM crm_commercial_journal WHERE account_id=ANY(${accountIds}::bigint[])`.execute(db);await sql`DELETE FROM crm_accounts WHERE id=ANY(${accountIds}::bigint[])`.execute(db);}
  if(userEmails.length){await sql`DELETE FROM crm_resource_journal WHERE entity='crm_integration_secrets' AND actor_email=ANY(${userEmails})`.execute(db);await sql`DELETE FROM sessions WHERE id=ANY(${userEmails})`.execute(db);await sql`DELETE FROM users WHERE email=ANY(${userEmails})`.execute(db);}
  if(previousSecret)await sql`UPDATE crm_integration_secrets SET ciphertext=${previousSecret.ciphertext},iv=${previousSecret.iv},tag=${previousSecret.tag},expires_at=${previousSecret.expiresAt},refreshed_at=${previousSecret.refreshedAt},last_error=${previousSecret.lastError} WHERE name='instagram'`.execute(db);else await sql`DELETE FROM crm_integration_secrets WHERE name='instagram'`.execute(db);
 }finally{globalThis.fetch=old.fetch;for(const [name,value] of Object.entries({INSTAGRAM_APP_SECRET:old.secret,INSTAGRAM_ACCOUNT_ID:old.account,INSTAGRAM_VERIFY_TOKEN:old.verify,INTEGRATION_SECRETS_KEY:old.key}))if(value===undefined)delete process.env[name];else process.env[name]=value;await holder.end();await db.destroy();}
}
