import assert from 'node:assert/strict';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {get,post} from '../src/endpoints/commercial';
import {handle as quick} from '../src/endpoints/leads_quick_POST';
import {handle as bulk} from '../src/endpoints/leads_bulk_POST';
import {handle as saveLead} from '../src/endpoints/leads_save_POST';
import {handle as legacy} from '../src/endpoints/leads_POST';
import {handle as contactLog} from '../src/endpoints/lead_contact_POST';
import {handle as sendEmail} from '../src/endpoints/send_template_email_POST';
import {handle as duplicates} from '../src/endpoints/leads_duplicates_GET';
import {handle as getLeads} from '../src/endpoints/leads_GET';
import type {CommercialDetail} from '../src/endpoints/commercial.schema';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable test database');
const suffix=Date.now();
async function cookie(role:'admin'|'user'){
  const u=await db.insertInto('users').values({email:`crm-${role}-${suffix}@example.com`,displayName:`CRM ${role}`,role}).returningAll().executeTakeFirstOrThrow();
  const sessionId=`crm-${role}-${suffix}`;
  await db.insertInto('sessions').values({id:sessionId,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();
  const r=new Response();await setServerSession(r,{id:sessionId,createdAt:Date.now(),lastAccessed:Date.now()});
  return {value:r.headers.get('set-cookie')!.split(';')[0],email:u.email};
}
const admin=await cookie('admin'),user=await cookie('user');
function request(body:unknown,cookieValue=user.value){return new Request('http://localhost/_api/commercial',{method:'POST',headers:{cookie:cookieValue},body:superjson.stringify(body)})}
async function mutate(body:unknown,cookieValue=user.value,status=200){const r=await post(request(body,cookieValue));const value=superjson.parse<{id:string;error?:string}>(await r.text());assert.equal(r.status,status,value.error);return value.id}
async function detail(id:string){const r=await get(new Request(`http://localhost/_api/commercial?accountId=${id}`,{headers:{cookie:user.value}}));const body=await r.text();assert.equal(r.status,200,body);return superjson.parse<CommercialDetail>(body)}
try{
  assert.equal((await get(new Request('http://localhost/_api/commercial'))).status,401);
  assert.equal((await post(request({action:'account_save',nombre:'No auth'},''))).status,401);
  await mutate({action:'account_save',nombre:'Forbidden',assignedUserEmail:user.email},user.value,403);
  const accountId=await mutate({action:'account_save',nombre:`CRM test ${suffix}`,email:'generic@example.com',assignedUserEmail:admin.email},admin.value);
  const otherId=await mutate({action:'account_save',nombre:`Other ${suffix}`});
  await mutate({action:'account_save',id:accountId,nombre:'Forbidden',assignedUserEmail:user.email},user.value,403);
  await mutate({action:'account_save',id:accountId,nombre:`CRM test ${suffix}`,email:'generic@example.com'});
  assert.equal((await detail(accountId)).account.assignedUserEmail,admin.email);
  const ana=await mutate({action:'contact_save',accountId,name:'Ana',email:'ana@example.com',phone:'111',isPrimary:true});
  const luis=await mutate({action:'contact_save',accountId,name:'Luis',email:'luis@example.com',phone:'222',isPrimary:true});
  let d=await detail(accountId);assert.equal(d.contacts.filter(c=>c.isPrimary&&!c.deletedAt).length,1);assert.equal(String(d.contacts.find(c=>c.isPrimary)!.id),luis);
  // Real DB uniqueness protects callers outside the API too.
  await assert.rejects(db.insertInto('crmContacts').values({accountId,name:'Conflict',isPrimary:true}).execute());
  const foreign=await mutate({action:'contact_save',accountId:otherId,name:'Foreign',email:'foreign@example.com'});
  const vertical=await db.selectFrom('crmVerticals').select('name').where('active','=',true).executeTakeFirstOrThrow();
  const stage=d.stages[0];
  const first=await mutate({action:'opportunity_save',accountId,opportunityName:'Primera venta',tipo:vertical.name,estado:stage,primaryContactId:ana,serviceInterest:'Publicación',estimatedCloseDate:'2027-01-15',assignedUserEmail:admin.email},admin.value);
  const second=await mutate({action:'opportunity_save',accountId,opportunityName:'Segunda venta',tipo:vertical.name,estado:stage,primaryContactId:luis});
  await mutate({action:'opportunity_save',accountId,opportunityName:'Forbidden',primaryContactId:foreign},user.value,400);
  await mutate({action:'opportunity_save',accountId,id:first,opportunityName:'Forbidden',assignedUserEmail:user.email},user.value,403);
  await assert.rejects(db.updateTable('leads').set({primaryContactId:foreign}).where('id','=',first).execute());
  const quickResult=await quick(request({id:first,field:'estado',value:d.stages[1]||stage}));assert.equal(quickResult.status,200);
  d=await detail(accountId);assert.equal(d.opportunities.length,2);assert.equal(d.opportunities.find(o=>String(o.id)===second)!.estado,stage);
  assert.equal((await quick(request({id:first,field:'assignedUserEmail',value:user.email}))).status,403);
  assert.equal((await bulk(request({ids:[first,second],changes:{assignedUserEmail:user.email}}))).status,403);
  assert.equal((await saveLead(request({id:first,nombre:d.account.nombre,assignedUserEmail:user.email}))).status,400);
  assert.equal((await legacy(request({id:first,nombre:d.account.nombre,asignadoA:'CRM user'}))).status,403);
  const beforeJournal=d.leadJournal.length;
  await mutate({action:'convert_client',accountId,reason:'Acuerdo comercial confirmado'});
  d=await detail(accountId);assert.equal(d.account.commercialStatus,'client');assert(d.account.clientSince);assert.equal(d.opportunities.length,2);assert.equal(d.leadJournal.length,beforeJournal);
  assert.equal(d.journal.filter(j=>j.action==='converted_to_client').length,1);
  await mutate({action:'convert_client',accountId,reason:'Repetido'});assert.equal((await detail(accountId)).journal.filter(j=>j.action==='converted_to_client').length,1);
  const invalidLog=await contactLog(request({leadId:first,contactId:foreign,channel:'email',result:'Respondió'}));assert.equal(invalidLog.status,400);
  assert.equal((await contactLog(request({leadId:first,contactId:ana,channel:'email',result:'Respondió'}))).status,200);
  const template=await db.insertInto('messageTemplates').values({name:'CRM template',channel:'email',subject:'Hola {{contact}}',body:'<p>{{contact}} · {{email}} · {{sender_short}}</p>'}).returningAll().executeTakeFirstOrThrow();
  process.env.BREVO_API_KEY='test-placeholder';
  const realFetch=globalThis.fetch;
  const outbound:Record<string,any>[]=[];
  globalThis.fetch=async (_url,init)=>{outbound.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({messageId:'test-'+outbound.length}),{status:201})};
  try{
    assert.equal((await sendEmail(request({leadId:first,templateId:template.id,contactId:luis}))).status,200);
    assert.equal(outbound[0].to[0].email,'luis@example.com');assert.match(outbound[0].htmlContent,/Luis/);assert.match(outbound[0].htmlContent,/luis@example.com/);assert(!outbound[0].htmlContent.includes('ana@example.com'));
    assert.equal((await sendEmail(request({leadId:first,templateId:template.id,contactId:foreign}))).status,400);assert.equal(outbound.length,1);
    assert.equal((await sendEmail(request({leadId:first,templateId:template.id}))).status,200);
    assert.equal(outbound[1].to[0].email,'generic@example.com');assert(!outbound[1].subject.includes('Luis'));assert(!outbound[1].subject.includes('Ana'));
    const noChannel=await mutate({action:'contact_save',accountId,name:'Sin email'});
    assert.equal((await sendEmail(request({leadId:first,templateId:template.id,contactId:noChannel}))).status,400);assert.equal(outbound.length,2);
  }finally{globalThis.fetch=realFetch}
  await mutate({action:'contact_delete',accountId,id:ana});
  d=await detail(accountId);assert(d.contacts.find(c=>String(c.id)===ana)!.deletedAt);assert.equal(d.opportunities.find(o=>String(o.id)===first)!.primaryContactId,null);
  assert.equal((await contactLog(request({leadId:first,contactId:ana,channel:'email',result:'Respondió'}))).status,400);
  assert(d.journal.some(j=>j.action==='contact_deleted'));assert(d.leadJournal.some(j=>j.action==='email_sent'));
  const filterGroups=JSON.stringify([{rules:[{field:'id',operator:'eq',value:first}]}]);
  const listed=await getLeads(new Request('http://localhost/_api/leads?filterGroups='+encodeURIComponent(filterGroups),{headers:{cookie:user.value}}));
  assert.equal(listed.status,200);assert.equal(superjson.parse<{rows:any[]}>(await listed.text()).rows[0].id,first);
  const duplicated=await duplicates(new Request('http://localhost/_api/leads_duplicates',{headers:{cookie:user.value}}));
  assert.equal(duplicated.status,200);
  const duplicateGroups=superjson.parse<{groups:{leads:{id:string}[]}[]}>(await duplicated.text()).groups;
  assert(!duplicateGroups.some(g=>g.leads.some(l=>l.id===first)&&g.leads.some(l=>l.id===second)),'Related opportunities must not be duplicate businesses');
  const searchResult=await getLeads(new Request('http://localhost/_api/leads?q=Segunda%20venta',{headers:{cookie:user.value}}));
  assert.equal(searchResult.status,200);assert(superjson.parse<{rows:{id:string}[]}>(await searchResult.text()).rows.some(l=>l.id===second));
  console.log('Commercial integration: auth, admin-only owners, two contacts/opportunities, DB constraints, independent states, audited conversion, selected recipients, empty generic names, templates, soft deletion and legacy filters passed');
}finally{await db.destroy()}
