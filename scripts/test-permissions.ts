import assert from 'node:assert/strict';
import superjson from 'superjson';
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
import {get as pipelineGet} from '../src/endpoints/pipeline';
import {get as resourcesGet,post as resourcesPost} from '../src/endpoints/resources';
import {get as workGet,post as workPost} from '../src/endpoints/work';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable database with all migrations applied');
const suffix=Date.now();let checks=0;
async function actor(role:'admin'|'user',name:string){
 const user=await db.insertInto('users').values({email:`permissions-${name}-${suffix}@example.com`,displayName:name,fullName:'Private full name',phone:'private-phone',sex:'otro',senderEmail:`permissions-${name}@hospeda.com.ar`,role}).returningAll().executeTakeFirstOrThrow();
 const sid='permission-'+user.id;
 await db.insertInto('sessions').values({id:sid,userId:user.id,expiresAt:new Date(Date.now()+3600000)}).execute();
 const r=new Response();await setServerSession(r,{id:sid,createdAt:Date.now(),lastAccessed:Date.now()});
 return {user,cookie:r.headers.get('set-cookie')!.split(';')[0]};
}
type Actor=Awaited<ReturnType<typeof actor>>;
async function call(a:Actor,handler:(r:Request)=>Promise<Response>,url:string,body?:unknown,status=200){
 const r=await handler(new Request('http://localhost/_api/'+url,{headers:{cookie:a.cookie},...(body===undefined?{}:{method:'POST',body:superjson.stringify(body)})}));
 const data=superjson.parse<any>(await r.text());assert.equal(r.status,status,`${url}: ${data.error??JSON.stringify(data)}`);checks++;return data;
}
try{
 const owner=await actor('user','owner'),other=await actor('user','other'),admin=await actor('admin','admin');
 const accountId=(await call(owner,commercialPost,'commercial',{action:'account_save',nombre:'Permission business '+suffix,email:'business@example.com'})).id;
 const ownOther=(await call(other,commercialPost,'commercial',{action:'account_save',nombre:'Colleague business '+suffix})).id;
 const leadId=(await call(owner,commercialPost,'commercial',{action:'opportunity_save',accountId,opportunityName:'Existing management',estado:'Cargado'})).id;
 const contactId=(await call(owner,commercialPost,'commercial',{action:'contact_save',accountId,name:'Known person',isPrimary:true,email:'person@example.com'})).id;
 const colleagueLead=(await call(other,commercialPost,'commercial',{action:'opportunity_save',accountId:ownOther,opportunityName:'Colleague management',estado:'Cargado'})).id;
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
 await call(owner,quick,'leads_quick',classification('tipo',null,verticalB,null));
 const clearedClassification=await call(owner,list,'leads?entity=business&q='+encodeURIComponent('Permission business '+suffix));
 assert.equal(clearedClassification.rows[0].tipo,null);assert.equal(clearedClassification.rows[0].subtipo,null);
 console.log('Inline business edits: owner/admin permissions, compare-and-set conflicts, idempotent retry, isolated field writes and management preservation passed');
 await call(other,commercialGet,'commercial?accountId='+accountId);
 const shared=await call(other,list,'leads?entity=business&q='+encodeURIComponent('Permission business '+suffix));assert.equal(shared.total,1);assert.equal(shared.rows[0].canModify,false);
 assert.equal((await call(owner,list,'leads?entity=business&q='+encodeURIComponent('Permission business '+suffix))).rows[0].canModify,true);
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
 const separateManagement=(await call(admin,commercialPost,'commercial',{action:'opportunity_save',accountId:separateBusiness,opportunityName:'Independent owner',assignedUserEmail:other.user.email})).id;
 await call(owner,commercialPost,'commercial',{action:'opportunity_save',accountId:separateBusiness,id:separateManagement,opportunityName:'Unauthorized by business owner'},403);
 await call(other,commercialPost,'commercial',{action:'opportunity_save',accountId:separateBusiness,id:separateManagement,opportunityName:'Authorized management owner'});
 await call(other,save,'leads_save',{id:separateManagement,scope:'opportunity',nombre:'Must preserve the business',opportunityName:'Authorized scoped edit'});
 // Explicit management selection can edit its owner's fields without business ownership.
 const secondManagement=(await call(admin,commercialPost,'commercial',{action:'opportunity_save',accountId:separateBusiness,opportunityName:'Another management',assignedUserEmail:owner.user.email})).id;
 const pending=(await call(owner,workPost,'work',{action:'task_save',accountId:separateBusiness,title:'Preserve this commitment',typeId:'call',dueDate:'2027-01-15'})).id;
 const taskBefore=await db.selectFrom('crmTasks').selectAll().where('id','=',pending).executeTakeFirstOrThrow();
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
 // Materials are administered exclusively by admin and used in an authorized context.
 const documentId=crypto.randomUUID();
 const createDocument={action:'create',id:documentId,title:'Approved test material',type:'propuesta',library:true,accountId:null,leadId:null,activityId:null,categoryId:null,version:{url:'https://example.com/material.pdf'}};
 await call(owner,resourcesPost,'resources',createDocument,403);
 await call(admin,resourcesPost,'resources',createDocument);
 await call(admin,resourcesPost,'resources',{action:'status',id:documentId,revision:1,status:'approved'});
 await call(owner,resourcesPost,'resources',{action:'version',id:documentId,revision:1,version:{url:'https://example.com/replacement.pdf'}},403);
 await call(owner,resourcesPost,'resources',{action:'link',id:documentId,accountId,leadId,activityId:null});
 await call(other,resourcesPost,'resources',{action:'link',id:documentId,accountId,leadId,activityId:null},403);
 assert((await call(other,resourcesGet,'resources?accountId='+accountId)).documents.some((d:any)=>d.id===documentId));
 // Legitimate owner/admin edits remain possible.
 await call(owner,commercialPost,'commercial',{action:'account_save',id:accountId,nombre:'Permission business '+suffix,email:'business@example.com'});
 await call(admin,quick,'leads_quick',{id:leadId,field:'prioridad',value:'alta'});
 await call(owner,bulk,'leads_bulk',{entity:'opportunity',ids:[leadId],changes:{prioridad:'media'}});
 await call(owner,remove,'leads_delete',{id:leadId});
 const detail=await call(other,commercialGet,'commercial?accountId='+accountId);assert.equal(detail.opportunities.length,0);assert.equal(detail.leadJournal.length,0);
 for(const [handler,url] of [[commercialGet,'commercial?leadId='+leadId],[notes,'lead_notes?leadId='+leadId],[journal,'lead_journal?leadId='+leadId],[pipelineGet,'pipeline?leadId='+leadId]] as const)await call(other,handler,url,undefined,403);
 await call(admin,notes,'lead_notes?leadId='+leadId);
 // Archived access is forbidden through every contextual API, including its owner.
 await call(owner,commercialPost,'commercial',{action:'account_archive',accountId,archived:true,reason:'Permission archive test'});
 for(const seller of [owner,other]){
  for(const [handler,url] of [[commercialGet,'commercial?accountId='+accountId],[commercialGet,'commercial?archived=true'],[qualityGet,'dataQuality?accountId='+accountId],[communicationGet,'communication?accountId='+accountId],[resourcesGet,'resources?accountId='+accountId],[workGet,'work?mode=detail&accountId='+accountId]] as const)await call(seller,handler,url,undefined,403);
  await call(seller,workPost,'work',{action:'task_save',accountId,title:'Unauthorized task',typeId:'call',dueDate:'2027-01-15'},403);
 }
 await call(admin,commercialGet,'commercial?accountId='+accountId);
 await call(admin,commercialPost,'commercial',{action:'account_archive',accountId,archived:false,reason:'Restore test business'});
 console.log(`Permissions API: ${checks} checks passed; shared reading, owner/admin writes, administrative settings, mixed-batch rollback, trash and archived protection. No communications dispatched.`);
}finally{await db.destroy()}
