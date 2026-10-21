import {randomUUID} from 'node:crypto';
import {post as communication} from '../src/endpoints/communication';
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
async function sendEmail(req:Request){const input=superjson.parse<any>(await req.text());const cookie=req.headers.get('cookie')!;const call=(body:any)=>communication(new Request('http://localhost/_api/communication',{method:'POST',headers:{cookie},body:superjson.stringify(body)}));let r=await call({action:'prepare',id:randomUUID(),leadId:String(input.leadId),templateId:String(input.templateId),contactId:input.contactId??null,channel:'email'});if(!r.ok)return r;let m=superjson.parse<any>(await r.text());r=await call({action:'edit',id:m.id,revision:m.revision,subject:m.subject,body:m.body});if(!r.ok)return r;m=superjson.parse<any>(await r.text());return call({action:'dispatch',id:m.id,revision:m.revision,confirm:true});}
import {handle as duplicateCheck} from '../src/endpoints/business_duplicate_check';
import {handle as duplicates} from '../src/endpoints/leads_duplicates_GET';
import {handle as deleteBusinesses} from '../src/endpoints/leads_bulk_delete_POST';
import {handle as restore} from '../src/endpoints/leads_restore_POST';
import {handle as getStats} from '../src/endpoints/leads_stats_GET';
import type {OutputType as ListOutput} from '../src/endpoints/leads_GET.schema';
import {handle as getLeads} from '../src/endpoints/leads_GET';
import {sql} from 'kysely';
import {BUSINESS_PROJECTION_LEAD_COLUMNS,businessTableSource} from '../src/helpers/businessTable';
import {calendarDay} from '../src/helpers/workDates';
import type {CommercialDetail} from '../src/endpoints/commercial.schema';
import {DNC_DUPLICATE_MESSAGE} from '../src/endpoints/business_duplicate_check.schema';
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
  const accountId=await mutate({action:'account_save',nombre:`CRM test ${suffix}`,ciudad:`CRM city ${suffix}`,email:'generic@example.com',assignedUserEmail:admin.email},admin.value);
  const otherId=await mutate({action:'account_save',nombre:`Other ${suffix}`});
  await mutate({action:'account_save',id:accountId,nombre:'Forbidden',assignedUserEmail:user.email},user.value,403);
  await mutate({action:'account_save',id:accountId,nombre:`CRM test ${suffix}`,email:'generic@example.com'},user.value,403);
  await mutate({action:'account_save',id:accountId,nombre:`CRM test ${suffix}`,ciudad:`CRM city ${suffix}`,email:'generic@example.com',assignedUserEmail:user.email},admin.value);
  await mutate({action:'account_save',id:accountId,nombre:`CRM test ${suffix}`,ciudad:`CRM city ${suffix}`,email:'generic@example.com'});
  assert.equal((await detail(accountId)).account.assignedUserEmail,user.email);
  {// U-09: duplicate check hides private data and No contactar duplicates cannot be created or edited into (admins included)
    const check=async(q:Record<string,string>,who=user.value)=>{const r=await duplicateCheck(new Request('http://localhost/_api/business/duplicate-check?'+new URLSearchParams(q),{headers:{cookie:who}}));const t=await r.text();assert.equal(r.status,200,t);return superjson.parse<{candidates:Record<string,any>[]}>(t).candidates};
    assert.equal((await duplicateCheck(new Request('http://localhost/_api/business/duplicate-check?nombre=x'))).status,401);
    const p6=String(suffix).slice(-6),dncName=`Cabañas Dupé ${suffix}`,dncPhone=`+54 9 3447 15-${p6}`;
    const dncId=await mutate({action:'account_save',nombre:dncName,ciudad:'Colón',telefono:dncPhone,email:`dnc-${suffix}@example.com`,assignedUserEmail:admin.email},admin.value);
    await db.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',dncId).execute();
    let found=await check({nombre:dncName.replace('Dupé','Dupe'),ciudad:'colon'});
    assert.deepEqual(found.map(c=>c.id),[dncId]);assert.equal(found[0].doNotContact,true);assert.equal(found[0].responsibleName,'CRM admin');
    assert(!JSON.stringify(found).includes(admin.email)&&!JSON.stringify(found).includes('3447')&&!JSON.stringify(found).includes('dnc-'),'No owner email or contact data leaks');
    assert.equal((await check({nombre:`Cabanas Dupe ${suffix}`,ciudad:'Colón'})).length,0,'ñ and n stay different');
    found=await check({telefono:`03447${p6}`});assert.equal(found[0]?.id,dncId);assert(found[0].reasons.includes('Teléfono compartido'));
    found=await check({telefono:`47${p6}`});assert.equal(found[0]?.id,dncId);assert.deepEqual(found[0].reasons,['Teléfono parecido']);
    found=await check({email:`DNC-${suffix}@example.com`});assert.equal(found[0]?.id,dncId);
    assert.equal((await check({telefono:`03447${p6.replace(/.$/,d=>String((+d+1)%10))}`})).length,0);
    // Only an exact name+city or an exactly shared phone blocks; similar phone and shared email only warn.
    await mutate({action:'account_save',nombre:`Similar phone ${suffix}`,telefono:`47${p6}`});
    await mutate({action:'account_save',nombre:`Same email ${suffix}`,email:`dnc-${suffix}@example.com`});
    await mutate({action:'account_save',nombre:`Cabanas Dupe ${suffix}`,ciudad:'Colón',email:`dnc-${suffix}@example.com`},admin.value);
    await mutate({action:'account_save',nombre:`Otro nombre ${suffix}`,telefono:dncPhone},user.value,409);
    await mutate({action:'account_save',nombre:`Otro nombre ${suffix}`,telefono:`3447 15 ${p6}`},user.value,409);
    await mutate({action:'account_save',nombre:`Otro nombre ${suffix}`,whatsapp:dncPhone},user.value,409);
    await mutate({action:'account_save',nombre:dncName,ciudad:'Colón'},admin.value,409);
    {// DNC with a landline and a different WhatsApp: either channel blocks a re-add
      const q=p6.split('').reverse().join('');assert.notEqual(q,p6);
      const dnc2=await mutate({action:'account_save',nombre:`Dos canales ${suffix}`,ciudad:'Colón',telefono:`03442 ${p6}`,whatsapp:`+54 9 3442 15-${q}`},admin.value);
      await db.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',dnc2).execute();
      await mutate({action:'account_save',nombre:`Otro canal ${suffix}`,whatsapp:`3442 15 ${q}`},user.value,409);
      await mutate({action:'account_save',nombre:`Otro canal ${suffix}`,telefono:`3442${p6}`},user.value,409);
      await mutate({action:'account_save',nombre:`Otro canal ${suffix}`,telefono:`3442${p6}`,whatsapp:'3445111222'},user.value,409);
      await db.updateTable('crmAccounts').set({deletedAt:new Date()}).where('id','=',dnc2).execute();
    }
    // Editing an existing business into a DNC duplicate is blocked; an unchanged identity is not.
    const edited=await mutate({action:'account_save',nombre:`Editable ${suffix}`,ciudad:'Colón'});
    await mutate({action:'account_save',id:edited,nombre:dncName,ciudad:'Colón'},user.value,409);
    await mutate({action:'account_save',id:edited,nombre:`Editable ${suffix}`,ciudad:'Colón',telefono:dncPhone},user.value,409);
    await mutate({action:'account_save',id:edited,nombre:`Editable ${suffix}`,ciudad:'Colón',businessNotes:'only notes'});
    await db.updateTable('crmAccounts').set({archivedAt:new Date(),status:'archived'}).where('id','=',dncId).execute();
    found=await check({nombre:dncName,ciudad:'Colón'});assert.equal(found[0].archived,true);assert.equal(found[0].canOpen,false,'Archived is not openable by sellers');
    assert(!('status' in found[0])&&!('responsibleName' in found[0]),'Unopenable candidates omit status and responsible');
    assert.equal((await check({nombre:dncName,ciudad:'Colón'},admin.value))[0].canOpen,true);
    await mutate({action:'account_save',nombre:dncName,ciudad:'Colón'},user.value,409);
    await mutate({action:'account_save',nombre:`Unrelated ${suffix}`,ciudad:'Colón',telefono:'3442999111'});
    await db.updateTable('crmAccounts').set({doNotContact:false}).where('id','=',dncId).execute();
    await mutate({action:'account_save',nombre:dncName,ciudad:'Colón'});// non-DNC duplicates only warn
    await db.updateTable('crmAccounts').set({deletedAt:new Date()}).where('id','=',dncId).execute();
    assert.equal((await check({telefono:`03447${p6}`})).some(c=>c.id===dncId),false,'Trash is excluded');
  }
  {// U-18: one-step creation stores the person as Principal in the same transaction, never creates a management, and keeps the No contactar block
    const quickName=`Alta rápida ${suffix}`,p6=String(suffix).slice(-6);
    const quickId=await mutate({action:'account_save',nombre:quickName,ciudad:'Colón',telefono:`03446 ${p6}`,primaryContact:{name:'Ana del alta',phone:'3447 400222'}});
    const quick=await detail(quickId);
    assert.deepEqual(quick.contacts.map(c=>[c.name,c.phone,c.isPrimary]),[['Ana del alta','3447 400222',true]]);
    assert.equal(quick.account.assignedUserEmail,user.email);
    assert.equal(quick.opportunities.length,0,'Creating a business never creates a management');
    assert.equal((await db.selectFrom('crmTasks').select('id').where('accountId','=',quickId).execute()).length,0,'Creating a business never creates a task');
    const created=quick.journal.find(j=>j.action==='contact_created');
    assert.equal(String(created?.contactId),String(quick.contacts[0].id),'The person creation is audited');
    assert(quick.journal.some(j=>j.action==='account_created'));
    await mutate({action:'account_save',id:quickId,nombre:quickName,ciudad:'Colón',telefono:`03446 ${p6}`,primaryContact:{name:'Luis'}},user.value,400);
    assert.equal((await detail(quickId)).contacts.length,1,'Existing businesses add people through contact_save');
    await mutate({action:'account_save',nombre:`Alta email ${suffix}`,primaryContact:{name:'Email malo',email:'no-es-email'}},user.value,400);
    assert.equal((await db.selectFrom('crmAccounts').select('id').where('nombre','=',`Alta email ${suffix}`).execute()).length,0,'An invalid person email creates nothing');
    // Atomicity: when the person insert fails, the business is rolled back too.
    await sql`CREATE OR REPLACE FUNCTION u18_fail_contact() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.name='Falla del alta' THEN RAISE EXCEPTION 'forced contact failure'; END IF; RETURN NEW; END$$`.execute(db);
    await sql`CREATE TRIGGER u18_fail_contact BEFORE INSERT ON crm_contacts FOR EACH ROW EXECUTE FUNCTION u18_fail_contact()`.execute(db);
    try{
      const failed=await post(request({action:'account_save',nombre:`Alta fallida ${suffix}`,primaryContact:{name:'Falla del alta'}}));
      assert.notEqual(failed.status,200,await failed.text());
      assert.equal((await db.selectFrom('crmAccounts').select('id').where('nombre','=',`Alta fallida ${suffix}`).execute()).length,0,'Business and person are one transaction');
    }finally{await sql`DROP TRIGGER u18_fail_contact ON crm_contacts`.execute(db);await sql`DROP FUNCTION u18_fail_contact()`.execute(db);}
    // A duplicate of a No contactar business is a 409 with the decision copy the dialog shows; nothing is created.
    const dnc=await mutate({action:'account_save',nombre:`No contactar rápido ${suffix}`,ciudad:'Colón',telefono:`03445 ${p6}`,assignedUserEmail:admin.email},admin.value);
    await db.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',dnc).execute();
    const blocked=await post(request({action:'account_save',nombre:`Otro alta ${suffix}`,telefono:`3445 ${p6}`,primaryContact:{name:'Persona bloqueada'}}));
    assert.equal(blocked.status,409);assert.equal(superjson.parse<{error:string}>(await blocked.text()).error,DNC_DUPLICATE_MESSAGE);
    assert.equal((await db.selectFrom('crmContacts').select('id').where('name','=','Persona bloqueada').execute()).length,0);
    // The duplicate check returns the server's block decision per candidate. A person's phone never blocks, it only warns (decision 13B).
    const check=async(q:Record<string,string>)=>{const r=await duplicateCheck(new Request('http://localhost/_api/business/duplicate-check?'+new URLSearchParams(q),{headers:{cookie:user.value}}));const t=await r.text();assert.equal(r.status,200,t);return superjson.parse<{candidates:{id:string;blocking:boolean;doNotContact:boolean;reasons:string[]}[]}>(t).candidates.find(c=>c.id===dnc)};
    assert.equal((await check({telefono:`3445 ${p6}`}))?.blocking,true);
    assert.equal((await check({telefono:`45${p6}`}))?.blocking,false,'A similar phone only warns');
    let viaPerson=await check({nombre:'Sin relación',personPhone:`03445-${p6}`});assert.equal(viaPerson?.blocking,false,'A person phone shared with a No contactar business only warns');assert.equal(viaPerson?.doNotContact,true);assert.deepEqual(viaPerson?.reasons,['Teléfono de la persona compartido']);
    viaPerson=await check({personPhone:`45${p6}`});assert.equal(viaPerson?.blocking,false);assert.deepEqual(viaPerson?.reasons,['Teléfono de la persona parecido']);
    // The person's phone only warns (decision 13B): account_save and contact_save succeed; the business phone case above still blocks.
    const personWarnId=await mutate({action:'account_save',nombre:`Alta persona ${suffix}`,primaryContact:{name:'Persona con teléfono de No contactar',phone:`3445 ${p6}`}});
    assert.equal((await db.selectFrom('crmContacts').select('id').where('accountId','=',personWarnId).where('name','=','Persona con teléfono de No contactar').execute()).length,1);
    const similarId=await mutate({action:'account_save',nombre:`Alta parecida ${suffix}`,primaryContact:{name:'Persona parecida',phone:`45${p6}`}});
    await mutate({action:'contact_save',accountId:quickId,name:'Luis con teléfono de No contactar',phone:`+54 9 3445 ${p6}`});
    assert.equal((await db.selectFrom('crmAccounts').select('doNotContact').where('id','=',dnc).executeTakeFirstOrThrow()).doNotContact,true,'A warned person phone never lifts No contactar');
    await mutate({action:'contact_save',accountId:quickId,name:'Luis parecido',phone:`45${p6}`});
    const legacy=await db.insertInto('crmContacts').values({accountId:quickId,name:'Legado',phone:`3445 ${p6}`,isPrimary:false}).returning('id').executeTakeFirstOrThrow();
    await mutate({action:'contact_save',accountId:quickId,id:String(legacy.id),name:'Legado editado',phone:`3445 ${p6}`});// an unchanged phone does not block
    await mutate({action:'contact_save',accountId:quickId,id:String(legacy.id),name:'Legado editado',phone:`+54 9 (3445) ${p6}`});// reformatting a phone that already matched does not block
    await mutate({action:'contact_save',accountId:quickId,id:String(quick.contacts[0].id),name:'Ana del alta',phone:`03445-${p6}`});// changing to a No contactar phone only warns
    await mutate({action:'contact_save',accountId:dnc,name:'Persona del propio negocio',phone:`3445 ${p6}`},admin.value);// the business's own phone is not a duplicate
    await db.updateTable('crmAccounts').set({deletedAt:new Date()}).where('id','in',[dnc,quickId,similarId,personWarnId]).execute();
  }
  const ana=await mutate({action:'contact_save',accountId,name:'Ana',email:'ana@example.com',phone:'111',isPrimary:true});
  const luis=await mutate({action:'contact_save',accountId,name:'Luis',email:'luis@example.com',phone:'222',isPrimary:true});
  let d=await detail(accountId);assert.equal(d.contacts.filter(c=>c.isPrimary&&!c.deletedAt).length,1);assert.equal(String(d.contacts.find(c=>c.isPrimary)!.id),luis);
  // Real DB uniqueness protects callers outside the API too.
  await assert.rejects(db.insertInto('crmContacts').values({accountId,name:'Conflict',isPrimary:true}).execute());
  const foreign=await mutate({action:'contact_save',accountId:otherId,name:'Foreign',email:'foreign@example.com'});
  const vertical=await db.selectFrom('crmVerticals').select('name').where('active','=',true).executeTakeFirstOrThrow();
  const stage=d.stages[0];
  const first=await mutate({action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:'Primera venta',tipo:vertical.name,estado:stage,primaryContactId:ana,serviceInterest:'Publicación',estimatedCloseDate:'2027-01-15',assignedUserEmail:admin.email},admin.value);
  const second=await mutate({action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:'Segunda venta',tipo:vertical.name,estado:stage,primaryContactId:luis});
  await mutate({action:'opportunity_save',accountId,opportunityName:'Forbidden',primaryContactId:foreign},user.value,400);
  await mutate({action:'opportunity_save',accountId,id:first,opportunityName:'Forbidden',assignedUserEmail:user.email},user.value,403);
  await assert.rejects(db.updateTable('leads').set({primaryContactId:foreign}).where('id','=',first).execute());
  assert.equal((await quick(request({id:first,field:'estado',value:d.stages[1]||stage}))).status,403,'Foreign stage movement rejected');
  const quickResult=await quick(request({id:first,field:'estado',value:d.stages[1]||stage},admin.value));assert.equal(quickResult.status,200,await quickResult.text());
  d=await detail(accountId);assert.equal(d.opportunities.length,2);assert.equal(d.opportunities.find(o=>String(o.id)===second)!.estado,stage);
  assert.equal((await quick(request({id:first,field:'assignedUserEmail',value:user.email}))).status,403);
  assert.equal((await bulk(request({ids:[first,second],changes:{assignedUserEmail:user.email}}))).status,403);
  assert.equal((await saveLead(request({id:first,nombre:d.account.nombre,assignedUserEmail:user.email}))).status,403);
  assert.equal((await legacy(request({id:first,nombre:d.account.nombre,asignadoA:'CRM user'}))).status,403);
  const protectedBusiness=d.account.nombre;
  const scoped=await saveLead(request({id:first,scope:'opportunity',nombre:'Stale business',telefono:'stale',email:'stale@example.com',opportunityName:'Primera venta',estado:stage,tipo:vertical.name,assignedUserEmail:admin.email,primaryContactId:ana,serviceInterest:'Publicación',estimatedCloseDate:'2027-01-15'},admin.value));
  assert.equal(scoped.status,200);d=await detail(accountId);
  assert.equal(d.account.nombre,protectedBusiness);assert.equal(d.account.email,'generic@example.com');
  assert.equal(String(d.opportunities.find(o=>String(o.id)===first)!.primaryContactId),ana);
  assert.equal((await saveLead(request({id:first,scope:'opportunity',nombre:protectedBusiness,primaryContactId:foreign},admin.value))).status,400);
  assert.equal((await saveLead(request({id:first,scope:'opportunity',nombre:protectedBusiness,assignedUserEmail:user.email}))).status,403);
  const beforeJournal=d.leadJournal.length;
  await mutate({action:'convert_client',accountId,reason:'Acuerdo comercial confirmado'});
  d=await detail(accountId);assert.equal(d.account.commercialStatus,'client');assert(d.account.clientSince);assert.equal(d.opportunities.length,2);assert.equal(d.leadJournal.length,beforeJournal);
  assert.equal(d.journal.filter(j=>j.action==='converted_to_client').length,1);
  await mutate({action:'convert_client',accountId,reason:'Repetido'});assert.equal((await detail(accountId)).journal.filter(j=>j.action==='converted_to_client').length,1);
  const invalidLog=await contactLog(request({leadId:first,contactId:foreign,channel:'email',result:'Respondió'},admin.value));assert.equal(invalidLog.status,400);
  assert.equal((await contactLog(request({leadId:first,contactId:ana,channel:'email',result:'Respondió'},admin.value))).status,200);
  const template=await db.insertInto('messageTemplates').values({name:'CRM template',channel:'email',subject:'Hola {{contact}}',body:'<p>{{contact}} · {{email}} · {{sender_short}}</p>'}).returningAll().executeTakeFirstOrThrow();
  await db.insertInto('messageTemplates').values({name:'CRM WhatsApp template',channel:'whatsapp',body:'<p>Hola {{contact}} {{email}}</p>'}).execute();
  process.env.BREVO_API_KEY='test-placeholder';
  const realFetch=globalThis.fetch;
  const outbound:Record<string,any>[]=[];
  globalThis.fetch=async (_url,init)=>{outbound.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({messageId:'test-'+outbound.length}),{status:201})};
  try{
    assert.equal((await sendEmail(request({leadId:first,templateId:template.id,contactId:luis},admin.value))).status,200);
    assert.equal(outbound[0].to[0].email,'luis@example.com');assert.match(outbound[0].htmlContent,/Luis/);assert.match(outbound[0].htmlContent,/luis@example.com/);assert(!outbound[0].htmlContent.includes('ana@example.com'));
    assert.equal((await sendEmail(request({leadId:first,templateId:template.id,contactId:foreign},admin.value))).status,400);assert.equal(outbound.length,1);
    const genericTemplate=await db.insertInto('messageTemplates').values({name:'CRM generic template',channel:'email',subject:'Hola',body:'<p>Mensaje general</p>'}).returningAll().executeTakeFirstOrThrow();
    const generalRecipient=await sendEmail(request({leadId:first,templateId:genericTemplate.id},admin.value));
    assert.equal(generalRecipient.status,200,await generalRecipient.text());
    assert.equal(outbound[1].to[0].email,'generic@example.com');assert(!outbound[1].subject.includes('Luis'));assert(!outbound[1].subject.includes('Ana'));
    const noChannel=await mutate({action:'contact_save',accountId,name:'Sin email'});
    assert.equal((await sendEmail(request({leadId:first,templateId:template.id,contactId:noChannel},admin.value))).status,400);assert.equal(outbound.length,2);
    await db.updateTable('messageTemplates').set({commercialProfile:'Consolidado'}).where('id','=',template.id).execute();
    await db.updateTable('leads').set({commercialProfile:null}).where('id','=',first).execute();
    assert.equal((await sendEmail(request({leadId:first,templateId:template.id,contactId:luis},admin.value))).status,200,'No profile allows segmented templates');
    await db.updateTable('leads').set({commercialProfile:'Referente'}).where('id','=',first).execute();
    assert.equal((await sendEmail(request({leadId:first,templateId:template.id,contactId:luis},admin.value))).status,400,'Known profile still restricts templates');
    await db.updateTable('leads').set({commercialProfile:null}).where('id','=',first).execute();
    await db.updateTable('messageTemplates').set({vertical:'Wrong vertical'}).where('id','=',template.id).execute();
    assert.equal((await sendEmail(request({leadId:first,templateId:template.id,contactId:luis},admin.value))).status,400,'Missing profile does not relax vertical');
    await db.updateTable('messageTemplates').set({commercialProfile:null,vertical:null}).where('id','=',template.id).execute();
  }finally{globalThis.fetch=realFetch}
  await mutate({action:'contact_delete',accountId,id:ana});
  d=await detail(accountId);assert(!d.contacts.some(c=>String(c.id)===ana));assert.equal(d.opportunities.find(o=>String(o.id)===first)!.primaryContactId,null);
  assert.equal((await contactLog(request({leadId:first,contactId:ana,channel:'email',result:'Respondió'},admin.value))).status,400);
  assert(d.journal.some(j=>j.action==='contact_deleted'));assert(d.leadJournal.some(j=>j.action==='contact_logged'));
  const filterGroups=JSON.stringify([{rules:[{field:'id',operator:'eq',value:first}]}]);
  const listed=await getLeads(new Request('http://localhost/_api/leads?filterGroups='+encodeURIComponent(filterGroups),{headers:{cookie:user.value}}));
  assert.equal(listed.status,200);assert.equal(superjson.parse<{rows:any[]}>(await listed.text()).rows[0].id,first);
  const duplicated=await duplicates(new Request('http://localhost/_api/leads_duplicates',{headers:{cookie:user.value}}));
  assert.equal(duplicated.status,200);
  const duplicateGroups=superjson.parse<{groups:{leads:{id:string}[]}[]}>(await duplicated.text()).groups;
  assert(!duplicateGroups.some(g=>g.leads.some(l=>l.id===first)&&g.leads.some(l=>l.id===second)),'Related opportunities must not be duplicate businesses');
  const searchResult=await getLeads(new Request('http://localhost/_api/leads?q=Segunda%20venta',{headers:{cookie:user.value}}));
  assert.equal(searchResult.status,200);assert(superjson.parse<{rows:{id:string}[]}>(await searchResult.text()).rows.some(l=>l.id===second));
  async function businesses(params:string){
    const r=await getLeads(new Request('http://localhost/_api/leads?entity=business&'+params,{headers:{cookie:user.value}}));
    const body=await r.text();assert.equal(r.status,200,body);return superjson.parse<ListOutput>(body);
  }
  let businessList=await businesses('q='+encodeURIComponent(`CRM test ${suffix}`));
  assert.deepEqual(businessList.filters.ciudades,[],'Business list omits filter options by default');
  assert.equal(businessList.total,1);assert.equal(businessList.rows.length,1);
  const businessFilters=await businesses('q='+encodeURIComponent(`CRM test ${suffix}`)+'&filterOptions=include');
  assert(businessFilters.filters.ciudades.includes(`CRM city ${suffix}`),'Explicit filter options include available business cities');
  assert.equal(String(businessList.rows[0].id),accountId);assert.equal(businessList.rows[0].opportunityCount,2);
  assert.equal(businessList.rows[0].commercialStatus,'client');
  // The existing saved-view rules still match original lead IDs, then return one business.
  businessList=await businesses('filterGroups='+encodeURIComponent(filterGroups));
  assert.equal(businessList.total,1);assert.equal(String(businessList.rows[0].id),accountId);
  assert.equal(businessList.rows[0].opportunityId,first);
  businessList=await businesses('q=Segunda%20venta');assert(businessList.rows.some(a=>String(a.id)===accountId));
  assert.equal((await businesses('q=Segunda%20venta&filterGroups='+encodeURIComponent(filterGroups))).total,0,'Free search AND filters must match the same opportunity');
  assert.equal((await businesses('q='+encodeURIComponent(`CRM test ${suffix}`)+'&filterGroups='+encodeURIComponent(filterGroups))).total,1,'Free search combines with matching dialog filters');
  const empty=await mutate({action:'account_save',nombre:`Empty business ${suffix}`,email:'generic@example.com'});
  businessList=await businesses('q='+encodeURIComponent(`Empty business ${suffix}`));
  assert.equal(businessList.total,1);assert.equal(businessList.rows[0].opportunityCount,0);assert.equal(businessList.rows[0].opportunityId,null);
  // Shared emails never merge unrelated businesses.
  const sharedEmail=await businesses('textFilters='+encodeURIComponent(JSON.stringify([{field:'email',mode:'equals',value:'generic@example.com'}])));
  assert(sharedEmail.rows.some(a=>String(a.id)===accountId));assert(sharedEmail.rows.some(a=>String(a.id)===empty));
  // Business projection: one column per leads column plus business_status, derived values computed once and shared by filters, sort and count.
  const leadColumns=(await sql<{columnName:string}>`select column_name from information_schema.columns where table_schema='public' and table_name='leads' order by ordinal_position`.execute(db)).rows.map(r=>r.columnName);
  assert.deepEqual([...BUSINESS_PROJECTION_LEAD_COLUMNS],leadColumns,'businessTable.ts must list every leads column in table order');
  const projectionColumns=Object.keys((await db.selectFrom(businessTableSource().as('p')).selectAll().limit(1).execute())[0]??{});
  if(projectionColumns.length)assert.deepEqual(projectionColumns,[...leadColumns.map(c=>c.replace(/_([a-z0-9])/g,(_,x)=>x.toUpperCase())),'businessStatus']);
  const token=`Proyección ${suffix}`;const projected:string[]=[];
  for(let i=0;i<12;i++)projected.push((await db.insertInto('crmAccounts').values({nombre:`${token} ${String(i).padStart(2,'0')}`,assignedUserEmail:user.email}).returning('id').executeTakeFirstOrThrow()).id);
  const day=(offset:number)=>new Date(Date.UTC(2026,0,10+offset,15));
  for(let i=0;i<9;i++)await db.insertInto('crmActivities').values({accountId:projected[i],typeId:'call',title:'Llamada',occurredAt:day(i%5)}).execute();
  await db.insertInto('crmActivities').values({accountId:projected[0],typeId:'call',title:'Borrada',occurredAt:day(30),deletedAt:new Date()}).execute();
  await db.insertInto('crmContacts').values([{accountId:projected[1],name:'Zoe Secundaria',isPrimary:false},{accountId:projected[1],name:'Íñigo Núñez',isPrimary:true},{accountId:projected[2],name:'Ana Única',isPrimary:false}]).execute();
  await db.insertInto('crmTasks').values([{accountId:projected[3],title:'Después',typeId:'call',dueDate:'2026-02-10',assignedUserEmail:user.email},{accountId:projected[3],title:'Antes',typeId:'call',dueDate:'2026-02-05',assignedUserEmail:user.email},{accountId:projected[4],title:'Borrada',typeId:'call',dueDate:'2026-01-01',deletedAt:new Date()}]).execute();
  const pageOf=(page:number,extra='')=>businesses(`q=${encodeURIComponent(token)}&pageSize=10&sortBy=fechaUltimoContacto&sortDir=desc&page=${page}${extra}`);
  const [pageOne,pageTwo]=[await pageOf(1),await pageOf(2)];
  assert.equal(pageOne.total,12);assert.equal(pageTwo.total,12);assert.equal(pageOne.rows.length,10);assert.equal(pageTwo.rows.length,2);
  const allRows=[...pageOne.rows,...pageTwo.rows];assert.deepEqual(new Set(allRows.map(r=>String(r.id))),new Set(projected),'Pages cover each business once');
  const lastContact=allRows.map(r=>r.fechaUltimoContacto?calendarDay(r.fechaUltimoContacto):null);
  assert.deepEqual(lastContact,[...lastContact].sort((a,b)=>a===b?0:a===null?-1:b===null?1:a<b?1:-1),'Descending sort keeps NULL first, then latest contact');
  const rowOf=(index:number)=>allRows.find(r=>String(r.id)===projected[index])!;
  assert.equal(calendarDay(rowOf(0).fechaUltimoContacto),'2026-01-10','Deleted activities do not count as contact');
  assert.equal(rowOf(9).fechaUltimoContacto,null);assert.equal(rowOf(1).contactName,'Íñigo Núñez');assert.equal(rowOf(2).contactName,'Ana Única');
  assert.equal(calendarDay(rowOf(3).fechaProximaAccion),'2026-02-05');assert.equal(rowOf(3).nextActionTitle,'Antes');assert.equal(rowOf(4).fechaProximaAccion,null);
  assert.equal(rowOf(1).contactCount,2);assert.equal(rowOf(0).contactCount,0);
  const contacted=await pageOf(1,'&filterGroups='+encodeURIComponent(JSON.stringify([{rules:[{field:'fechaUltimoContacto',operator:'not_empty'}]}])));
  assert.equal(contacted.total,9);assert.equal(contacted.rows.length,9);
  const accentless=await pageOf(1,'&filterGroups='+encodeURIComponent(JSON.stringify([{rules:[{field:'contactName',operator:'contains',value:'IÑIGO NUÑEZ'},{field:'contactName',operator:'contains',value:'ANA UNICA'}]}])));
  assert.deepEqual(accentless.rows.map(r=>String(r.id)).sort(),[projected[1],projected[2]].sort(),'OR group on a derived column is accent-insensitive');
  assert.equal((await pageOf(1,'&filterGroups='+encodeURIComponent(JSON.stringify([{rules:[{field:'contactName',operator:'contains',value:'inigo nuñez'}]}])))).total,0,'ñ stays distinct from n');
  const excluded=await pageOf(1,'&filterGroups='+encodeURIComponent(JSON.stringify([{rules:[{field:'fechaProximaAccion',operator:'not_empty'}]},{rules:[{field:'contactName',operator:'neq',value:'Ana Única'}]}])));
  assert.deepEqual(excluded.rows.map(r=>String(r.id)),[projected[3]],'AND groups combine a derived filter with an exclusion');
  console.log('Business projection: column parity, derived contact/task/activity values, sort, filters and count across pages passed');
  assert.equal((await quick(request({id:first,accountId,field:'estado',value:stage}))).status,400,'Ambiguous business quick edit rejected');
  assert.equal((await quick(request({id:first,accountId:otherId,field:'estado',value:stage}))).status,400,'Foreign opportunity rejected');
  assert.equal((await quick(request({id:first,accountId,field:'assignedUserEmail',value:user.email}))).status,403);
  assert.equal((await bulk(request({entity:'business',ids:[accountId],changes:{assignedUserEmail:user.email}}))).status,403);
  const originalOppOwner=(await detail(accountId)).opportunities.find(o=>String(o.id)===first)!.assignedUserEmail;
  assert.equal((await quick(request({id:first,accountId,field:'assignedUserEmail',value:user.email},admin.value))).status,200);
  d=await detail(accountId);assert.equal(d.account.assignedUserEmail,user.email);assert.equal(d.opportunities.find(o=>String(o.id)===first)!.assignedUserEmail,originalOppOwner);
  assert.equal((await bulk(request({entity:'business',ids:[accountId,empty],changes:{ciudad:'Colón'}}))).status,200);
  assert.equal((await detail(empty)).account.ciudad,'Colón');d=await detail(accountId);
  assert(d.opportunities.every(o=>o.ciudad==='Colón'));assert(d.journal.some(j=>j.action==='account_updated'));
  assert.equal((await bulk(request({entity:'business',ids:[accountId],changes:{estado:stage}}))).status,403);
  assert.equal((await bulk(request({entity:'business',ids:[accountId],changes:{estado:stage}},admin.value))).status,200);
  d=await detail(accountId);assert(d.opportunities.every(o=>o.estado===stage));
  const conjunction=JSON.stringify([{rules:[{field:'id',operator:'eq',value:first}]},{rules:[{field:'id',operator:'eq',value:second}]}]);
  assert.equal((await businesses('filterGroups='+encodeURIComponent(conjunction))).total,0,'AND groups must match the same opportunity');
  const disjunction=JSON.stringify([{rules:[{field:'id',operator:'eq',value:first},{field:'id',operator:'eq',value:second}]}]);
  assert.equal((await businesses('filterGroups='+encodeURIComponent(disjunction))).total,1,'OR deduplicates businesses');
  const statsResponse=await getStats(new Request('http://localhost/_api/leads_stats?entity=business',{headers:{cookie:user.value}}));
  assert.equal(statsResponse.status,200);assert.equal(superjson.parse<{total:number}>(await statsResponse.text()).total,(await businesses('')).total);
  // Account locks and transactions roll back the whole bulk operation on invalid selections.
  assert.equal((await bulk(request({entity:'business',ids:[accountId,'999999999'],changes:{ciudad:'Invalid'}}))).status,400);
  assert.equal((await detail(accountId)).account.ciudad,'Colón');
  assert.equal((await deleteBusinesses(request({entity:'business',ids:[accountId,empty]}))).status,400);
  assert.equal((await detail(accountId)).opportunities.length,2);
  assert.equal((await deleteBusinesses(request({entity:'business',ids:[accountId]}))).status,403);
  assert.equal((await deleteBusinesses(request({entity:'business',ids:[accountId]},admin.value))).status,200);
  assert.equal((await businesses('q='+encodeURIComponent(`CRM test ${suffix}`))).total,1,'Business survives removal of all sales');
  d=await detail(accountId);assert.equal(d.account.commercialStatus,'client');assert(d.contacts.length);assert.equal(d.leadJournal.length,0,'Deleted opportunity history is available only through Trash');
  const deletedRules=JSON.stringify([{rules:[{field:'deletedAt',operator:'is_true'}]}]);
  async function deletionList(entity:string,rules=deletedRules,auth=admin.value){const r=await getLeads(new Request('http://localhost/_api/leads?entity='+entity+'&q='+encodeURIComponent(`CRM test ${suffix}`)+'&filterGroups='+encodeURIComponent(rules),{headers:{cookie:auth}}));return {status:r.status,data:superjson.parse<ListOutput>(await r.text())};}
  assert.equal((await deletionList('opportunity',deletedRules,user.value)).status,403,'Archived data remains admin-only');
  let archived=await deletionList('opportunity');assert.equal(archived.status,200);assert.equal(archived.data.total,2);assert(archived.data.rows.every(row=>row.deletedAt));
  archived=await deletionList('business');assert.equal(archived.data.total,0,'Opportunity deletion does not delete its business');
  const activeRules=JSON.stringify([{rules:[{field:'deletedAt',operator:'is_false'}]}]);assert.equal((await deletionList('business',activeRules)).data.total,1,'The business remains active after its managements are deleted');
  const bothRules=JSON.stringify([{rules:[{field:'deletedAt',operator:'is_true'},{field:'deletedAt',operator:'is_false'}]}]);assert.equal((await deletionList('opportunity',bothRules)).data.total,2);
  assert.equal((await restore(request({id:first},admin.value))).status,200);
  assert.equal((await deletionList('opportunity',activeRules)).data.total,1);
  assert.equal((await deletionList('opportunity')).data.total,1,'Restore removes one row from deleted filter');
  assert.equal((await deletionList('opportunity',bothRules)).data.total,2,'OR includes active and deleted');
  assert.equal((await businesses('q='+encodeURIComponent(`CRM test ${suffix}`))).total,1);
  assert.equal((await quick(request({id:first,accountId,field:'estado',value:stage}))).status,403,'A business owner cannot change a management owned by another user');
  assert.equal((await quick(request({id:first,accountId,field:'estado',value:stage},admin.value))).status,200,'Single opportunity quick edit remains supported for its owner or admin');
  await restore(request({id:second},admin.value));
  console.log('Business table: distinct businesses, empty businesses, legacy filters AND/OR, canonical inline fields, independent owners, admin restriction, bulk scope/rollback, trash/restore passed');
  console.log('Commercial integration: auth, admin-only owners, two contacts/opportunities, DB constraints, independent states, audited conversion, selected recipients, empty generic names, templates, soft deletion and legacy filters passed');
}finally{await db.destroy()}
