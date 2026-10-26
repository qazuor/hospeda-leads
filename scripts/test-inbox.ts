import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sql,type RawBuilder} from 'kysely';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {app} from '../src/server/app';

assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable database');
const stamp=Date.now(),cleanupAccountIds:string[]=[],cleanupEmails:string[]=[];
async function identity(role:'admin'|'user'){
 const email=`inbox-${role}-${randomUUID()}@example.com`;cleanupEmails.push(email);
 const user=await db.insertInto('users').values({email,displayName:role,role}).returningAll().executeTakeFirstOrThrow();
 const session={id:user.email,createdAt:Date.now(),lastAccessed:Date.now()};await db.insertInto('sessions').values({id:session.id,userId:user.id,expiresAt:new Date(Date.now()+3600000)}).execute();const response=new Response();await setServerSession(response,session);return {user,cookie:response.headers.get('set-cookie')!.split(';')[0]};
}
type Identity=Awaited<ReturnType<typeof identity>>;
const request=(path:string,cookie?:string)=>app.request('/_api/inbox/'+path,{headers:cookie?{cookie}:{}});
async function get<T>(path:string,who:Identity){const response=await request(path,who.cookie);return {status:response.status,body:superjson.parse<T>(await response.text())};}
async function ok<T>(path:string,who:Identity){const result=await get<T>(path,who);assert.equal(result.status,200,`${path} → ${JSON.stringify(result.body)}`);return result.body;}
const account=async(name:string,owner:string)=>{const row=await db.insertInto('crmAccounts').values({nombre:`${name} ${stamp}`,ciudad:'Colón',assignedUserEmail:owner}).returningAll().executeTakeFirstOrThrow();cleanupAccountIds.push(String(row.id));return row;};
const management=(accountId:string,name:string,owner:string)=>db.insertInto('leads').values({accountId,nombre:`${name} ${stamp}`,opportunityName:`${name} ${stamp}`,estado:'Cargado',assignedUserEmail:owner}).returningAll().executeTakeFirstOrThrow();
type InboundFixture={accountId:string;leadId?:string|null;channel?:'email'|'whatsapp';status?:string;automatic?:boolean;at?:RawBuilder<unknown>;subject?:string;text:string};
async function inbound(fixture:InboundFixture){
 const id=randomUUID(),channel=fixture.channel??'email';
 await sql`INSERT INTO crm_inbound_messages(id,channel,external_id,account_id,lead_id,match_method,from_address,from_name,subject,text_body,headers,is_automatic,received_at,status,source) VALUES(${id}::uuid,${channel},${'inbox-'+stamp+'-'+id},${fixture.accountId},${fixture.leadId??null},'sender_email','guest@example.test','Guest',${fixture.subject??'Consulta'},${fixture.text},'{}'::jsonb,${fixture.automatic??false},${fixture.at??sql`now()`},${fixture.status??'registered'},${channel==='whatsapp'?'userscript':'email_worker'})`.execute(db);
 return id;
}
async function outbound(fixture:{accountId:string;leadId:string|null;owner:string;status?:string;at?:RawBuilder<unknown>;body:string}){
 const id=randomUUID();
 await sql`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,channel,recipient,recipient_name,subject,body,owner_email,status,last_interaction_at,created_at) VALUES(${id}::uuid,${fixture.accountId},${fixture.accountId},${fixture.leadId},'email','guest@example.test','Guest','Saliente',${fixture.body},${fixture.owner},${fixture.status??'manual_sent'},${fixture.at??sql`now()`},${fixture.at??sql`now()`})`.execute(db);
 return id;
}
/** Pages through a cursor endpoint (failing on loops) and returns every row in order plus the page count. */
async function allPages<T>(path:string,who:Identity){
 const rows:T[]=[];let cursor:string|null='',pages=0;
 do{const body:{rows:T[];nextCursor:string|null}=await ok(`${path}${cursor?'&cursor='+encodeURIComponent(cursor):''}`,who);rows.push(...body.rows);cursor=body.nextCursor;pages++;assert(pages<50,'Cursor pagination does not terminate');}while(cursor);
 return {rows,pages};
}
type BusinessRow={accountId:string;pendingCount:number;lastDirection:string;lastPreview:string};
type ThreadsRow={leadId:string|null;leadTitle:string;channel:string;pendingCount:number;messageCount:number};
type ThreadItem={id:string;kind:string;dismissed:boolean;replyAvailable:boolean;replyRestricted:boolean};
type SearchRow={id:string;kind:string;accountId:string;accountName:string;leadId:string|null;leadTitle:string|null};
const businesses=async(query:string,who:Identity)=>(await ok<{rows:BusinessRow[]}>(`businesses?${query}`,who)).rows;
const search=async(q:string,who:Identity,extra='')=>(await ok<{rows:SearchRow[]}>(`search?q=${encodeURIComponent(q)}&limit=100${extra}`,who)).rows;
let testError:unknown;
try{
 const admin=await identity('admin'),seller=await identity('user'),other=await identity('user'),pager=await identity('user');
 for(const path of ['businesses','threads?accountId=1','thread?accountId=1&leadId=none&channel=email','search?q=precio'])assert.equal((await request(path)).status,401,`Unauthenticated ${path}`);

 // Business owned by the seller: General activity, the seller's managements and another seller's management.
 const main=await account('Inbox fixture',seller.user.email),mainId=String(main.id);
 const lead=await management(mainId,'Inbox management',seller.user.email),otherLead=await management(mainId,'Other management',other.user.email),restrictedLead=await management(mainId,'Restricted management',seller.user.email),trashedLead=await management(mainId,'Trashed management',seller.user.email);
 const generalPending=await inbound({accountId:mainId,status:'pending_review',text:'Précio y año'});
 const dismissedId=await inbound({accountId:mainId,status:'dismissed',text:'Fixture inbound dismissed',at:sql`now()+interval '1 second'`});
 const unmatchedId=await inbound({accountId:mainId,status:'unmatched',text:'Fixture inbound unmatched',at:sql`now()+interval '2 seconds'`});
 await inbound({accountId:mainId,status:'pending_review',automatic:true,text:'Automatic pending fixture',at:sql`now()+interval '3 seconds'`});
 // Every row of this conversation shares one microsecond-precise instant, so pages are split only by the id tiebreak.
 const tieAt=sql`'2026-10-20 12:00:00.123456+00'::timestamptz`;
 const tieIds=(await sql<{id:string}>`INSERT INTO crm_inbound_messages(id,channel,external_id,account_id,lead_id,match_method,from_address,from_name,subject,text_body,headers,is_automatic,received_at,status,source) SELECT gen_random_uuid(),'email','inbox-'||${String(stamp)}||'-tie-'||g,${mainId},${lead.id},'sender_email','guest@example.test','Guest','Pagination','Equal timestamp test item','{}'::jsonb,false,${tieAt},'registered','email_worker' FROM generate_series(1,52) g RETURNING id::text AS id`.execute(db)).rows.map(row=>row.id);
 await inbound({accountId:mainId,leadId:String(lead.id),status:'pending_review',at:tieAt,subject:'Pending work',text:'Management pending fixture'});
 await inbound({accountId:mainId,leadId:String(lead.id),status:'pending_review',automatic:true,at:tieAt,subject:'Pending work',text:'Management pending fixture'});
 const validOutId=await outbound({accountId:mainId,leadId:String(lead.id),owner:seller.user.email,at:tieAt,body:'Valid outbound timeline item'});
 const excludedIds=[await outbound({accountId:mainId,leadId:String(lead.id),owner:seller.user.email,status:'draft',at:sql`now()+interval '1 day'`,body:'excluded outbound draft'}),await outbound({accountId:mainId,leadId:String(lead.id),owner:seller.user.email,status:'cancelled',at:sql`now()+interval '1 day'`,body:'excluded outbound cancelled'})];
 await inbound({accountId:mainId,channel:'whatsapp',text:'Channel grouping fixture'});
 await inbound({accountId:mainId,leadId:String(lead.id),channel:'whatsapp',text:'Channel grouping fixture'});
 await inbound({accountId:mainId,channel:'whatsapp',status:'pending_review',text:'Pending whatsapp general'});
 const foreignInId=await inbound({accountId:mainId,leadId:String(otherLead.id),status:'pending_review',text:'foreign management note'});
 const foreignOutId=await outbound({accountId:mainId,leadId:String(otherLead.id),owner:other.user.email,body:'foreign management reply'});
 const restrictedIn=await inbound({accountId:mainId,leadId:String(restrictedLead.id),text:'restricted management message',at:sql`now()-interval '2 days'`});
 await sql`INSERT INTO crm_contact_restrictions(account_id,lead_id,channel,reason,actor_email) VALUES(${mainId},${restrictedLead.id},'email','Pidió no recibir emails',${admin.user.email})`.execute(db);
 const trashedIn=await inbound({accountId:mainId,leadId:String(trashedLead.id),text:'trashed management note'});
 await sql`UPDATE leads SET deleted_at=now() WHERE id=${trashedLead.id}`.execute(db);

 // Business owned by another seller where the seller only owns one management.
 const hidden=await account('Inbox hidden',other.user.email),hiddenId=String(hidden.id);
 const ownedManagement=await management(hiddenId,'Seller management',seller.user.email),hiddenOtherLead=await management(hiddenId,'Hidden other management',other.user.email);
 const hiddenInboundId=await inbound({accountId:hiddenId,leadId:String(ownedManagement.id),status:'pending_review',text:'hidden searchable fixture'});
 const hiddenGeneralId=await inbound({accountId:hiddenId,status:'pending_review',text:'hidden general fixture'});
 const hiddenOtherId=await inbound({accountId:hiddenId,leadId:String(hiddenOtherLead.id),text:'hidden other fixture'});
 const outside=await account('Inbox outside',other.user.email),outsideInboundId=await inbound({accountId:String(outside.id),text:'outside fixture'});
 // Archived: readable only by an admin or the business's own seller.
 const archivedOwned=await account('Inbox archived owned',seller.user.email),archivedOwnedIn=await inbound({accountId:String(archivedOwned.id),text:'archived visibility fixture owned'});
 const archivedForeign=await account('Inbox archived foreign',other.user.email),archivedLead=await management(String(archivedForeign.id),'Archived management',seller.user.email);
 const archivedForeignIn=await inbound({accountId:String(archivedForeign.id),leadId:String(archivedLead.id),text:'archived visibility fixture foreign'});
 await sql`UPDATE crm_accounts SET archived_at=now() WHERE id IN (${archivedOwned.id},${archivedForeign.id})`.execute(db);
 // Deleted business: hidden from everyone.
 const deleted=await account('Inbox deleted',seller.user.email),deletedIn=await inbound({accountId:String(deleted.id),text:'deleted business fixture'});
 await sql`UPDATE crm_accounts SET deleted_at=now() WHERE id=${deleted.id}`.execute(db);

 // Businesses list, pending counts and channel filter.
 const sellerAll=await businesses('filter=all&limit=100',seller),mainRow=sellerAll.find(row=>row.accountId===mainId);
 assert.equal(mainRow?.pendingCount,4,'Pending = non-automatic pending_review, including another seller management in the owner business');
 assert.equal(mainRow?.lastDirection,'in');assert(!mainRow?.lastPreview.includes('Fixture inbound'),'Dismissed and unmatched do not become last activity');
 assert.equal((await businesses('filter=all&channel=email&limit=100',seller)).find(row=>row.accountId===mainId)?.pendingCount,3,'Pending count respects the channel filter (email)');
 assert.equal((await businesses('filter=all&channel=whatsapp&limit=100',seller)).find(row=>row.accountId===mainId)?.pendingCount,1,'Pending count respects the channel filter (whatsapp)');
 assert.equal((await businesses('filter=all&channel=call&limit=100',seller)).find(row=>row.accountId===mainId),undefined,'A channel without activity hides the business');
 const adminAll=await businesses('filter=all&scope=all&limit=100',admin),adminMine=await businesses('filter=all&scope=mine&limit=100',admin);
 assert.equal(adminAll.find(row=>row.accountId===mainId)?.pendingCount,4,'Admin pending count');
 assert.equal(sellerAll.find(row=>row.accountId===hiddenId)?.pendingCount,1,'A management owner counts only the pending of her management');
 assert.equal(adminAll.find(row=>row.accountId===hiddenId)?.pendingCount,2,'Admin counts every pending of the business');
 assert((await businesses('filter=pending&limit=100',seller)).some(row=>row.accountId===mainId),'Pending filter returns reviewable inbound');
 // Scope: the seller would see `outside` if scope=all were honored for her; admin scope=all does, admin scope=mine does not.
 const sellerScopeAll=await businesses('filter=all&scope=all&limit=100',seller);
 assert(adminAll.some(row=>row.accountId===String(outside.id)),'Admin scope=all sees the team');
 assert(!adminMine.some(row=>row.accountId===String(outside.id)),'Admin scope=mine sees only own businesses and managements');
 assert(!sellerScopeAll.some(row=>row.accountId===String(outside.id)),'Seller scope=all is forced to mine');
 assert.deepEqual(sellerScopeAll.map(row=>row.accountId),sellerAll.map(row=>row.accountId),'Seller scope=all equals scope=mine');
 assert(sellerAll.some(row=>row.accountId===hiddenId),'Seller sees a business through an owned management');
 assert(sellerAll.some(row=>row.accountId===String(archivedOwned.id)),'Seller sees her archived business');
 assert(!sellerAll.some(row=>row.accountId===String(archivedForeign.id)),'Archived business of another seller is hidden even with an owned management');
 assert(adminAll.some(row=>row.accountId===String(archivedForeign.id)),'Admin sees archived businesses');
 assert(!sellerAll.some(row=>row.accountId===String(deleted.id))&&!adminAll.some(row=>row.accountId===String(deleted.id)),'Deleted business is hidden from everyone');

 // Businesses cursor: three businesses whose last activity is the same microsecond.
 const pageAt=sql`'2026-10-21 12:00:00.123456+00'::timestamptz`,pagerIds:string[]=[];
 for(const index of [1,2,3]){const row=await account(`Inbox pager ${index}`,pager.user.email);pagerIds.push(String(row.id));await inbound({accountId:String(row.id),at:pageAt,text:'pager boundary fixture'});}
 const pagedBusinesses=await allPages<BusinessRow>('businesses?filter=all&limit=1',pager);
 assert.deepEqual(pagedBusinesses.rows.map(row=>row.accountId),[...pagerIds].sort((a,b)=>Number(b)-Number(a)),'Businesses cursor keeps rows sharing the boundary instant, no gaps or duplicates');assert.equal(pagedBusinesses.pages,3);

 // Threads of a business.
 const threads=(await ok<{rows:ThreadsRow[]}>(`threads?accountId=${mainId}`,seller)).rows,thread=(leadId:string|null,channel='email')=>threads.find(row=>row.leadId===leadId&&row.channel===channel);
 assert(thread(null)&&thread(String(lead.id))&&thread(null,'whatsapp')&&thread(String(lead.id),'whatsapp'),'General and management conversations are grouped per channel');
 assert.equal(thread(null)?.leadTitle,'General');
 assert.equal(thread(String(otherLead.id))?.messageCount,2,'Business owner sees inbound and outbound of another seller management');
 assert.equal(thread(String(lead.id))!.pendingCount,1,'Only non-automatic pending_review items count');assert.equal(thread(String(lead.id))!.messageCount,55,'Draft and cancelled outbounds do not count');
 assert(!thread(String(trashedLead.id)),'Deleted management is hidden from sellers');
 assert(!(await ok<{rows:ThreadsRow[]}>(`threads?accountId=${mainId}`,admin)).rows.some(row=>row.leadId===String(trashedLead.id)),'Deleted management is hidden from admin lists too, like Hoy (reviewGET)');
 const hiddenThreads=(await ok<{rows:ThreadsRow[]}>(`threads?accountId=${hiddenId}`,seller)).rows;
 assert.deepEqual(hiddenThreads.map(row=>row.leadId),[String(ownedManagement.id)],'A management owner sees only her management, not General nor others');
 assert.equal((await request(`thread?accountId=${hiddenId}&leadId=none&channel=email`,seller.cookie)).status,403,'Management ownership does not grant access to general detail');
 assert.equal((await request(`thread?accountId=${hiddenId}&leadId=${hiddenOtherLead.id}&channel=email`,seller.cookie)).status,403,'Management ownership does not grant another management of the business');
 assert.equal((await request(`threads?accountId=${archivedOwned.id}`,seller.cookie)).status,200,'Seller reads her archived business');
 assert.equal((await request(`threads?accountId=${archivedForeign.id}`,seller.cookie)).status,403,'Archived business of another seller is forbidden');
 assert.equal((await request(`thread?accountId=${archivedForeign.id}&leadId=${archivedLead.id}&channel=email`,seller.cookie)).status,403);
 assert.equal((await request(`threads?accountId=${deleted.id}`,seller.cookie)).status,403,'Deleted business is forbidden');
 assert.equal((await request(`thread?accountId=${mainId}&leadId=${trashedLead.id}&channel=email`,seller.cookie)).status,403,'Deleted management detail is forbidden to sellers');
 assert.equal((await request(`thread?accountId=${mainId}&leadId=${trashedLead.id}&channel=email`,admin.cookie)).status,200,'Admin reads a deleted management');

 // Thread detail: another seller's management through business ownership, pagination on equal microsecond timestamps.
 const foreign=await ok<{rows:ThreadItem[]}>(`thread?accountId=${mainId}&leadId=${otherLead.id}&channel=email`,seller);
 assert.deepEqual(foreign.rows.map(row=>row.id).sort(),[foreignInId,foreignOutId].sort(),'Business owner reads another seller management');
 const pagedThread=await allPages<ThreadItem>(`thread?accountId=${mainId}&leadId=${lead.id}&channel=email&limit=50`,seller),pageIds=pagedThread.rows.map(row=>row.id);
 assert.equal(pagedThread.pages,2,'More than 50 items have a cursor');assert.equal(pageIds.length,55,'Thread cursor keeps rows sharing the microsecond');assert.equal(new Set(pageIds).size,55,'No duplicates');
 assert(pageIds.includes(validOutId)&&tieIds.every(id=>pageIds.includes(id)),'Inbound and outbound rows are merged');
 assert(!excludedIds.some(id=>pageIds.includes(id)),'Draft and cancelled outbounds are excluded');
 const generalDetail=await ok<{rows:ThreadItem[]}>(`thread?accountId=${mainId}&leadId=none&channel=email`,seller);
 assert(generalDetail.rows.some(row=>row.id===dismissedId&&row.dismissed),'Dismissed inbound appears in detail');assert(!generalDetail.rows.some(row=>row.id===unmatchedId),'Unmatched inbound is never visible');

 // Reply availability parity with GET /_api/communication, including a restricted management.
 for(const leadId of [String(lead.id),String(restrictedLead.id)]){
  const communication=superjson.parse<{inbound:{id:string;canReply:unknown;replyRestricted:unknown}[]}>(await (await app.request(`/_api/communication?leadId=${leadId}`,{headers:{cookie:seller.cookie}})).text());
  const items=(await ok<{rows:ThreadItem[]}>(`thread?accountId=${mainId}&leadId=${leadId}&channel=email&limit=200`,seller)).rows.filter(row=>row.kind==='in');
  assert(items.length>0);
  for(const item of items){const expected=communication.inbound.find(row=>row.id===item.id);assert(expected,`Communication lists inbound ${item.id}`);assert.equal(typeof item.replyAvailable,'boolean');assert.equal(typeof item.replyRestricted,'boolean');assert.equal(item.replyAvailable,expected.canReply,'replyAvailable matches communication');assert.equal(item.replyRestricted,expected.replyRestricted,'replyRestricted matches communication');}
 }
 const restrictedItem=(await ok<{rows:ThreadItem[]}>(`thread?accountId=${mainId}&leadId=${restrictedLead.id}&channel=email`,seller)).rows.find(row=>row.id===restrictedIn);
 assert.equal(restrictedItem?.replyRestricted,true,'An email restriction marks the reply as restricted');assert.equal(restrictedItem?.replyAvailable,false,'A restriction newer than the inbound blocks the reply');

 // Error mapping: Zod before queries, missing records are 404 with a Spanish message.
 for(const path of ['threads?accountId=abc','thread?accountId=abc&leadId=none&channel=email',`thread?accountId=${mainId}&leadId=x&channel=email`,`thread?accountId=${mainId}&leadId=none&channel=fax`,'search?q=precio&from=2026-13-01','businesses?filter=nope'])assert.equal((await request(path,seller.cookie)).status,400,`Invalid input ${path}`);
 const missingAccount=await get<{error:string}>('threads?accountId=999999999999',seller);assert.equal(missingAccount.status,404);assert.equal(missingAccount.body.error,'No encontramos ese negocio.');
 assert.equal((await get<{error:string}>('thread?accountId=999999999999&leadId=none&channel=email',seller)).status,404);
 const missingLead=await get<{error:string}>(`thread?accountId=${mainId}&leadId=999999999999&channel=email`,seller);assert.equal(missingLead.status,404);assert.equal(missingLead.body.error,'No encontramos esa gestión en este negocio.');
 assert.equal((await request(`thread?accountId=${mainId}&leadId=${ownedManagement.id}&channel=email`,seller.cookie)).status,404,'A management of another business is not found in this one');

 // Search: visibility, row fields, cursors, escaping, dates.
 const general=(await search('precio',seller)).find(row=>row.id===generalPending);
 assert(general,'Accent insensitive search finds Précio');assert.equal(general.accountId,mainId);assert.equal(general.accountName,`Inbox fixture ${stamp}`);assert.equal(general.leadId,null);assert.equal(general.leadTitle,'General');
 const managementHit=(await search('foreign management note',seller)).find(row=>row.id===foreignInId);
 assert(managementHit,'Business owner finds another seller management message');assert.equal(managementHit.accountId,mainId);assert.equal(managementHit.leadId,String(otherLead.id));assert.equal(managementHit.leadTitle,`Other management ${stamp}`);
 assert((await search('foreign management reply',seller)).some(row=>row.id===foreignOutId&&row.kind==='out'),'Business owner finds another seller outbound');
 const hiddenHits=await search('hidden',seller);
 assert(hiddenHits.some(row=>row.id===hiddenInboundId),'Seller search sees her management on another owner business');
 assert(!hiddenHits.some(row=>row.id===hiddenGeneralId||row.id===hiddenOtherId),'Management owner does not find General or other managements');
 assert(!(await search('outside',seller,'&scope=all')).some(row=>row.id===outsideInboundId),'Seller search excludes businesses outside her visibility');
 assert((await search('outside',admin,'&scope=all')).some(row=>row.id===outsideInboundId),'Admin scope=all searches the team');
 assert(!(await search('outside',admin,'&scope=mine')).some(row=>row.id===outsideInboundId),'Admin scope=mine searches only her own');
 const archivedHits=await search('archived visibility fixture',seller);assert(archivedHits.some(row=>row.id===archivedOwnedIn)&&!archivedHits.some(row=>row.id===archivedForeignIn),'Search follows archived visibility');
 assert(!(await search('trashed management',seller)).some(row=>row.id===trashedIn),'Deleted management is hidden from seller search');
 assert(!(await search('deleted business fixture',admin,'&scope=all')).some(row=>row.id===deletedIn),'Deleted business is hidden from search');
 assert(!(await search('ano',seller)).some(row=>row.id===generalPending),'Search retains ñ distinction');
 const fixtureHits=await search('Fixture inbound',seller);assert(!fixtureHits.some(row=>row.id===dismissedId||row.id===unmatchedId),'Dismissed and unmatched messages never appear in search');
 assert(!(await search('excluded',seller)).some(row=>excludedIds.includes(row.id)),'Draft and cancelled outbound messages are excluded from search');
 const pagedSearch=await allPages<SearchRow>(`search?q=${encodeURIComponent('Equal timestamp')}&limit=20`,seller),searchIds=pagedSearch.rows.map(row=>row.id);
 assert.equal(pagedSearch.pages,3);assert.deepEqual([...searchIds].sort(),[...tieIds].sort(),'Search cursor keeps rows sharing the microsecond, no gaps or duplicates');
 const pagerAccount=pagerIds[0],literal=(text:string)=>inbound({accountId:pagerAccount,at:pageAt,text});
 const percent=await literal('descuento 10% fijo');await literal('descuento 100 fijo');const underscore=await literal('clave a_b fija');await literal('clave axb fija');const backslash=await literal('clave a\\b barra');const triple=await literal('tres %%% juntos');
 const ids=async(q:string,extra='')=>(await search(q,pager,extra)).map(row=>row.id);
 assert.deepEqual(await ids('10%'),[percent],'% is literal');
 assert.deepEqual(await ids('a_b'),[underscore],'_ is literal');
 assert.deepEqual(await ids('a\\b'),[backslash],'\\ is literal');
 assert.deepEqual(await ids('%%%'),[triple],'%%% matches only the literal text');
 const boundary=await inbound({accountId:pagerAccount,at:sql`'2026-10-15 02:30:00+00'::timestamptz`,text:'boundary datefilter fixture'});
 assert.deepEqual(await ids('datefilter'),[boundary]);
 assert.deepEqual(await ids('datefilter','&from=2026-10-14&to=2026-10-14'),[boundary],'23:30 ART belongs to that Argentina day');
 assert.deepEqual(await ids('datefilter','&from=2026-10-15'),[],'Not on the next day');
 assert.deepEqual(await ids('datefilter','&to=2026-10-13'),[],'Not before');
 assert.equal((await request('search?q=datefilter&from=2026-10-15&to=2026-10-14',pager.cookie)).status,400,'Inverted range');
 assert.equal((await request('search?q=precio&cursor=invalid',seller.cookie)).status,400);
 const short=await ok<{queryTooShort:boolean;rows:unknown[]}>('search?q=ab',seller);assert.equal(short.queryTooShort,true);assert.deepEqual(short.rows,[]);
}catch(error){
 testError=error;
}finally{
 let cleanupError:unknown;
 try{
  if(cleanupAccountIds.length){
   const ids=sql.join(cleanupAccountIds.map(id=>sql`${id}::bigint`));
   // Direct account references must be removed before the fixture accounts.
   await sql`DELETE FROM crm_communication_journal WHERE account_id IN (${ids}) OR original_account_id IN (${ids})`.execute(db);
   await sql`DELETE FROM crm_communication_response_corrections WHERE account_id IN (${ids})`.execute(db);
   await sql`DELETE FROM crm_communication_interaction_corrections WHERE account_id IN (${ids})`.execute(db);
   await sql`DELETE FROM crm_communication_responses WHERE account_id IN (${ids}) OR original_account_id IN (${ids})`.execute(db);
   await sql`DELETE FROM crm_document_links WHERE account_id IN (${ids}) OR original_account_id IN (${ids})`.execute(db);
   await sql`DELETE FROM crm_documents WHERE account_id IN (${ids}) OR original_account_id IN (${ids})`.execute(db);
   await sql`DELETE FROM crm_messages WHERE account_id IN (${ids}) OR original_account_id IN (${ids})`.execute(db);
   await sql`DELETE FROM crm_inbound_messages WHERE external_id LIKE ${`inbox-${stamp}-%`}`.execute(db);
   await sql`DELETE FROM crm_contact_restrictions WHERE account_id IN (${ids})`.execute(db);
   await sql`DELETE FROM crm_contacts WHERE account_id IN (${ids})`.execute(db);
   await sql`DELETE FROM crm_activities WHERE account_id IN (${ids})`.execute(db);
   await sql`DELETE FROM crm_tasks WHERE account_id IN (${ids})`.execute(db);
   await sql`DELETE FROM lead_journal WHERE account_id IN (${ids})`.execute(db);
   await sql`DELETE FROM crm_pipeline_events WHERE account_id IN (${ids})`.execute(db);
   await sql`DELETE FROM crm_objections WHERE account_id IN (${ids})`.execute(db);
   await sql`DELETE FROM leads WHERE account_id IN (${ids})`.execute(db);
   // Lead deletion can trigger a business status journal entry.
   await sql`DELETE FROM crm_commercial_journal WHERE account_id IN (${ids})`.execute(db);
   await db.deleteFrom('crmAccounts').where('id','in',cleanupAccountIds).execute();
  }
  // Every user created so far is removed, even when a later fixture failed.
  if(cleanupEmails.length){await db.deleteFrom('sessions').where('id','in',cleanupEmails).execute();await db.deleteFrom('users').where('email','in',cleanupEmails).execute();}
 }catch(error){cleanupError=error;console.error('Inbox fixture cleanup failed:',error)}
 try{await db.destroy()}catch(error){cleanupError??=error;console.error('Inbox database close failed:',error)}
 if(testError)throw testError;
 if(cleanupError)throw cleanupError;
}
console.log('Inbox integration tests passed');
