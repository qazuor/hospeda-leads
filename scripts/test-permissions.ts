import assert from 'node:assert/strict';
import superjson from 'superjson';
import {sql} from 'kysely';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {get as commercialGet,post as commercialPost} from '../src/endpoints/commercial';
import {handle as list} from '../src/endpoints/leads_GET';
import {handle as settings} from '../src/endpoints/settings_GET';
import {handle as quick} from '../src/endpoints/leads_quick_POST';
import {handle as save} from '../src/endpoints/leads_save_POST';
import {handle as legacy} from '../src/endpoints/leads_POST';
import {handle as remove} from '../src/endpoints/leads_delete_POST';
import {handle as bulk} from '../src/endpoints/leads_bulk_POST';
import {handle as bulkRemove} from '../src/endpoints/leads_bulk_delete_POST';
import {handle as note} from '../src/endpoints/lead_notes_POST';
import {handle as notes} from '../src/endpoints/lead_notes_GET';
import {handle as journal} from '../src/endpoints/lead_journal_GET';
import {get as communicationGet,post as communicationPost} from '../src/endpoints/communication';
import {get as qualityGet,post as qualityPost} from '../src/endpoints/dataQuality';
import {get as pipelineGet,post as pipelinePost} from '../src/endpoints/pipeline';
import {doNotContactSince} from '../src/helpers/doNotContactSince';
import {download as resourcesDownload,get as resourcesGet,post as resourcesPost} from '../src/endpoints/resources';
import {get as workGet,post as workPost} from '../src/endpoints/work';
import {handle as leadContact} from '../src/endpoints/lead_contact_POST';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable database with all migrations applied');
const suffix=Date.now(),dncPhone=`+54 9 3446 ${String(suffix).slice(-6)}`;let checks=0;
async function actor(role:'admin'|'user',name:string){
 const user=await db.insertInto('users').values({email:`permissions-${name}-${suffix}@example.com`,displayName:name,fullName:'Private full name',phone:'private-phone',sex:'otro',senderEmail:`permissions-${name}@hospeda.com.ar`,role}).returningAll().executeTakeFirstOrThrow();
 const sid='permission-'+user.id;
 await db.insertInto('sessions').values({id:sid,userId:user.id,expiresAt:new Date(Date.now()+3600000)}).execute();
 const r=new Response();await setServerSession(r,{id:sid,createdAt:Date.now(),lastAccessed:Date.now()});
 return {user,sessionId:sid,cookie:r.headers.get('set-cookie')!.split(';')[0]};
}
type Actor=Awaited<ReturnType<typeof actor>>;
async function call(a:Actor,handler:(r:Request)=>Promise<Response>,url:string,body?:unknown,status=200){
 const r=await handler(new Request('http://localhost/_api/'+url,{headers:{cookie:a.cookie},...(body===undefined?{}:{method:'POST',body:superjson.stringify(body)})}));
 const data=superjson.parse<any>(await r.text());assert.equal(r.status,status,`${url}: ${data.error??JSON.stringify(data)}`);checks++;return data;
}
try{
 const owner=await actor('user','owner'),other=await actor('user','other'),admin=await actor('admin','admin');
 const expired=await actor('user','expired');
 await db.updateTable('sessions').set({expiresAt:new Date(Date.now()-1000)}).where('id','=',expired.sessionId).execute();
 await call(expired,commercialGet,'commercial?accountId=00000000-0000-0000-0000-000000000000',undefined,401);
 const accountId=(await call(owner,commercialPost,'commercial',{action:'account_save',nombre:'Permission business '+suffix,email:'business@example.com'})).id;
 const ownOther=(await call(other,commercialPost,'commercial',{action:'account_save',nombre:'Colleague business '+suffix})).id;
 const leadId=(await call(owner,commercialPost,'commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:'Existing management',estado:'Cargado'})).id;
 const contactId=(await call(owner,commercialPost,'commercial',{action:'contact_save',accountId,name:'Known person',isPrimary:true,email:'person@example.com'})).id;
 const colleagueLead=(await call(other,commercialPost,'commercial',{action:'opportunity_save',accountId:ownOther,confirmReviewed:true,opportunityName:'Colleague management',estado:'Cargado'})).id;
 await call(other,quick,'leads_quick',{id:accountId,accountId,field:'ciudad',value:'Colón',expectedValue:null},403);
 await call(owner,quick,'leads_quick',{id:accountId,accountId,field:'assignedUserEmail',value:other.user.email,expectedValue:owner.user.email},403);
 const beforeInline=await call(owner,commercialGet,'commercial?accountId='+accountId);
 await call(owner,quick,'leads_quick',{id:accountId,accountId,field:'ciudad',value:'Colón',expectedValue:null});
 const afterInline=await call(owner,commercialGet,'commercial?accountId='+accountId);
 assert.equal(afterInline.account.ciudad,'Colón');assert.equal(afterInline.account.email,beforeInline.account.email);assert.equal(afterInline.account.telefono,beforeInline.account.telefono);assert.equal(afterInline.account.nombre,beforeInline.account.nombre);const commercialFields=(rows:any[])=>rows.map(({ciudad,updatedAt,pipelineRevision,...rest})=>rest);assert.deepEqual(commercialFields(afterInline.opportunities),commercialFields(beforeInline.opportunities));
 // The legacy pipeline guard increments its technical revision on every lead update,
 // including mirrored business data. All commercial fields must remain unchanged.
 for(const opportunity of afterInline.opportunities){
  const previous=beforeInline.opportunities.find((row:any)=>row.id===opportunity.id);
  assert(previous);assert.equal(opportunity.pipelineRevision,previous.pipelineRevision+1);
 }
 const countInline=afterInline.journal.length;
 await call(owner,quick,'leads_quick',{id:accountId,accountId,field:'ciudad',value:'Colón',expectedValue:null});assert.equal((await call(owner,commercialGet,'commercial?accountId='+accountId)).journal.length,countInline);
 await call(owner,quick,'leads_quick',{id:accountId,accountId,field:'ciudad',value:'Concordia',expectedValue:null},409);assert.equal((await call(owner,commercialGet,'commercial?accountId='+accountId)).account.ciudad,'Colón');
 await call(owner,quick,'leads_quick',{id:accountId,accountId,field:'ciudad',value:null,expectedValue:'Colón'});
 await call(admin,quick,'leads_quick',{id:ownOther,accountId:ownOther,field:'assignedUserEmail',value:owner.user.email,expectedValue:other.user.email});assert.equal((await call(admin,commercialGet,'commercial?accountId='+ownOther)).account.assignedUserEmail,owner.user.email);
 await call(admin,quick,'leads_quick',{id:ownOther,accountId:ownOther,field:'assignedUserEmail',value:other.user.email,expectedValue:owner.user.email});
 // Classification edits are atomic business writes; management labels are preserved.
 const verticalA='Inline vertical A '+suffix,verticalB='Inline vertical B '+suffix,subtypeA='Inline subtype A '+suffix,subtypeB='Inline subtype B '+suffix;
 await db.insertInto('crmVerticals').values([{name:verticalA},{name:verticalB}]).execute();
 await db.insertInto('crmSubtypes').values([{name:subtypeA,typeName:verticalA},{name:subtypeB,typeName:verticalB}]).execute();
 const classification=(field:'tipo'|'subtipo',value:string|null,tipo:string|null,subtipo:string|null)=>({id:accountId,accountId,scope:'business',field,value,expectedValue:field==='tipo'?tipo:subtipo,expectedClassification:{tipo,subtipo}});
 await call(other,quick,'leads_quick',classification('tipo',verticalA,null,null),403);
 await call(owner,quick,'leads_quick',classification('tipo',verticalA,null,null));
 await call(owner,quick,'leads_quick',classification('subtipo',subtypeB,verticalA,null),400);
 await call(owner,quick,'leads_quick',classification('subtipo',subtypeA,verticalA,null));
 await call(owner,quick,'leads_quick',classification('tipo',verticalB,verticalA,subtypeA));
 const changedClassification=await call(owner,commercialGet,'commercial?accountId='+accountId);
 assert.equal(changedClassification.account.tipo,verticalB);assert.equal(changedClassification.account.subtipo,null);
 assert.equal(changedClassification.opportunities[0].tipo,beforeInline.opportunities[0].tipo);
 await call(owner,quick,'leads_quick',classification('subtipo',subtypeA,verticalA,subtypeA),409);
 const historicalClassification=(await call(owner,commercialPost,'commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:'Historical classification fixture',tipo:verticalA})).id;
 await call(owner,quick,'leads_quick',classification('tipo',null,verticalB,null));
 const clearedClassification=await call(owner,list,'leads?entity=business&q='+encodeURIComponent('Permission business '+suffix));
 assert.equal(clearedClassification.rows[0].tipo,null);assert.equal(clearedClassification.rows[0].subtipo,null);assert.deepEqual(clearedClassification.rows[0].opportunityValues.tipo,[]);assert.deepEqual(clearedClassification.rows[0].opportunityValues.subtipo,[]);assert.equal(clearedClassification.rows[0].opportunityCount,2);
 assert.equal((await db.selectFrom('leads').select('tipo').where('id','=',historicalClassification).executeTakeFirstOrThrow()).tipo,verticalA);
 await call(owner,remove,'leads_delete',{id:historicalClassification});
 console.log('Inline business edits: owner/admin permissions, compare-and-set conflicts, idempotent retry, isolated field writes and management preservation passed');
 await call(other,commercialGet,'commercial?accountId='+accountId);
 const shared=await call(other,list,'leads?entity=business&q='+encodeURIComponent('Permission business '+suffix));assert.equal(shared.total,1);assert.equal(shared.rows[0].canModify,false);
 assert.equal((await call(owner,list,'leads?entity=business&q='+encodeURIComponent('Permission business '+suffix))).rows[0].canModify,true);
 assert.equal(shared.rows[0].canModifyManagement,false);
 const safe=await call(other,settings,'settings');assert.deepEqual(safe.authorizedEmails,[]);assert(!('emailDelivery' in safe));
 for(const u of safe.users)assert.deepEqual(Object.keys(u).sort(),['displayName','email','id','role']);
 const administrative=await call(admin,settings,'settings');assert(administrative.emailDelivery);assert(administrative.users.some((u:any)=>'hasPassword' in u&&'invitationPending' in u&&'phone' in u));
 for(const body of [
  {action:'account_save',id:accountId,nombre:'Unauthorized edit'},
  {action:'contact_save',accountId,id:contactId,name:'Unauthorized person',isPrimary:false},
  {action:'contact_delete',accountId,id:contactId},
  {action:'opportunity_save',accountId,id:leadId,opportunityName:'Unauthorized management'},
  {action:'opportunity_save',accountId,opportunityName:'Unauthorized new management'},
  {action:'convert_client',accountId,reason:'Unauthorized conversion'},
  {action:'account_archive',accountId,archived:true,reason:'Unauthorized archive'},
 ])await call(other,commercialPost,'commercial',body,403);
 await call(other,quick,'leads_quick',{id:leadId,field:'ciudad',value:'Unauthorized city'},403);
 await call(other,quick,'leads_quick',{id:leadId,accountId,field:'ciudad',value:'Unauthorized city'},403);
 await call(other,save,'leads_save',{id:leadId,nombre:'Unauthorized legacy edit'},403);
 await call(other,legacy,'leads',{id:leadId,nombre:'Unauthorized compatibility edit'},403);
 await call(other,note,'lead_notes',{leadId,note:'Unauthorized note'},403);
 await call(other,remove,'leads_delete',{id:leadId},403);
 for(const entity of ['business','opportunity']){
  const ids=entity==='business'?[ownOther,accountId]:[colleagueLead,leadId];
  await call(other,bulk,'leads_bulk',{entity,ids,changes:{ciudad:'Unauthorized mixed batch'}},403);
  await call(other,bulkRemove,'leads_bulk_delete',{entity,ids},403);
 }
 const unchanged=await db.selectFrom('crmAccounts').selectAll().where('id','=',ownOther).executeTakeFirstOrThrow();assert.equal(unchanged.ciudad,null);
 assert.equal((await db.selectFrom('leads').select('deletedAt').where('id','=',colleagueLead).executeTakeFirstOrThrow()).deletedAt,null);
 await call(other,communicationPost,'communication',{action:'prepare',id:crypto.randomUUID(),leadId,channel:'email',contactId:null,templateId:null},403);
 await call(owner,note,'lead_notes',{leadId,note:'Shared business history'});
 await call(other,notes,'lead_notes?leadId='+leadId);
 const history=await call(other,journal,'lead_journal?leadId='+leadId);assert(history.filters.leads.every((l:any)=>String(l.id)===String(leadId)));
 await call(other,journal,'lead_journal',undefined,403);
 await call(other,qualityPost,'dataQuality',{action:'import_preview',mode:'business',source:'Unauthorized CSV',rows:[{nombre:'Unauthorized import'}]},403);
 // A management can retain an independent owner without granting business editing rights.
 const separateBusiness=(await call(owner,commercialPost,'commercial',{action:'account_save',nombre:'Independent responsibility '+suffix})).id;
 const separateManagement=(await call(admin,commercialPost,'commercial',{action:'opportunity_save',accountId:separateBusiness,confirmReviewed:true,opportunityName:'Independent owner',assignedUserEmail:other.user.email})).id;
 await call(owner,commercialPost,'commercial',{action:'opportunity_save',accountId:separateBusiness,id:separateManagement,opportunityName:'Unauthorized by business owner'},403);
 await call(other,commercialPost,'commercial',{action:'opportunity_save',accountId:separateBusiness,id:separateManagement,opportunityName:'Authorized management owner'});
 await call(other,save,'leads_save',{id:separateManagement,scope:'opportunity',nombre:'Must preserve the business',opportunityName:'Authorized scoped edit'});
 // Explicit management selection can edit its owner's fields without business ownership.
 const secondManagement=(await call(admin,commercialPost,'commercial',{action:'opportunity_save',accountId:separateBusiness,confirmReviewed:true,opportunityName:'Another management',assignedUserEmail:owner.user.email})).id;
 const pending=(await call(owner,workPost,'work',{action:'task_save',accountId:separateBusiness,title:'Preserve this commitment',typeId:'call',dueDate:'2027-01-15'})).id;
 const taskBefore=await db.selectFrom('crmTasks').selectAll().where('id','=',pending).executeTakeFirstOrThrow();
 const independentRows=await call(other,list,'leads?entity=business&q='+encodeURIComponent('Independent responsibility '+suffix));assert.equal(independentRows.rows[0].canModify,false);assert.equal(independentRows.rows[0].canModifyManagement,true);
 const untouchedBefore=await db.selectFrom('leads').selectAll().where('id','=',secondManagement).executeTakeFirstOrThrow();
 for(const [field,value] of [['commercialProfile','Referente'],['medioContactoPreferido','WhatsApp'],['origen','Google Maps'],['quienCargo','Historical loader'],['creadoPor','Historical author']]){
  const before=await db.selectFrom('leads').selectAll().where('id','=',separateManagement).executeTakeFirstOrThrow();
  const edit={id:separateManagement,accountId:separateBusiness,scope:'management',field,value,expectedValue:before[field as keyof typeof before]};
  await call(owner,quick,'leads_quick',edit,403);
  await call(other,quick,'leads_quick',edit);
  const auditBefore=await db.selectFrom('leadJournal').select('id').where('leadId','=',separateManagement).execute();
  await call(other,quick,'leads_quick',edit);
  assert.deepEqual(await db.selectFrom('leadJournal').select('id').where('leadId','=',separateManagement).execute(),auditBefore);
  await call(other,quick,'leads_quick',{...edit,value:'Changed by stale form'},409);
  const after=await db.selectFrom('leads').selectAll().where('id','=',separateManagement).executeTakeFirstOrThrow();
  assert.equal(after[field as keyof typeof after],value);assert.equal(after.estado,before.estado);assert.equal(after.assignedUserEmail,before.assignedUserEmail);
 }
 await call(other,quick,'leads_quick',{id:separateManagement,accountId,scope:'management',field:'origen',value:'Other business'},400);
 await call(other,quick,'leads_quick',{id:separateManagement,accountId:separateBusiness,scope:'management',field:'tipo',value:verticalA},400);
 assert.deepEqual(await db.selectFrom('leads').selectAll().where('id','=',secondManagement).executeTakeFirstOrThrow(),untouchedBefore);
 assert.deepEqual(await db.selectFrom('crmTasks').selectAll().where('id','=',pending).executeTakeFirstOrThrow(),taskBefore);
 await call(other,save,'leads_save',{id:separateManagement,nombre:'Unauthorized business projection'},403);
 await call(other,quick,'leads_quick',{id:separateManagement,field:'ciudad',value:'Unauthorized business city'},403);
 await call(other,bulk,'leads_bulk',{entity:'opportunity',ids:[separateManagement],changes:{ciudad:'Unauthorized bulk projection'}},403);
 assert.equal((await db.selectFrom('crmAccounts').select('nombre').where('id','=',separateBusiness).executeTakeFirstOrThrow()).nombre,'Independent responsibility '+suffix);

 // Decision 8A write-path matrix: a seller with an OPEN management corrects only phone, email, WhatsApp and persons.
 {
  const opener=await actor('user','opener'),closer=await actor('user','closer'),stranger=await actor('user','stranger');
  const biz=(await call(owner,commercialPost,'commercial',{action:'account_save',nombre:'Contact data business '+suffix,ciudad:'Paraná',telefono:'+54 9 3447 100001',email:'old8a@example.com',whatsapp:'+54 9 3447 100002'})).id;
  const primary=(await call(owner,commercialPost,'commercial',{action:'contact_save',accountId:biz,name:'Primary 8A',isPrimary:true,phone:'+54 9 3447 100003'})).id;
  const secondary=(await call(owner,commercialPost,'commercial',{action:'contact_save',accountId:biz,name:'Secondary 8A',isPrimary:false})).id;
  const openLead8a=(await call(admin,commercialPost,'commercial',{action:'opportunity_save',accountId:biz,confirmReviewed:true,managementType:'main',opportunityName:'Open 8A',assignedUserEmail:opener.user.email})).id;
  const closedLead8a=(await call(admin,commercialPost,'commercial',{action:'opportunity_save',accountId:biz,confirmReviewed:true,managementType:'main',opportunityName:'Closed 8A',assignedUserEmail:closer.user.email})).id;
  const closing=await call(closer,pipelineGet,'pipeline?leadId='+closedLead8a);
  const lostReason=closing.managementReasons.find((r:any)=>r.managementType==='main'&&r.outcomeKey==='lost'&&r.reasonKey!=='do_not_contact');assert(lostReason);
  await call(closer,pipelinePost,'pipeline',{action:'transition',leadId:closedLead8a,revision:closing.insights[0].pipelineRevision,stage:'main:lost',reasonId:lostReason.id,comment:''});
  const account8a=()=>db.selectFrom('crmAccounts').selectAll().where('id','=',biz).executeTakeFirstOrThrow();
  const contacts8a=async()=>(await db.selectFrom('crmContacts').selectAll().where('accountId','=',biz).orderBy('id').execute());
  const audits8a=async()=>(await db.selectFrom('crmCommercialJournal').selectAll().where('accountId','=',biz).where('action','=','account_contact_data_updated').execute());
  const contactBody={action:'account_save',id:biz,nombre:'Contact data business '+suffix,telefono:'+54 9 3447 200001',email:'new8a@example.com',whatsapp:'+54 9 3447 200002'};
  // Who may edit: detail flag and write result per actor.
  for(const [who,expected] of [[owner,true],[admin,true],[opener,true],[closer,false],[stranger,false]] as const)assert.equal((await call(who,commercialGet,'commercial?accountId='+biz)).canEditContactData,expected);
  const snapshotBefore=JSON.stringify([await account8a(),await contacts8a()]);
  for(const who of [closer,stranger]){
   await call(who,commercialPost,'commercial',contactBody,403);
   await call(who,commercialPost,'commercial',{action:'contact_save',accountId:biz,id:secondary,name:'Hijack',isPrimary:false},403);
   await call(who,commercialPost,'commercial',{action:'contact_save',accountId:biz,name:'Hijack new',isPrimary:false},403);
   await call(who,commercialPost,'commercial',{action:'contact_delete',accountId:biz,id:secondary},403);
  }
  assert.equal(JSON.stringify([await account8a(),await contacts8a()]),snapshotBefore,'closed-management and unrelated sellers changed nothing');
  // Whitelist: any non-contact field, even next to a contact field, rejects the whole save.
  for(const extra of [{nombre:'Renamed'},{ciudad:'Colón'},{sitioWeb:'https://x.example'},{tipo:verticalA},{provincia:'Entre Ríos'},{businessNotes:'notes'},{assignedUserEmail:opener.user.email},{primaryContact:{name:'X'}}]){
   const r=await call(opener,commercialPost,'commercial',{...contactBody,...extra},403);
   assert(typeof r.error==='string'&&r.error.length>0);
  }
  assert.match((await call(opener,commercialPost,'commercial',{...contactBody,ciudad:'Colón'},403)).error,/Podés corregir teléfono, email y WhatsApp/);
  assert.equal(JSON.stringify([await account8a(),await contacts8a()]),snapshotBefore,'a rejected mixed save changed nothing');
  assert.equal((await audits8a()).length,0);
  // Allowed: phone, email, WhatsApp, with the unchanged name echoed back; omitted fields stay untouched.
  await call(opener,commercialPost,'commercial',contactBody);
  const edited=await account8a();
  assert.equal(edited.telefono,'+54 9 3447 200001');assert.equal(edited.email,'new8a@example.com');assert.equal((edited as any).whatsapp,'+54 9 3447 200002');
  assert.equal(edited.nombre,'Contact data business '+suffix);assert.equal(edited.ciudad,'Paraná');assert.equal(edited.assignedUserEmail,owner.user.email);
  const rows8a=await audits8a();assert.equal(rows8a.length,1);assert.equal(rows8a[0].actorEmail,opener.user.email);
  const meta8a=rows8a[0].metadata as any;assert.equal(meta8a.scope,'open_management');assert.deepEqual(meta8a.leadIds.map(String),[String(openLead8a)]);assert.equal(meta8a.before.telefono,'+54 9 3447 100001');assert.equal(meta8a.after.telefono,'+54 9 3447 200001');
  await call(opener,commercialPost,'commercial',{action:'account_save',id:biz,nombre:'Contact data business '+suffix,whatsapp:null});
  assert.equal((await account8a() as any).whatsapp,null);assert.equal((await account8a()).telefono,'+54 9 3447 200001');
  // Owner keeps the regular audit action and full edit.
  const contactAudits=(await audits8a()).length;
  await call(owner,commercialPost,'commercial',{action:'account_save',id:biz,nombre:'Contact data business '+suffix,ciudad:'Paraná',telefono:'+54 9 3447 200001',email:'new8a@example.com'});
  assert.equal((await audits8a()).length,contactAudits,'the owner save is audited as account_updated, not as contact data');
  // Persons: create and edit allowed, primary flag fixed, delete forbidden.
  const created=(await call(opener,commercialPost,'commercial',{action:'contact_save',accountId:biz,name:'Added by opener',isPrimary:false,phone:'+54 9 3447 300001'})).id;
  await call(opener,commercialPost,'commercial',{action:'contact_save',accountId:biz,id:secondary,name:'Secondary renamed',isPrimary:false,email:'second8a@example.com'});
  await call(opener,commercialPost,'commercial',{action:'contact_save',accountId:biz,id:primary,name:'Primary renamed',isPrimary:true,phone:'+54 9 3447 100003'});
  const afterPersons=await contacts8a();
  assert.equal(afterPersons.find(c=>String(c.id)===String(created))?.name,'Added by opener');assert.equal(afterPersons.find(c=>String(c.id)===String(secondary))?.email,'second8a@example.com');
  assert.equal(afterPersons.find(c=>String(c.id)===String(primary))?.isPrimary,true);assert.equal(afterPersons.find(c=>String(c.id)===String(secondary))?.isPrimary,false);
  const personAudit=await db.selectFrom('crmCommercialJournal').selectAll().where('accountId','=',biz).where('action','=','contact_created').where('contactId','=',created).executeTakeFirstOrThrow();assert.equal((personAudit.metadata as any).scope,'open_management');
  const personsBefore=JSON.stringify(await contacts8a());
  await call(opener,commercialPost,'commercial',{action:'contact_save',accountId:biz,id:secondary,name:'Secondary renamed',isPrimary:true},403);
  await call(opener,commercialPost,'commercial',{action:'contact_save',accountId:biz,id:primary,name:'Primary renamed',isPrimary:false},403);
  await call(opener,commercialPost,'commercial',{action:'contact_save',accountId:biz,name:'New primary',isPrimary:true},403);
  await call(opener,commercialPost,'commercial',{action:'contact_delete',accountId:biz,id:secondary},403);
  assert.equal(JSON.stringify(await contacts8a()),personsBefore,'primary toggles and person deletes stay owner/admin only');
  // Everything else about the business and its managements stays owner/admin only, and reading never grants modifying.
  const beforeRest=JSON.stringify([await account8a(),await db.selectFrom('leads').selectAll().where('accountId','=',biz).orderBy('id').execute()]);
  for(const body of [
   {action:'opportunity_save',accountId:biz,managementType:'main',opportunityName:'New by opener'},
   {action:'opportunity_save',accountId:biz,id:closedLead8a,opportunityName:'Edit foreign management'},
   {action:'convert_client',accountId:biz,reason:'Unauthorized conversion'},
   {action:'set_client',accountId:biz,isClient:true,reason:'Unauthorized client mark'},
   {action:'business_status',accountId:biz,status:'reviewed',recontactAt:null},
   {action:'account_archive',accountId:biz,archived:true,reason:'Unauthorized archive'},
   {action:'account_trash',accountIds:[biz],deleted:true,reason:'Unauthorized trash'},
  ])await call(opener,commercialPost,'commercial',body,403);
  await call(opener,quick,'leads_quick',{id:biz,accountId:biz,field:'ciudad',value:'Colón',expectedValue:'Paraná'},403);
  await call(opener,quick,'leads_quick',{id:openLead8a,accountId:biz,field:'telefono',value:'+54 9 3447 999999'},400);
  await call(opener,bulk,'leads_bulk',{entity:'business',ids:[biz],changes:{ciudad:'Unauthorized batch'}},403);
  assert.equal(JSON.stringify([await account8a(),await db.selectFrom('leads').selectAll().where('accountId','=',biz).orderBy('id').execute()]),beforeRest);
  // No contactar: a phone shared with a No contactar business still blocks the seller with an open management.
  const dncPhone='+54 9 3447 '+String(suffix).slice(-6);
  const dnc8a=(await call(owner,commercialPost,'commercial',{action:'account_save',nombre:'DNC reference 8A '+suffix,telefono:dncPhone})).id;
  await call(admin,pipelinePost,'pipeline',{action:'contact_policy',accountId:dnc8a,blocked:true,reason:'Reference for 8A'});
  await call(opener,commercialPost,'commercial',{...contactBody,telefono:dncPhone},409);
  assert.equal((await account8a()).telefono,'+54 9 3447 200001');
  // Archived businesses reject the seller with an open management for reads of the write path and for every contact write.
  await call(admin,commercialPost,'commercial',{action:'account_archive',accountId:biz,archived:true,reason:'8A archived matrix'});
  const archivedSnapshot=JSON.stringify([await account8a(),await contacts8a()]);
  await call(opener,commercialPost,'commercial',contactBody,403);
  await call(opener,commercialPost,'commercial',{action:'contact_save',accountId:biz,id:secondary,name:'Archived edit',isPrimary:false},403);
  await call(opener,commercialPost,'commercial',{action:'contact_save',accountId:biz,name:'Archived add',isPrimary:false},403);
  await call(opener,commercialGet,'commercial?accountId='+biz,undefined,403);
  assert.equal(JSON.stringify([await account8a(),await contacts8a()]),archivedSnapshot,'archived business stays closed to the seller with an open management');
  await call(admin,commercialPost,'commercial',{...contactBody,telefono:'+54 9 3447 500001'});
  assert.equal((await account8a()).telefono,'+54 9 3447 500001');
  await call(admin,commercialPost,'commercial',{action:'account_archive',accountId:biz,archived:false,reason:'Restore 8A'});
  // Closed-off variants: the open-management scope never applies to No contactar, trashed or merged businesses, to deleted managements or to managements of someone else.
  const variant=async(label:string,prepare:(biz:string,lead:string)=>Promise<void>,assignTo=opener)=>{
   const b=(await call(owner,commercialPost,'commercial',{action:'account_save',nombre:`8A ${label} ${suffix}`,telefono:'+54 9 3447 '+String(suffix+label.length).slice(-6),email:`${label.replace(/\W/g,'')}8a@example.com`})).id;
   const c=(await call(owner,commercialPost,'commercial',{action:'contact_save',accountId:b,name:'Person '+label,isPrimary:false})).id;
   const l=(await call(admin,commercialPost,'commercial',{action:'opportunity_save',accountId:b,confirmReviewed:true,managementType:'main',opportunityName:'Mgmt '+label,assignedUserEmail:assignTo.user.email})).id;
   await prepare(b,l);
   const state=async()=>JSON.stringify([await db.selectFrom('crmAccounts').selectAll().where('id','=',b).executeTakeFirstOrThrow(),await db.selectFrom('crmContacts').selectAll().where('accountId','=',b).orderBy('id').execute()]);
   const before=await state();const acc=await db.selectFrom('crmAccounts').selectAll().where('id','=',b).executeTakeFirstOrThrow();
   await call(opener,commercialPost,'commercial',{action:'account_save',id:b,nombre:acc.nombre,telefono:null,whatsapp:null},403);
   await call(opener,commercialPost,'commercial',{action:'contact_save',accountId:b,id:c,name:'Edited '+label,isPrimary:false},403);
   await call(opener,commercialPost,'commercial',{action:'contact_save',accountId:b,name:'Added '+label,isPrimary:false},403);
   assert.equal(await state(),before,label+': nothing changed');
   return {b,l};
  };
  const dncVariant=await variant('dnc',async b=>{await sql`UPDATE crm_accounts SET do_not_contact=true WHERE id=${b}`.execute(db);});
  assert.equal((await call(opener,commercialGet,'commercial?accountId='+dncVariant.b)).canEditContactData,false,'the detail hides the correction for a No contactar business');
  assert.equal((await call(admin,commercialGet,'commercial?accountId='+dncVariant.b)).canEditContactData,true);
  await variant('trashed',async b=>{await call(owner,commercialPost,'commercial',{action:'account_trash',accountIds:[b],deleted:true,reason:'8A trashed variant'});});
  await variant('merged',async b=>{await sql`UPDATE crm_accounts SET merged_into_id=${biz} WHERE id=${b}`.execute(db);});
  await variant('deletedlead',async(_b,l)=>{await sql`UPDATE leads SET deleted_at=now() WHERE id=${l}`.execute(db);});
  await variant('foreignlead',async()=>{},closer);
  console.log('Decision 8A matrix: open-management seller edits only phone/email/WhatsApp/persons; closed, unrelated, archived and No contactar paths stay closed');
 }
 // Materials are administered exclusively by admin and used in an authorized context.
 const documentId=crypto.randomUUID();
 const createDocument={action:'create',id:documentId,title:'Approved test material',type:'propuesta',library:true,accountId:null,leadId:null,activityId:null,categoryId:null,version:{url:'https://example.com/material.pdf'}};
 // Spec 89 retired the library: nobody creates library documents or links them any more; existing rows and links stay readable.
 for(const actor of [owner,admin])assert.equal((await call(actor,resourcesPost,'resources',createDocument,400)).error,'La biblioteca fue reemplazada por Material de venta.');
 await sql`INSERT INTO crm_documents(id,title,type,owner_email,library,status) VALUES(${documentId}::uuid,'Approved test material','propuesta',${admin.user.email},true,'approved')`.execute(db);
 await sql`INSERT INTO crm_document_versions(id,document_id,version,url,actor_email,approved_at) VALUES(${crypto.randomUUID()}::uuid,${documentId}::uuid,1,'https://example.com/material.pdf',${admin.user.email},now())`.execute(db);
 await call(owner,resourcesPost,'resources',{action:'version',id:documentId,revision:1,version:{url:'https://example.com/replacement.pdf'}},403);
 for(const actor of [owner,other])await call(actor,resourcesPost,'resources',{action:'link',id:documentId,accountId,leadId,activityId:null},400);
 const legacyLink=(account:string,lead:string|null)=>sql`INSERT INTO crm_document_links(document_id,account_id,original_account_id,lead_id,actor_email) VALUES(${documentId}::uuid,${account}::bigint,${account}::bigint,${lead}::bigint,${owner.user.email})`.execute(db);
 await legacyLink(accountId,leadId);
 assert(!(await call(owner,resourcesGet,'resources')).documents.some((d:any)=>d.id===documentId),'the retired library is no longer listed');
 assert((await call(other,resourcesGet,'resources?accountId='+accountId)).documents.some((d:any)=>d.id===documentId));
 // Legitimate owner/admin edits remain possible.
 await call(owner,commercialPost,'commercial',{action:'account_save',id:accountId,nombre:'Permission business '+suffix,email:'business@example.com'});
 await call(admin,quick,'leads_quick',{id:leadId,field:'prioridad',value:'alta'});
 await call(owner,bulk,'leads_bulk',{entity:'opportunity',ids:[leadId],changes:{prioridad:'media'}});
 await call(owner,remove,'leads_delete',{id:leadId});
 const detail=await call(other,commercialGet,'commercial?accountId='+accountId);assert.equal(detail.opportunities.length,0);assert.equal(detail.leadJournal.length,0);
 for(const [handler,url] of [[commercialGet,'commercial?leadId='+leadId],[notes,'lead_notes?leadId='+leadId],[journal,'lead_journal?leadId='+leadId],[pipelineGet,'pipeline?leadId='+leadId]] as const)await call(other,handler,url,undefined,403);
 await call(admin,notes,'lead_notes?leadId='+leadId);
 // A management of the business that gets archived below: its detail and communication must stay readable for the responsible seller only.
 const archivedLead=(await call(owner,commercialPost,'commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:'Archived management '+suffix,estado:'Cargado'})).id;
 const archivedResponse=crypto.randomUUID();
 await call(owner,communicationPost,'communication',{action:'response_create',id:archivedResponse,accountId,leadId:archivedLead,contactId:null,channel:'call',recipient:'',recipientName:'',destination:null,linkedMessageId:null,category:'interested',summary:'Answered before the archive',exactText:null,otherDetail:null});
 // Archived businesses are read-only for their responsible seller (decision 1C) and closed to every other seller.
 await call(owner,commercialPost,'commercial',{action:'account_archive',accountId,archived:true,reason:'Permission archive test'});
 // The /sales/:id detail (a single-management lookup) and the communication by management are READ paths: the responsible seller reads them
 // read-only, a colleague gets nothing, the admin keeps full access, and lists keep hiding the archived business from sellers.
 const detailUrl='leads?entity=opportunity&page=1&pageSize=10&filterGroups='+encodeURIComponent(JSON.stringify([{rules:[{field:'id',operator:'eq',value:String(archivedLead)}]}]));
 const ownerDetail=(await call(owner,list,detailUrl)).rows;
 assert.equal(ownerDetail.length,1,'the responsible seller opens the management of her archived business');assert.equal(ownerDetail[0].canModify,false,'read-only for her');assert.equal(ownerDetail[0].accountArchived,true);
 assert.equal((await call(other,list,detailUrl)).rows.length,0,'a colleague does not get the management of an archived business');
 const adminDetail=(await call(admin,list,detailUrl)).rows;assert.equal(adminDetail.length,1);assert.equal(adminDetail[0].canModify,true,'the admin keeps modifying it');
 assert.equal((await call(owner,list,'leads?entity=opportunity&page=1&pageSize=100&q='+encodeURIComponent('Archived management '+suffix))).rows.length,0,'the management list still hides archived businesses from sellers');
 const archivedCommunication=await call(owner,communicationGet,'communication?leadId='+archivedLead);
 assert(archivedCommunication.responses.some((r:any)=>r.id===archivedResponse),'the responsible seller reads the communication of her archived management');
 await call(other,communicationGet,'communication?leadId='+archivedLead,undefined,403);
 assert((await call(admin,communicationGet,'communication?leadId='+archivedLead)).responses.some((r:any)=>r.id===archivedResponse));
 for(const [handler,url] of [[commercialGet,'commercial?leadId='+archivedLead],[notes,'lead_notes?leadId='+archivedLead],[journal,'lead_journal?leadId='+archivedLead],[pipelineGet,'pipeline?leadId='+archivedLead]] as const){await call(owner,handler,url);await call(other,handler,url,undefined,403);}
 // Reading never opens a write: every mutation of that management and its communication stays rejected for both sellers.
 const archivedRevision=(await call(admin,pipelineGet,'pipeline?leadId='+archivedLead)).insights[0].pipelineRevision as number;
 const archivedWrites:[(r:Request)=>Promise<Response>,string,unknown][]=[
  [commercialPost,'commercial',{action:'opportunity_save',accountId,id:archivedLead,opportunityName:'Unauthorized management'}],
  [quick,'leads_quick',{id:archivedLead,accountId,scope:'management',field:'origen',value:'Unauthorized origin',expectedValue:null}],
  [save,'leads_save',{id:archivedLead,nombre:'Unauthorized legacy edit'}],
  [legacy,'leads',{id:archivedLead,nombre:'Unauthorized compatibility edit'}],
  [note,'lead_notes',{leadId:archivedLead,note:'Unauthorized note'}],
  [remove,'leads_delete',{id:archivedLead}],
  [bulk,'leads_bulk',{entity:'opportunity',ids:[archivedLead],changes:{prioridad:'alta'}}],
  [bulkRemove,'leads_bulk_delete',{entity:'opportunity',ids:[archivedLead]}],
  [leadContact,'lead_contact',{leadId:archivedLead,channel:'phone',result:'Respondió'}],
  [workPost,'work',{action:'task_save',accountId,leadId:archivedLead,title:'Unauthorized task',typeId:'call',dueDate:'2027-01-15'}],
  [workPost,'work',{action:'activity_save',accountId,leadId:archivedLead,title:'Unauthorized call',typeId:'call',occurredAt:new Date().toISOString(),outcome:'interested',continuation:'done'}],
  [communicationPost,'communication',{action:'prepare',id:crypto.randomUUID(),leadId:archivedLead,channel:'email',contactId,templateId:null}],
  [communicationPost,'communication',{action:'prepare_general',id:crypto.randomUUID(),accountId,leadId:archivedLead,contactId,channel:'whatsapp',purpose:'resume',otherPurpose:null,templateId:null}],
  [communicationPost,'communication',{action:'manual_start',id:crypto.randomUUID(),accountId,leadId:archivedLead,contactId:null,channel:'call',purpose:'resume',otherPurpose:null,recipient:dncPhone,recipientName:'',destination:null,body:'',result:'manual_sent',templateId:null}],
  [communicationPost,'communication',{action:'response_create',id:crypto.randomUUID(),accountId,leadId:archivedLead,contactId:null,channel:'call',recipient:'',recipientName:'',destination:null,linkedMessageId:null,category:'interested',summary:'Unauthorized response',exactText:null,otherDetail:null}],
  [communicationPost,'communication',{action:'response_correct',id:archivedResponse,category:'other',summary:'Unauthorized correction',exactText:null,otherDetail:'Changed',reason:'Unauthorized correction'}],
  [pipelinePost,'pipeline',{action:'transition',leadId:archivedLead,revision:archivedRevision,stage:'main:contacted'}],
  [pipelinePost,'pipeline',{action:'unrefer',leadId:archivedLead,revision:archivedRevision}],
 ];
 const archivedSnapshotOf=async()=>({leads:await db.selectFrom('leads').selectAll().where('accountId','=',accountId).orderBy('id').execute(),notes:await db.selectFrom('leadNotes').select('id').where('leadId','=',archivedLead).execute(),tasks:await db.selectFrom('crmTasks').select('id').where('accountId','=',accountId).execute(),activities:await db.selectFrom('crmActivities').select('id').where('accountId','=',accountId).execute(),messages:(await sql`SELECT id FROM crm_messages WHERE account_id=${accountId}`.execute(db)).rows,responses:(await sql`SELECT id,category,summary FROM crm_communication_responses WHERE account_id=${accountId}`.execute(db)).rows,links:(await sql`SELECT id FROM crm_document_links WHERE account_id=${accountId}`.execute(db)).rows});
 const beforeArchivedWrites=await archivedSnapshotOf();
 for(const seller of [owner,other])for(const [handler,url,body] of archivedWrites)await call(seller,handler,url,body,403);
 assert.deepEqual(await archivedSnapshotOf(),beforeArchivedWrites,'no rejected write changed the management of the archived business');
 await call(admin,note,'lead_notes',{leadId:archivedLead,note:'Admin note on an archived management'});
 const archivedReads=[[commercialGet,'commercial?accountId='+accountId],[commercialGet,'commercial?accountId='+accountId+'&historyPage=1'],[qualityGet,'dataQuality?accountId='+accountId],[communicationGet,'communication?accountId='+accountId],[resourcesGet,'resources?accountId='+accountId],[workGet,'work?mode=detail&accountId='+accountId]] as const;
 for(const [handler,url] of archivedReads){await call(owner,handler,url);await call(other,handler,url,undefined,403);}
 for(const seller of [owner,other]){
  await call(seller,commercialGet,'commercial?archived=true',undefined,403);
  await call(seller,workPost,'work',{action:'task_save',accountId,title:'Unauthorized task',typeId:'call',dueDate:'2027-01-15'},403);
  await call(seller,commercialPost,'commercial',{action:'account_archive',accountId,archived:false,reason:'Unauthorized restore'},403);
 }
 assert.equal((await call(owner,qualityGet,'dataQuality?accountId='+accountId)).canEdit,false);
 // A management closed as "Pidió no ser contactado" archives the business: its owner still reads it, but no write or contact path opens.
 const dncBusiness=(await call(owner,commercialPost,'commercial',{action:'account_save',nombre:'Do not contact business '+suffix,telefono:dncPhone,email:`dnc-${suffix}@example.com`})).id;
 const dncContact=(await call(owner,commercialPost,'commercial',{action:'contact_save',accountId:dncBusiness,name:'Blocked person',isPrimary:true,email:'blocked@example.com'})).id;
 const dncLead=(await call(owner,commercialPost,'commercial',{action:'opportunity_save',accountId:dncBusiness,confirmReviewed:true,managementType:'main',opportunityName:'Closed by request'})).id;
 const openLead=(await call(owner,commercialPost,'commercial',{action:'opportunity_save',accountId:dncBusiness,managementType:'main',opportunityName:'Still open'})).id;
 const dncTask=(await call(owner,workPost,'work',{action:'task_save',accountId:dncBusiness,leadId:openLead,title:'Commitment before the block',typeId:'call',dueDate:'2027-01-15'})).id;
 const dncResponse=crypto.randomUUID();
 await call(owner,communicationPost,'communication',{action:'response_create',id:dncResponse,accountId:dncBusiness,leadId:null,contactId:null,channel:'call',recipient:'',recipientName:'',destination:null,linkedMessageId:null,category:'interested',summary:'Answered before the block',exactText:null,otherDetail:null});
 const dncDocument=crypto.randomUUID();
 await call(admin,resourcesPost,'resources',{action:'create',id:dncDocument,title:'Business own material',type:'propuesta',library:false,accountId:dncBusiness,leadId:null,activityId:null,categoryId:null,version:{url:'https://example.com/own.pdf'}});
 await legacyLink(dncBusiness,null);
 const revision=async(lead:string,a:Actor=owner)=>(await call(a,pipelineGet,'pipeline?leadId='+lead)).insights[0].pipelineRevision as number;
 const dncReason=(await call(owner,pipelineGet,'pipeline?leadId='+dncLead)).managementReasons.find((r:any)=>r.managementType==='main'&&r.outcomeKey==='lost'&&r.reasonKey==='do_not_contact');assert(dncReason);
 await call(owner,pipelinePost,'pipeline',{action:'transition',leadId:dncLead,revision:await revision(dncLead),stage:'main:lost',reasonId:dncReason.id,comment:''});
 const blocked=await db.selectFrom('crmAccounts').selectAll().where('id','=',dncBusiness).executeTakeFirstOrThrow();assert.equal(blocked.doNotContact,true);assert(blocked.archivedAt);
 const dncReads=[[commercialGet,'commercial?accountId='+dncBusiness],[commercialGet,'commercial?accountId='+dncBusiness+'&historyPage=1'],[commercialGet,'commercial?leadId='+openLead],[qualityGet,'dataQuality?accountId='+dncBusiness],[communicationGet,'communication?accountId='+dncBusiness],[resourcesGet,'resources?accountId='+dncBusiness],[workGet,'work?mode=detail&accountId='+dncBusiness],[notes,'lead_notes?leadId='+openLead],[journal,'lead_journal?leadId='+openLead],[pipelineGet,'pipeline?leadId='+openLead]] as const;
 for(const [handler,url] of dncReads){await call(owner,handler,url);await call(other,handler,url,undefined,403);}
 const dncDetail=await call(owner,commercialGet,'commercial?accountId='+dncBusiness);
 assert.equal(dncDetail.account.doNotContact,true);assert.equal(doNotContactSince(dncDetail.journal)?.requested,true,'the banner says the business asked only because a DNC close recorded it');
 assert((await call(owner,workGet,'work?mode=detail&accountId='+dncBusiness)).tasks.some((t:any)=>String(t.id)===String(dncTask)),'the owner still sees the commitments of her archived business');
 const dncDocuments=(await call(owner,resourcesGet,'resources?accountId='+dncBusiness)).documents.map((d:any)=>d.id);assert(dncDocuments.includes(dncDocument)&&dncDocuments.includes(documentId),'the owner still sees the documents of her archived business');
 // Downloading is a READ path: the responsible seller still gets the files of her archived business, nobody else does, and every write stays closed.
 const fileDocument=crypto.randomUUID();
 await call(admin,resourcesPost,'resources',{action:'create',id:fileDocument,title:'Business own file',type:'propuesta',library:false,accountId:dncBusiness,leadId:null,activityId:null,categoryId:null,version:{fileName:'own.txt',mimeType:'text/plain',fileData:Buffer.from('own file').toString('base64')}});
 const fileVersion=(await call(owner,resourcesGet,'resources?accountId='+dncBusiness)).documents.find((d:any)=>d.id===fileDocument).versions[0].id as string;
 const downloadAs=(a:Actor|null)=>resourcesDownload(new Request('http://localhost/_api/resources/download?versionId='+fileVersion,a?{headers:{cookie:a.cookie}}:{}));
 const ownerDownload=await downloadAs(owner);assert.equal(ownerDownload.status,200,'the owner downloads the files of her archived business');assert.equal(await ownerDownload.text(),'own file');
 assert.equal((await downloadAs(admin)).status,200);assert.equal((await downloadAs(other)).status,403,'a colleague still cannot download from an archived business');assert.equal((await downloadAs(null)).status,401);
 for(const body of [{action:'version',id:fileDocument,revision:1,version:{url:'https://example.com/replacement.pdf'}},{action:'delete',id:fileDocument,revision:1},{action:'status',id:fileDocument,revision:1,status:'approved'}])await call(owner,resourcesPost,'resources',body,403);
 assert.equal((await downloadAs(owner)).status,200,'rejected writes leave the file downloadable');
 const pipelineRevisions=new Map([[dncLead,await revision(dncLead)],[openLead,await revision(openLead)]]);
 const dncWrites:[(r:Request)=>Promise<Response>,string,unknown][]=[
  ...[
   {action:'account_save',id:dncBusiness,nombre:'Unauthorized edit'},
   {action:'contact_save',accountId:dncBusiness,id:dncContact,name:'Unauthorized person',isPrimary:true},
   {action:'contact_save',accountId:dncBusiness,name:'Unauthorized new person',isPrimary:false},
   {action:'contact_delete',accountId:dncBusiness,id:dncContact},
   {action:'opportunity_save',accountId:dncBusiness,id:openLead,opportunityName:'Unauthorized management'},
   {action:'opportunity_save',accountId:dncBusiness,managementType:'main',opportunityName:'Unauthorized new management'},
   {action:'convert_client',accountId:dncBusiness,reason:'Unauthorized conversion'},
   {action:'set_client',accountId:dncBusiness,isClient:true,reason:'Unauthorized client mark'},
   {action:'business_status',accountId:dncBusiness,status:'reviewed',recontactAt:null},
   {action:'account_archive',accountId:dncBusiness,archived:false,reason:'Unauthorized restore'},
   {action:'account_trash',accountIds:[dncBusiness],deleted:true,reason:'Unauthorized trash'},
  ].map(body=>[commercialPost,'commercial',body] as [(r:Request)=>Promise<Response>,string,unknown]),
  [quick,'leads_quick',{id:dncBusiness,accountId:dncBusiness,field:'ciudad',value:'Unauthorized city',expectedValue:null}],
  [quick,'leads_quick',{id:openLead,accountId:dncBusiness,scope:'management',field:'origen',value:'Unauthorized origin',expectedValue:null}],
  [save,'leads_save',{id:openLead,nombre:'Unauthorized legacy edit'}],
  [legacy,'leads',{id:openLead,nombre:'Unauthorized compatibility edit'}],
  [note,'lead_notes',{leadId:openLead,note:'Unauthorized note'}],
  [remove,'leads_delete',{id:openLead}],
  [bulk,'leads_bulk',{entity:'business',ids:[dncBusiness],changes:{ciudad:'Unauthorized batch'}}],
  [bulk,'leads_bulk',{entity:'opportunity',ids:[openLead],changes:{prioridad:'alta'}}],
  [bulkRemove,'leads_bulk_delete',{entity:'business',ids:[dncBusiness]}],
  [bulkRemove,'leads_bulk_delete',{entity:'opportunity',ids:[openLead]}],
  [workPost,'work',{action:'task_save',accountId:dncBusiness,leadId:openLead,title:'Unauthorized task',typeId:'call',dueDate:'2027-01-15'}],
  [workPost,'work',{action:'task_save',id:dncTask,accountId:dncBusiness,leadId:openLead,title:'Unauthorized reschedule',typeId:'call',dueDate:'2027-02-15'}],
  [workPost,'work',{action:'task_delete',id:dncTask}],
  [workPost,'work',{action:'activity_save',accountId:dncBusiness,leadId:openLead,title:'Unauthorized call',typeId:'call',occurredAt:new Date().toISOString(),outcome:'interested',continuation:'done'}],
  [communicationPost,'communication',{action:'prepare',id:crypto.randomUUID(),leadId:openLead,channel:'email',contactId:dncContact,templateId:null}],
  [communicationPost,'communication',{action:'prepare_general',id:crypto.randomUUID(),accountId:dncBusiness,leadId:null,contactId:dncContact,channel:'whatsapp',purpose:'resume',otherPurpose:null,templateId:null}],
  [communicationPost,'communication',{action:'manual_start',id:crypto.randomUUID(),accountId:dncBusiness,leadId:openLead,contactId:null,channel:'call',purpose:'resume',otherPurpose:null,recipient:dncPhone,recipientName:'',destination:null,body:'',result:'manual_sent',templateId:null}],
  [communicationPost,'communication',{action:'response_create',id:crypto.randomUUID(),accountId:dncBusiness,leadId:null,contactId:null,channel:'call',recipient:'',recipientName:'',destination:null,linkedMessageId:null,category:'interested',summary:'Unauthorized response',exactText:null,otherDetail:null}],
  [communicationPost,'communication',{action:'response_correct',id:dncResponse,category:'other',summary:'Unauthorized correction',exactText:null,otherDetail:'Changed',reason:'Unauthorized correction'}],
  [qualityPost,'dataQuality',{action:'evidence',accountId:dncBusiness,leadId:openLead,field:'telefono',revision:blocked.updatedAt.toISOString(),source:'Unauthorized check',verifiedAt:null,validity:'valid',observations:''}],
  [qualityPost,'dataQuality',{action:'evidence',accountId:dncBusiness,field:'telefono',revision:blocked.updatedAt.toISOString(),source:'Unauthorized check',verifiedAt:null,validity:'valid',observations:''}],
  [pipelinePost,'pipeline',{action:'transition',leadId:openLead,revision:pipelineRevisions.get(openLead),stage:'main:leandro'}],
  [pipelinePost,'pipeline',{action:'transition',leadId:openLead,revision:pipelineRevisions.get(openLead),stage:'main:lost'}],
  [pipelinePost,'pipeline',{action:'transition',leadId:dncLead,revision:pipelineRevisions.get(dncLead),stage:'main:contacted'}],
  [pipelinePost,'pipeline',{action:'unrefer',leadId:openLead,revision:pipelineRevisions.get(openLead)}],
  [pipelinePost,'pipeline',{action:'contact_policy',accountId:dncBusiness,blocked:false,reason:'Unauthorized lift'}],
 ];
 const snapshot=async()=>({account:await db.selectFrom('crmAccounts').selectAll().where('id','=',dncBusiness).executeTakeFirstOrThrow(),leads:await db.selectFrom('leads').selectAll().where('accountId','=',dncBusiness).orderBy('id').execute(),contacts:await db.selectFrom('crmContacts').selectAll().where('accountId','=',dncBusiness).orderBy('id').execute(),tasks:await db.selectFrom('crmTasks').selectAll().where('accountId','=',dncBusiness).orderBy('id').execute(),activities:await db.selectFrom('crmActivities').select('id').where('accountId','=',dncBusiness).execute(),messages:(await sql`SELECT id FROM crm_messages WHERE account_id=${dncBusiness}`.execute(db)).rows,responses:(await sql`SELECT id,category,summary FROM crm_communication_responses WHERE account_id=${dncBusiness}`.execute(db)).rows,links:(await sql`SELECT id FROM crm_document_links WHERE account_id=${dncBusiness}`.execute(db)).rows,evidence:(await sql`SELECT id FROM crm_data_evidence WHERE account_id=${dncBusiness}`.execute(db)).rows});
 const beforeWrites=await snapshot();
 for(const seller of [owner,other])for(const [handler,url,body] of dncWrites)await call(seller,handler,url,body,403);
 assert.deepEqual(await snapshot(),beforeWrites,'no rejected write changed the No contactar business');
 await call(admin,commercialGet,'commercial?accountId='+dncBusiness);
 await call(admin,pipelinePost,'pipeline',{action:'contact_policy',accountId,blocked:true,reason:'Manual admin mark'});
 assert.equal(doNotContactSince((await call(owner,commercialGet,'commercial?accountId='+accountId)).journal)?.requested,false,'a manual mark never claims the business asked');
 await call(admin,pipelinePost,'pipeline',{action:'contact_policy',accountId,blocked:false,reason:'Lift manual mark'});
 await call(admin,commercialGet,'commercial?accountId='+accountId);
 await call(admin,commercialPost,'commercial',{action:'account_archive',accountId,archived:false,reason:'Restore test business'});
 // Decisions D1 (who may record «Pidió no ser contactado») and 1C (a No contactar business is read-only for non-admins; the admin lifts it).
 {
  const mgr=await actor('user','mgr'),reader=await actor('user','reader'),deletedMgr=await actor('user','deletedmgr');
  const mkBiz=async(label:string,assignTo:Actor=mgr)=>{
   const b=(await call(owner,commercialPost,'commercial',{action:'account_save',nombre:`Zz D1 ${label} ${suffix}`})).id;
   const c=(await call(owner,commercialPost,'commercial',{action:'contact_save',accountId:b,name:'Person '+label,isPrimary:true,email:`d1-${label}-${suffix}@example.com`})).id;
   const l=(await call(admin,commercialPost,'commercial',{action:'opportunity_save',accountId:b,confirmReviewed:true,managementType:'main',opportunityName:'Mgmt '+label,assignedUserEmail:assignTo.user.email})).id;
   return {b:b as string,c:c as string,l:l as string};
  };
  const resp=(b:string,category:string,extra:Record<string,unknown>={})=>({action:'response_create',id:crypto.randomUUID(),accountId:b,leadId:null,contactId:null,channel:'call',recipient:'',recipientName:'',destination:null,linkedMessageId:null,category,summary:'D1 '+category,exactText:null,otherDetail:null,...(category==='do_not_contact'?{confirmDoNotContact:true}:{}),...extra});
  const dncOf=async(b:string)=>(await db.selectFrom('crmAccounts').select('doNotContact').where('id','=',b).executeTakeFirstOrThrow()).doNotContact;
  const dncResponses=async(b:string)=>Number((await db.selectFrom('crmCommunicationResponses').select(({fn})=>fn.countAll<string>().as('n')).where('accountId','=',b).where('category','=','do_not_contact').executeTakeFirstOrThrow()).n);
  const roles:[string,Actor,boolean][]=[['owner',owner,true],['management responsible',mgr,true],['unrelated seller',other,false],['colleague reader',reader,false],['admin',admin,true]];
  // D1, response_create: the business responsible, the responsible of one of its managements and admin may record it; everybody else reads only.
  for(const [who,a,ok] of roles){
   const f=await mkBiz('create'+who.replace(/\W/g,''));
   await call(a,communicationPost,'communication',resp(f.b,'interested'));
   const denied=await call(a,communicationPost,'communication',resp(f.b,'do_not_contact'),ok?200:403);
   if(!ok)assert.match(denied.error,/responsable del negocio/,who+': the refusal names who may record it');
   assert.equal(await dncOf(f.b),ok,who+': response_create do_not_contact');assert.equal(await dncResponses(f.b),ok?1:0,who+': stored responses');
  }
  // The responsible of a management that was deleted no longer counts.
  const gone=await mkBiz('deletedmgr',deletedMgr);
  await sql`UPDATE leads SET deleted_at=now() WHERE id=${gone.l}`.execute(db);
  await call(deletedMgr,communicationPost,'communication',resp(gone.b,'do_not_contact'),403);assert.equal(await dncOf(gone.b),false);
  // D1, response_correct changing a category TO do_not_contact needs the same standing.
  for(const [who,a,ok] of roles){
   const f=await mkBiz('correct'+who.replace(/\W/g,''));
   const first=resp(f.b,'interested');await call(a,communicationPost,'communication',first);
   await call(a,communicationPost,'communication',{action:'response_correct',id:first.id,category:'do_not_contact',summary:'Corrected to block',exactText:null,otherDetail:null,reason:'D1 matrix',confirmDoNotContact:true},ok?200:403);
   assert.equal(await dncOf(f.b),ok,who+': response_correct to do_not_contact');
  }
  // 1C: the admin lifts the block; correcting the text of the same category keeps it.
  {
   const f=await mkBiz('lift');const blockResponse=resp(f.b,'do_not_contact');await call(owner,communicationPost,'communication',blockResponse);assert.equal(await dncOf(f.b),true);
   const correction=(category:string)=>({action:'response_correct',id:blockResponse.id,category,summary:'Lift attempt',exactText:null,otherDetail:null,reason:'D1 lift matrix',...(category==='do_not_contact'?{confirmDoNotContact:true}:{confirmLiftDoNotContact:true})});
   await call(owner,communicationPost,'communication',correction('do_not_contact'));assert.equal(await dncOf(f.b),true);
   // 1C: the seller who recorded the block cannot lift it by correcting the response; nothing changes.
   const liftSnapshot=JSON.stringify([await db.selectFrom('crmAccounts').selectAll().where('id','=',f.b).executeTakeFirstOrThrow(),await db.selectFrom('crmCommunicationResponses').selectAll().where('id','=',blockResponse.id).executeTakeFirstOrThrow()]);
   assert.match((await call(owner,communicationPost,'communication',correction('interested'),403)).error,/administrador puede levantar/);
   assert.equal(JSON.stringify([await db.selectFrom('crmAccounts').selectAll().where('id','=',f.b).executeTakeFirstOrThrow(),await db.selectFrom('crmCommunicationResponses').selectAll().where('id','=',blockResponse.id).executeTakeFirstOrThrow()]),liftSnapshot,'a rejected lift changed nothing');
   // Incoming responses keep working for her on a No contactar business, but a reminder task is admin-only.
   await call(owner,communicationPost,'communication',resp(f.b,'interested'));
   await call(owner,communicationPost,'communication',resp(f.b,'later',{reminder:{dueDate:'2027-03-01',assignedUserEmail:null}}),403);
   await call(owner,communicationPost,'communication',resp(f.b,'later'));
   await call(admin,communicationPost,'communication',correction('interested'));assert.equal(await dncOf(f.b),false,'the admin lifts the block');
  }
  // 1C, every write path of a NON-archived No contactar business is closed to the responsible sellers and open to the admin.
  {
   const f=await mkBiz('readonly');
   const preTask=(await call(owner,workPost,'work',{action:'task_save',accountId:f.b,title:'Commitment before the block',typeId:'call',dueDate:'2027-01-15'})).id;
   await call(owner,commercialPost,'commercial',{action:'account_save',id:f.b,nombre:`Zz D1 readonly ${suffix}`,ciudad:'Colón'});
   // Item 5 fixtures: a contact of the management responsible (call) with its own task, plus an unrelated pending task of the same management.
   const linkedTask=(await call(mgr,workPost,'work',{action:'task_save',accountId:f.b,leadId:f.l,title:'Linked to the contact',typeId:'call',dueDate:'2027-01-15'})).id;
   const otherTask=(await call(mgr,workPost,'work',{action:'task_save',accountId:f.b,leadId:f.l,title:'Unrelated pending task',typeId:'call',dueDate:'2027-01-16'})).id;
   const contact=await call(mgr,communicationPost,'communication',{action:'manual_start',id:crypto.randomUUID(),accountId:f.b,leadId:f.l,contactId:null,channel:'call',purpose:null,otherPurpose:null,recipient:'+54 9 3447 400000',recipientName:'Person',destination:null,body:'Llamada realizada',result:'manual_sent',templateId:null});
   await sql`UPDATE crm_messages SET task_id=${linkedTask} WHERE id=${contact.id}::uuid`.execute(db);
   await sql`UPDATE crm_accounts SET do_not_contact=true WHERE id=${f.b}`.execute(db);
   const account=await db.selectFrom('crmAccounts').selectAll().where('id','=',f.b).executeTakeFirstOrThrow();assert.equal(account.doNotContact,true);assert.equal(account.archivedAt,null);
   const lost=(await call(admin,pipelineGet,'pipeline?leadId='+f.l)).managementReasons.find((r:any)=>r.managementType==='main'&&r.outcomeKey==='lost'&&r.reasonKey!=='do_not_contact');assert(lost);
   const rev=(await call(admin,pipelineGet,'pipeline?leadId='+f.l)).insights[0].pipelineRevision as number;
   type W=[(r:Request)=>Promise<Response>,string,unknown];
   const commercial=(body:unknown):W=>[commercialPost,'commercial',body];
   const writes:W[]=[
    commercial({action:'account_save',id:f.b,nombre:'Unauthorized edit'}),
    commercial({action:'account_save',id:f.b,nombre:`Zz D1 readonly ${suffix}`,telefono:'+54 9 3447 '+String(suffix).slice(-6)}),
    commercial({action:'contact_save',accountId:f.b,id:f.c,name:'Unauthorized person',isPrimary:true}),
    commercial({action:'contact_save',accountId:f.b,name:'Unauthorized new person',isPrimary:false}),
    commercial({action:'contact_delete',accountId:f.b,id:f.c}),
    commercial({action:'opportunity_save',accountId:f.b,id:f.l,opportunityName:'Unauthorized management'}),
    commercial({action:'opportunity_save',accountId:f.b,managementType:'main',opportunityName:'Unauthorized new management'}),
    commercial({action:'convert_client',accountId:f.b,reason:'Unauthorized conversion'}),
    commercial({action:'set_client',accountId:f.b,isClient:true,reason:'Unauthorized client mark'}),
    commercial({action:'business_status',accountId:f.b,status:'reviewed',recontactAt:null}),
    commercial({action:'account_archive',accountId:f.b,archived:true,reason:'Unauthorized archive'}),
    commercial({action:'account_trash',accountIds:[f.b],deleted:true,reason:'Unauthorized trash'}),
    [quick,'leads_quick',{id:f.b,accountId:f.b,field:'ciudad',value:'Unauthorized city',expectedValue:'Colón'}],
    [quick,'leads_quick',{id:f.l,accountId:f.b,scope:'management',field:'origen',value:'Unauthorized origin',expectedValue:null}],
    [save,'leads_save',{id:f.l,nombre:'Unauthorized legacy edit'}],
    [legacy,'leads',{id:f.l,nombre:'Unauthorized compatibility edit'}],
    [note,'lead_notes',{leadId:f.l,note:'Unauthorized note'}],
    [remove,'leads_delete',{id:f.l}],
    [bulk,'leads_bulk',{entity:'business',ids:[f.b],changes:{ciudad:'Unauthorized batch'}}],
    [bulk,'leads_bulk',{entity:'opportunity',ids:[f.l],changes:{prioridad:'alta'}}],
    [bulkRemove,'leads_bulk_delete',{entity:'business',ids:[f.b]}],
    [bulkRemove,'leads_bulk_delete',{entity:'opportunity',ids:[f.l]}],
    [workPost,'work',{action:'task_save',accountId:f.b,title:'Unauthorized task',typeId:'call',dueDate:'2027-01-15'}],
    [workPost,'work',{action:'task_save',id:preTask,accountId:f.b,title:'Unauthorized reschedule',typeId:'call',dueDate:'2027-02-15'}],
    [workPost,'work',{action:'task_delete',id:preTask}],
    [workPost,'work',{action:'task_status',id:preTask,status:'completed',result:'Unauthorized completion',outcome:'interested',continuation:'done'}],
    [workPost,'work',{action:'activity_save',accountId:f.b,title:'Unauthorized call',typeId:'call',occurredAt:new Date().toISOString(),outcome:'interested',continuation:'done'}],
    [pipelinePost,'pipeline',{action:'transition',leadId:f.l,revision:rev,stage:'main:lost',reasonId:lost.id,comment:''}],
    [pipelinePost,'pipeline',{action:'contact_policy',accountId:f.b,blocked:false,reason:'Unauthorized lift'}],
    [communicationPost,'communication',{action:'prepare_general',id:crypto.randomUUID(),accountId:f.b,leadId:null,contactId:f.c,channel:'whatsapp',purpose:'resume',otherPurpose:null,templateId:null}],
    [communicationPost,'communication',{action:'manual_start',id:crypto.randomUUID(),accountId:f.b,leadId:f.l,contactId:null,channel:'call',purpose:'resume',otherPurpose:null,recipient:dncPhone,recipientName:'',destination:null,body:'',result:'manual_sent',templateId:null}],
   ];
   const snapshot=async()=>JSON.stringify([await db.selectFrom('crmAccounts').selectAll().where('id','=',f.b).executeTakeFirstOrThrow(),await db.selectFrom('leads').selectAll().where('accountId','=',f.b).orderBy('id').execute(),await db.selectFrom('crmContacts').selectAll().where('accountId','=',f.b).orderBy('id').execute(),await db.selectFrom('crmTasks').selectAll().where('accountId','=',f.b).orderBy('id').execute(),await db.selectFrom('crmActivities').selectAll().where('accountId','=',f.b).orderBy('id').execute()]);
   const before=await snapshot();
   // The business responsible, the responsible of its management and an unrelated seller are all rejected (the colleague already was).
   for(const seller of [owner,mgr,other])for(const [handler,url,body] of writes)await call(seller,handler,url,body,403);
   assert.equal(await snapshot(),before,'no rejected write changed the No contactar business');
   // A single Leandro user is needed for the referral to resolve: it is created here, any leftover Leandro is renamed for the duration, and everything is restored below.
   const isolateLeandro=async(keepEmail:string,tag:string|number)=>{// pipeline.ts resolves the referral target by display name and fails unless exactly one user matches; leftovers of earlier runs are renamed for this run only and restored by the returned function.
    const rows=(await sql<{id:string;displayName:string|null;fullName:string|null}>`SELECT id,display_name,full_name FROM users WHERE email<>${keepEmail} AND (lower(trim(display_name))='leandro' OR lower(trim(coalesce(full_name,'')))='leandro')`.execute(db)).rows;
    const hidden=(v:string|null)=>v&&v.trim().toLowerCase()==='leandro'?`${v} (isolated ${tag})`:v;
    for(const r of rows)await sql`UPDATE users SET display_name=${hidden(r.displayName)},full_name=${hidden(r.fullName)} WHERE id=${r.id}`.execute(db);
    assert.equal(Number((await sql<{n:string}>`SELECT count(*) n FROM users WHERE lower(trim(display_name))='leandro' OR lower(trim(coalesce(full_name,'')))='leandro' OR lower(split_part(email,'@',1))='leandro'`.execute(db)).rows[0].n),1,'exactly one Leandro user while the referral runs');
    return async()=>{for(const r of rows)await sql`UPDATE users SET display_name=${r.displayName},full_name=${r.fullName} WHERE id=${r.id}`.execute(db);};
   };
   const leandroEmail=`leandro-d1-${suffix}@example.com`;
   const created=await db.insertInto('users').values({email:leandroEmail,displayName:'Leandro',role:'user'}).returning('id').executeTakeFirstOrThrow();
   const restoreLeandro=await isolateLeandro(leandroEmail,suffix);
   // The referral to Leandro skips the write guard for readers: it must stay closed on a No contactar business too.
   for(const seller of [owner,mgr,other])await call(seller,pipelinePost,'pipeline',{action:'transition',leadId:f.l,revision:rev,stage:'main:leandro'},403);
   assert.equal(await snapshot(),before,'a rejected referral changed nothing');
   // The management board and badges must not offer a stage change either.
   for(const seller of [owner,mgr])assert.equal((await call(seller,pipelineGet,'pipeline?leadId='+f.l)).insights[0].canModify,false,'pipeline insight canModify is false on a No contactar business');
   assert.equal((await call(admin,pipelineGet,'pipeline?leadId='+f.l)).insights[0].canModify,true);
   // Reading stays as before: the owner and a colleague read the live business; only the write flags change.
   for(const reading of [owner,mgr,other,admin])for(const [handler,url] of [[commercialGet,'commercial?accountId='+f.b],[communicationGet,'communication?accountId='+f.b],[resourcesGet,'resources?accountId='+f.b],[workGet,'work?mode=detail&accountId='+f.b]] as const)await call(reading,handler,url);
   assert.equal((await call(owner,commercialGet,'commercial?accountId='+f.b)).canEditContactData,false);
   assert.equal((await call(owner,qualityGet,'dataQuality?accountId='+f.b)).canEdit,false);assert.equal((await call(admin,qualityGet,'dataQuality?accountId='+f.b)).canEdit,true);
   const rowsFor=async(a:Actor)=>(await call(a,list,'leads?entity=business&q='+encodeURIComponent(`Zz D1 readonly ${suffix}`))).rows;
   assert.equal((await rowsFor(owner))[0].canModify,false,'the list marks the No contactar business read-only for its owner');assert.equal((await rowsFor(owner))[0].canModifyManagement,false);assert.equal((await rowsFor(admin))[0].canModify,true);
   assert.equal((await call(mgr,list,'leads?entity=opportunity&q='+encodeURIComponent('Mgmt readonly'))).rows[0].canModify,false,'the management responsible gets read-only too');
   // Incoming responses of other categories still work for the responsible seller.
   await call(owner,communicationPost,'communication',resp(f.b,'information'));
   // The messageId exception only completes the task of that very contact.
   const completion=(id:string)=>({action:'task_status',id,status:'completed',result:'Contact outcome',outcome:'interested',continuation:'done',continuationReason:'Nothing else to schedule',messageId:contact.id,messageSent:true});
   await call(mgr,workPost,'work',completion(otherTask),403);assert.equal((await db.selectFrom('crmTasks').select('status').where('id','=',otherTask).executeTakeFirstOrThrow()).status,'pending','an unrelated pending task stays open');
   await call(mgr,workPost,'work',completion(linkedTask));
   // The admin keeps full access and can lift the block, which gives the owner her edit rights back.
   for(const [handler,url,body] of [commercial({action:'account_save',id:f.b,nombre:`Zz D1 readonly ${suffix}`,ciudad:'Concordia'}),commercial({action:'contact_save',accountId:f.b,name:'Admin person',isPrimary:false}),[quick,'leads_quick',{id:f.b,accountId:f.b,field:'ciudad',value:'Colón',expectedValue:'Concordia'}],[note,'lead_notes',{leadId:f.l,note:'Admin note'}],[workPost,'work',{action:'task_save',accountId:f.b,title:'Admin task',typeId:'call',dueDate:'2027-01-15'}],[resourcesPost,'resources',{action:'create',id:crypto.randomUUID(),title:'Admin business document',type:'propuesta',library:false,accountId:f.b,leadId:null,activityId:null,categoryId:null,version:{url:'https://example.com/admin.pdf'}}],[bulk,'leads_bulk',{entity:'business',ids:[f.b],changes:{ciudad:'Concordia'}}]] as W[])await call(admin,handler,url,body);
   {// Admin referral on the No contactar business works.
    try{
     const live=(await call(admin,pipelineGet,'pipeline?leadId='+f.l)).insights[0].pipelineRevision as number;
     await call(admin,pipelinePost,'pipeline',{action:'transition',leadId:f.l,revision:live,stage:'main:leandro'});
     assert.equal((await db.selectFrom('crmAccounts').select('referredToLeandro').where('id','=',f.b).executeTakeFirstOrThrow()).referredToLeandro,true);
     await call(admin,pipelinePost,'pipeline',{action:'unrefer',leadId:f.l,revision:(await call(admin,pipelineGet,'pipeline?leadId='+f.l)).insights[0].pipelineRevision});
    }finally{await restoreLeandro();await db.deleteFrom('users').where('id','=',created.id).execute();}
   }
   await call(admin,pipelinePost,'pipeline',{action:'contact_policy',accountId:f.b,blocked:false,reason:'D1 lift'});
   await call(owner,commercialPost,'commercial',{action:'account_save',id:f.b,nombre:`Zz D1 readonly ${suffix}`,ciudad:'Paraná'});
   assert.equal((await rowsFor(owner))[0].canModify,true,'after the admin lifts the block the owner edits again');
  }
  console.log('Decisions D1 and 1C: No contactar recording needs the business/management responsible or an admin; non-archived No contactar businesses are read-only for sellers on every write path, the admin keeps and lifts it');
 }
 console.log(`Permissions API: ${checks} checks passed; shared reading, owner/admin writes, administrative settings, mixed-batch rollback, trash and archived protection. No communications dispatched.`);
}finally{await db.destroy()}
