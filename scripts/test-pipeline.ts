import assert from 'node:assert/strict';
import superjson from 'superjson';
import {sql} from 'kysely';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {get,post} from '../src/endpoints/pipeline';
import {handle as quick} from '../src/endpoints/leads_quick_POST';
import {handle as list} from '../src/endpoints/leads_GET';
import {localDay} from '../src/helpers/workDates';
import type {PipelineData} from '../src/endpoints/pipeline.schema';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use disposable DB');const stamp=Date.now();
async function identity(role:'admin'|'user'){
 const user=await db.insertInto('users').values({email:`pipeline-${role}-${stamp}-${Math.random()}@example.com`,displayName:'Pipeline '+role,role}).returningAll().executeTakeFirstOrThrow();
 const session={id:user.email,createdAt:Date.now(),lastAccessed:Date.now()};await db.insertInto('sessions').values({id:session.id,userId:user.id,expiresAt:new Date(Date.now()+3600000)}).execute();const response=new Response();await setServerSession(response,session);return {user,cookie:response.headers.get('set-cookie')!.split(';')[0]};
}
const admin=await identity('admin'),user=await identity('user'),other=await identity('user');
const request=(body:unknown,cookie=user.cookie)=>new Request('http://localhost/_api/pipeline',{method:'POST',headers:{cookie},body:superjson.stringify(body)});
async function mutate(body:unknown,cookie=user.cookie,status=200){const r=await post(request(body,cookie));const value=superjson.parse<{id:string;error?:string}>(await r.text());assert.equal(r.status,status,value.error);return value.id;}
async function read(params='',cookie=user.cookie,status=200){const r=await get(new Request('http://localhost/_api/pipeline?'+params,{headers:{cookie}}));const d=superjson.parse<PipelineData&{error?:string}>(await r.text());assert.equal(r.status,status,d.error);return d;}
let accountId:string|undefined;const bulkPrefix='Board bulk '+stamp+' ';
try{
 assert.equal((await get(new Request('http://localhost/_api/pipeline'))).status,401);
 const a=await db.insertInto('crmAccounts').values({nombre:'Pipeline fixtures '+stamp,assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();accountId=a.id;
 const l=await db.insertInto('leads').values({nombre:a.nombre,accountId:a.id,estado:'Cargado',tipo:'Alojamiento',prioridad:'baja',assignedUserEmail:user.user.email,opportunityName:'Plan inicial'}).returningAll().executeTakeFirstOrThrow();
 const lead=()=>db.selectFrom('leads').selectAll().where('id','=',l.id).executeTakeFirstOrThrow();
 // Spec 107 D4: unrefer to a chosen owner propagates across active group members.
 {
  const leandros=(await sql<{email:string}>`SELECT email FROM users WHERE lower(trim(display_name))='leandro' OR lower(trim(coalesce(full_name,'')))='leandro' OR lower(split_part(email,'@',1))='leandro' ORDER BY email`.execute(db)).rows;
  if(!leandros.length)await db.insertInto('users').values({email:`pipeline-leandro-${stamp}@example.com`,displayName:'Leandro',role:'user'}).execute();
  else for(const extra of leandros.slice(1))await sql`UPDATE users SET display_name=${'Pipeline extra '+stamp},full_name=${'Pipeline extra '+stamp} WHERE email=${extra.email}`.execute(db);
  const owner=await db.insertInto('crmAccounts').values({nombre:bulkPrefix+' unrefer owner',status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const peer=await db.insertInto('crmAccounts').values({nombre:bulkPrefix+' unrefer peer',status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const group=await db.insertInto('crmAccountSellerGroups').values({createdBy:admin.user.email}).returning('id').executeTakeFirstOrThrow();
  await db.insertInto('crmAccountSellerGroupMembers').values([{groupId:group.id,accountId:owner.id,addedBy:admin.user.email},{groupId:group.id,accountId:peer.id,addedBy:admin.user.email}]).execute();
  const referral=await db.insertInto('leads').values({nombre:owner.nombre,accountId:owner.id,estado:'main:contact',managementType:'main',assignedUserEmail:user.user.email,opportunityName:'Group unrefer'}).returningAll().executeTakeFirstOrThrow();
  await mutate({action:'transition',leadId:String(referral.id),revision:referral.pipelineRevision,stage:'main:leandro'},user.cookie);
  const referred=await db.selectFrom('leads').select('pipelineRevision').where('id','=',referral.id).executeTakeFirstOrThrow();
  await mutate({action:'unrefer',leadId:String(referral.id),revision:referred.pipelineRevision,assignedUserEmail:admin.user.email},admin.cookie);
  assert.equal((await db.selectFrom('crmAccounts').select('assignedUserEmail').where('id','=',peer.id).executeTakeFirstOrThrow()).assignedUserEmail,admin.user.email,'Chosen unrefer owner moves the active linked business');
  assert.equal(await db.selectFrom('crmCommercialJournal').select('id').where('accountId','=',peer.id).where('action','=','account_updated').execute().then(rows=>rows.length),1,'Group peer reassignment is journaled');
  const originalOwner=await db.insertInto('crmAccounts').values({nombre:bulkPrefix+' original owner',status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const inconsistentPeer=await db.insertInto('crmAccounts').values({nombre:bulkPrefix+' original peer',status:'reviewed',assignedUserEmail:admin.user.email}).returningAll().executeTakeFirstOrThrow();
  const secondGroup=await db.insertInto('crmAccountSellerGroups').values({createdBy:admin.user.email}).returning('id').executeTakeFirstOrThrow();await db.insertInto('crmAccountSellerGroupMembers').values([{groupId:secondGroup.id,accountId:originalOwner.id,addedBy:admin.user.email},{groupId:secondGroup.id,accountId:inconsistentPeer.id,addedBy:admin.user.email}]).execute();
  const secondLead=await db.insertInto('leads').values({nombre:originalOwner.nombre,accountId:originalOwner.id,estado:'main:contact',managementType:'main',assignedUserEmail:user.user.email,opportunityName:'Original owner unrefer'}).returningAll().executeTakeFirstOrThrow();
  await mutate({action:'transition',leadId:String(secondLead.id),revision:secondLead.pipelineRevision,stage:'main:leandro'},user.cookie);const secondReferred=await db.selectFrom('leads').select('pipelineRevision').where('id','=',secondLead.id).executeTakeFirstOrThrow();
  await mutate({action:'unrefer',leadId:String(secondLead.id),revision:secondReferred.pipelineRevision},admin.cookie);
  assert.equal((await db.selectFrom('crmAccounts').select('assignedUserEmail').where('id','=',inconsistentPeer.id).executeTakeFirstOrThrow()).assignedUserEmail,admin.user.email,'Restoring the original owner does not rewrite the group peer');
  // Regression: an inactive original owner normalizes to null on the default restore; it must never clear the group.
  const goneEmail=`pipeline-gone-${stamp}@example.com`;await db.insertInto('users').values({email:goneEmail,displayName:'Pipeline gone '+stamp,role:'user',deactivatedAt:new Date()}).execute();
  const goneOwner=await db.insertInto('crmAccounts').values({nombre:bulkPrefix+' gone owner',status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const gonePeer=await db.insertInto('crmAccounts').values({nombre:bulkPrefix+' gone peer',status:'reviewed',assignedUserEmail:admin.user.email}).returningAll().executeTakeFirstOrThrow();
  const goneGroup=await db.insertInto('crmAccountSellerGroups').values({createdBy:admin.user.email}).returning('id').executeTakeFirstOrThrow();await db.insertInto('crmAccountSellerGroupMembers').values([{groupId:goneGroup.id,accountId:goneOwner.id,addedBy:admin.user.email},{groupId:goneGroup.id,accountId:gonePeer.id,addedBy:admin.user.email}]).execute();
  const goneLead=await db.insertInto('leads').values({nombre:goneOwner.nombre,accountId:goneOwner.id,estado:'main:contact',managementType:'main',assignedUserEmail:user.user.email,opportunityName:'Inactive owner unrefer'}).returningAll().executeTakeFirstOrThrow();
  await mutate({action:'transition',leadId:String(goneLead.id),revision:goneLead.pipelineRevision,stage:'main:leandro'},user.cookie);
  await sql`UPDATE crm_accounts SET referred_original_owner_email=${goneEmail} WHERE id=${goneOwner.id}`.execute(db);
  const goneReferred=await db.selectFrom('leads').select('pipelineRevision').where('id','=',goneLead.id).executeTakeFirstOrThrow();
  await mutate({action:'unrefer',leadId:String(goneLead.id),revision:goneReferred.pipelineRevision},admin.cookie);
  assert.equal((await db.selectFrom('crmAccounts').select('assignedUserEmail').where('id','=',gonePeer.id).executeTakeFirstOrThrow()).assignedUserEmail,admin.user.email,'Default restore with an inactive original owner keeps the group peer seller');
 }
 const d=await read('leadId='+l.id);const reason=d.lossReasons.find(r=>r.active)!;
 await mutate({action:'stage_save',name:'Etapa test '+stamp,sortOrder:5,active:true,classification:'open'},user.cookie,403);
 await mutate({action:'rules_save',rules:d.rules},user.cookie,403);
 await mutate({action:'catalog_save',catalog:'loss',name:'Motivo test '+stamp,active:true},user.cookie,403);
 await mutate({action:'contact_policy',accountId:a.id,blocked:true,reason:'No autorizado'},user.cookie,403);
 await read('mode=reactivation&responsible=all',user.cookie,403);
 const revision=(await lead()).pipelineRevision;
 await mutate({action:'transition',leadId:l.id,revision,stage:'En tratativas'},other.cookie,403);
 await mutate({action:'transition',leadId:l.id,revision:revision+20,stage:'En tratativas'},user.cookie,409);
 {const r=await post(request({action:'transition',leadId:l.id,revision,stage:'Perdida'}));assert.equal(r.status,400);const body=superjson.parse<{error?:string}>(await r.text());assert.match(body.error??'',/^(Elegí el motivo|Para cerrar perdida)/,'trigger RAISE messages must reach the user through crmError, got: '+body.error)}
 assert.equal((await quick(request({id:l.id,field:'estado',value:'Perdida'}))).status,400);
 assert.equal((await quick(request({id:l.id,field:'estado',value:'En tratativas'},other.cookie))).status,403);
 await mutate({action:'transition',leadId:l.id,revision,stage:'Perdida',reasonId:reason.id,comment:'Retomar más adelante',recontactDate:'2026-10-01'});
 let row=await lead();assert.equal(row.estado,'Perdida');assert.equal(row.prioridad,'baja');
 assert.equal((await db.selectFrom('crmAccounts').select('commercialStatus').where('id','=',a.id).executeTakeFirstOrThrow()).commercialStatus,'prospect');
 let closed=await read('leadId='+l.id);const event=closed.events.find(e=>e.reasonId)!;assert.equal(event.comment,'Retomar más adelante');assert.equal(event.recontactDate,'2026-10-01');assert.equal(closed.insights[0].suggestion.priority,null);
 const queue=await read('mode=reactivation&reasonId='+reason.id+'&vertical=Alojamiento&from=2026-10-01&to=2026-10-01');assert(queue.reactivations.some(r=>r.id===l.id));
 assert(!(await read('mode=reactivation&from=2026-10-02')).reactivations.some(r=>r.id===l.id));
 await mutate({action:'contact_policy',accountId:a.id,blocked:true,reason:'Solicitó no contactar'},admin.cookie);
 const base={action:'reactivate',leadId:l.id,eventId:event.id,revision:(await lead()).pipelineRevision,mode:'reopen',stage:'En tratativas',dueDate:'2026-10-03',title:'Retomar conversación'};
 await mutate(base,user.cookie,403);await mutate(base,admin.cookie,403);
 await mutate({action:'contact_policy',accountId:a.id,blocked:false,reason:'Nuevo consentimiento'},admin.cookie);
 await mutate({...base,revision:(await lead()).pipelineRevision},admin.cookie);
 row=await lead();assert.equal(row.estado,'En tratativas');assert.equal(row.prioridad,'baja');
 closed=await read('leadId='+l.id);assert(closed.events.some(e=>e.id===event.id&&e.reasonId===reason.id));assert(closed.events.some(e=>e.action==='reactivation'));
 assert.equal((await db.selectFrom('crmTasks').selectAll().where('leadId','=',l.id).where('status','=','pending').execute()).length,1);
 assert(!(await read('mode=reactivation')).reactivations.some(r=>r.id===l.id));
 await mutate({...base,revision:row.pipelineRevision},user.cookie,409);
 const listResponse=await list(new Request('http://localhost/_api/leads?idExact='+l.id,{headers:{cookie:user.cookie}}));const listed=superjson.parse<{rows:{estado:string}[]}>(await listResponse.text());assert.equal(listed.rows[0].estado,'En tratativas');
 const boardResponse=await list(new Request('http://localhost/_api/leads?view=board&idExact='+l.id,{headers:{cookie:user.cookie}}));const board=superjson.parse<{rows:unknown[];boardTotals:{open:number;won:number;lost:number;total:number};truncated:boolean}>(await boardResponse.text());assert.equal(board.boardTotals.total,1);assert.equal(board.boardTotals.open+board.boardTotals.won+board.boardTotals.lost,1);assert.equal(board.truncated,false);
 const objectionType=d.objectionTypes.find(t=>t.active)!;
 const objection=await mutate({action:'objection_save',leadId:l.id,revision:(await lead()).pipelineRevision,typeId:objectionType.id,notes:'Debe consultar con su socio',status:'open'});
 assert.equal((await lead()).estado,'En tratativas');
 await mutate({action:'objection_save',leadId:l.id,revision:(await lead()).pipelineRevision,id:objection,typeId:objectionType.id,notes:'Aclarado',status:'resolved'});
 await mutate({action:'objection_save',leadId:l.id,revision:(await lead()).pipelineRevision,id:objection,typeId:objectionType.id,notes:'Aclarado',status:'resolved',deleted:true});
 assert.equal((await read('leadId='+l.id)).objections.length,0);
 const foreign=await db.insertInto('leads').values({nombre:a.nombre,accountId:a.id,estado:'Cargado',assignedUserEmail:other.user.email}).returningAll().executeTakeFirstOrThrow();
 await mutate({action:'objection_save',leadId:foreign.id,revision:foreign.pipelineRevision,id:objection,typeId:objectionType.id,status:'open'},admin.cookie,400);
 // Second close, explicit new opportunity: old lost state and relationship survive.
 await mutate({action:'transition',leadId:l.id,revision:(await lead()).pipelineRevision,stage:'Perdida',reasonId:reason.id,recontactDate:'2026-10-04'});
 const second=(await read('leadId='+l.id)).events.find(e=>e.action==='stage')!;
 const newId=await mutate({...base,eventId:second.id,revision:(await lead()).pipelineRevision,mode:'new',stage:'Cargado',opportunityName:'Nueva temporada'});
 const linked=await db.selectFrom('leads').selectAll().where('id','=',newId).executeTakeFirstOrThrow();assert.equal(linked.reactivatedFromId,l.id);assert.equal(linked.accountId,a.id);assert.equal(linked.assignedUserEmail,user.user.email);assert.equal((await lead()).estado,'Perdida');
 assert.equal((await read('leadId='+l.id)).events.filter(e=>e.reasonId).length,2);
 // Third close on linked opportunity, followup without reopening.
 await mutate({action:'transition',leadId:newId,revision:linked.pipelineRevision,stage:'Perdida',reasonId:reason.id,recontactDate:'2026-10-05'});
 const linkedClosed=await read('leadId='+newId);await mutate({...base,leadId:newId,eventId:linkedClosed.events[0].id,revision:linkedClosed.insights[0].pipelineRevision,mode:'followup'});
 assert.equal((await db.selectFrom('leads').select('estado').where('id','=',newId).executeTakeFirstOrThrow()).estado,'Perdida');
 const stageName='Desactivada '+stamp;await mutate({action:'stage_save',name:stageName,sortOrder:500,active:false,classification:'open'},admin.cookie);
 await mutate({action:'transition',leadId:foreign.id,revision:foreign.pipelineRevision,stage:stageName},admin.cookie,400);
 await mutate({action:'stage_save',name:'Cargado',sortOrder:0,active:true,classification:'won'},admin.cookie,400);
 const inactiveReason=await mutate({action:'catalog_save',catalog:'loss',name:'Desactivado '+stamp,active:false},admin.cookie);
 await mutate({action:'transition',leadId:foreign.id,revision:foreign.pipelineRevision,stage:'Perdida',reasonId:inactiveReason},admin.cookie,400);
 const policy=(await sql<{n:string}>`SELECT count(*) n FROM crm_pipeline_events WHERE account_id=${a.id} AND action='contact_policy'`.execute(db)).rows[0];assert.equal(Number(policy.n),2);
 assert((await read('mode=config',admin.cookie)).configJournal.some(j=>j.actorEmail===admin.user.email));
 // Report item 1.10: a closed typed management is reopened only by an admin, and each refusal says why.
 {
  const typed=await db.insertInto('leads').values({nombre:a.nombre,accountId:a.id,estado:'main:contact',managementType:'main',assignedUserEmail:user.user.email,opportunityName:'Gestión tipada'} as never).returningAll().executeTakeFirstOrThrow();
  const typedRevision=async()=>(await db.selectFrom('leads').select('pipelineRevision').where('id','=',typed.id).executeTakeFirstOrThrow()).pipelineRevision;
  const lostReason=d.managementReasons.find(r=>r.managementType==='main'&&r.outcomeKey==='lost'&&r.active&&!r.doNotContact&&!r.requiresNote)!;
  await mutate({action:'transition',leadId:typed.id,revision:await typedRevision(),stage:'main:lost',reasonId:lostReason.id});
  const refusal=async(stage:string,cookie:string,status:number)=>{const r=await post(request({action:'transition',leadId:typed.id,revision:await typedRevision(),stage},cookie));assert.equal(r.status,status);return superjson.parse<{error?:string}>(await r.text()).error;};
  assert.equal(await refusal('main:contacted',user.cookie,403),'Solo un administrador puede reabrir una gestión cerrada.');
  assert.equal(await refusal('main:won',admin.cookie,400),'Elegí una etapa disponible.');
  assert.equal((await db.selectFrom('leads').select('estado').where('id','=',typed.id).executeTakeFirstOrThrow()).estado,'main:lost');
  await mutate({action:'transition',leadId:typed.id,revision:await typedRevision(),stage:'main:contacted'},admin.cookie);
  assert.equal((await db.selectFrom('leads').select('estado').where('id','=',typed.id).executeTakeFirstOrThrow()).estado,'main:contacted');
 }
 // Spec 100 D5: a request without `handled`/`to` (the Para retomar defaults) lists a management just closed with a future recontact date,
 // even though the close already created its automatic recontact task. Explicit filters keep narrowing.
 {
  const fresh=await db.insertInto('leads').values({nombre:a.nombre,accountId:a.id,estado:'main:contact',managementType:'main',assignedUserEmail:user.user.email,opportunityName:'Cierre reciente'} as never).returningAll().executeTakeFirstOrThrow();
  const lostReason=d.managementReasons.find(r=>r.managementType==='main'&&r.outcomeKey==='lost'&&r.active&&!r.doNotContact&&!r.requiresNote)!;
  const future=localDay(new Date(Date.now()+30*86400000));
  await mutate({action:'transition',leadId:fresh.id,revision:fresh.pipelineRevision,stage:'main:lost',reasonId:lostReason.id,recontactDate:future});
  const listed=(await read('mode=reactivation')).reactivations.find(r=>r.id===fresh.id);
  assert(listed,'a just-closed management with a future recontact date must appear with the default filters');assert(listed.taskId,'the close created its recontact task');assert.equal(listed.recontactDate,future);
  assert((await read('mode=reactivation&handled=all')).reactivations.some(r=>r.id===fresh.id));
  assert((await read('mode=reactivation&handled=yes')).reactivations.some(r=>r.id===fresh.id));
  assert(!(await read('mode=reactivation&handled=no')).reactivations.some(r=>r.id===fresh.id),'explicit handled=no still hides closes with an action');
  assert(!(await read('mode=reactivation&to='+localDay())).reactivations.some(r=>r.id===fresh.id),'explicit Hasta still hides later dates');
 }
 // Spec 87: customer-marking wins require a useful agreement; non-client wins stay optional and later edits cannot empty customer evidence.
 {
  const agreement={agreement:'Plan anual acordado',person:'Ana Pérez',material:'',responsible:'',deliveryDate:null,reviewed:false};
  const customerWin=async(type:'main'|'partner')=>{
   const account=await db.insertInto('crmAccounts').values({nombre:`Rules ${type} ${stamp}`,status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
   const lead=await db.insertInto('leads').values({accountId:account.id,nombre:account.nombre,estado:`${type}:contact`,managementType:type,assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
   assert.equal((await db.selectFrom('crmAccounts').select('isClient').where('id','=',account.id).executeTakeFirstOrThrow()).isClient,false,'Precondition: business is not yet a client');
   const reason=d.managementReasons.find(r=>r.managementType===type&&r.outcomeKey==='won'&&r.active&&!r.requiresNote)!;const missing={action:'transition',leadId:String(lead.id),revision:lead.pipelineRevision,stage:`${type}:won`,reasonId:reason.id};
   const rejected=await post(request(missing));assert.equal(rejected.status,400);assert.match(superjson.parse<{error:string}>(await rejected.text()).error,/Completá qué se acordó/);
   assert.equal((await db.selectFrom('leads').select('estado').where('id','=',lead.id).executeTakeFirstOrThrow()).estado,`${type}:contact`,'Rejected close must not change stage');
   const revision=(await db.selectFrom('leads').select('pipelineRevision').where('id','=',lead.id).executeTakeFirstOrThrow()).pipelineRevision;
   await mutate({...missing,revision,closing:agreement});
   assert.equal((await db.selectFrom('crmAccounts').select('isClient').where('id','=',account.id).executeTakeFirstOrThrow()).isClient,true);
   let current=await db.selectFrom('leads').select('pipelineRevision').where('id','=',lead.id).executeTakeFirstOrThrow();
   const evidence=await read('leadId='+lead.id);const closeEvent=evidence.events.find(e=>e.action==='closing_checklist')!;
   assert.equal((closeEvent.metadata as {markedClient:boolean}).markedClient,true);
   await mutate({action:'closing_save',leadId:String(lead.id),revision:current.pipelineRevision,expectedEventId:closeEvent.id,closing:{...agreement,agreement:'  ',person:'  '}},user.cookie,400);
   current=await db.selectFrom('leads').select('pipelineRevision').where('id','=',lead.id).executeTakeFirstOrThrow();
   await mutate({action:'closing_save',leadId:String(lead.id),revision:current.pipelineRevision,expectedEventId:closeEvent.id,closing:agreement});
   // Regression (H3): the customer flag is carried by every save, so a 2nd save cannot empty the agreement.
   const second=(await sql<{id:string;metadata:unknown}>`SELECT id,metadata FROM crm_pipeline_events WHERE lead_id=${lead.id} AND action='closing_checklist' ORDER BY id DESC LIMIT 1`.execute(db)).rows[0];
   assert.equal((second.metadata as {markedClient?:boolean}).markedClient,true,'closing_save carries markedClient forward');
   current=await db.selectFrom('leads').select('pipelineRevision').where('id','=',lead.id).executeTakeFirstOrThrow();
   await mutate({action:'closing_save',leadId:String(lead.id),revision:current.pipelineRevision,expectedEventId:second.id,closing:{...agreement,agreement:'',person:''}},user.cookie,400);
  };
  await customerWin('main');await customerWin('partner');
  const providerAccount=await db.insertInto('crmAccounts').values({nombre:`Rules provider ${stamp}`,status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const provider=await db.insertInto('leads').values({accountId:providerAccount.id,nombre:providerAccount.nombre,estado:'provider:contact',managementType:'provider',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const providerReason=d.managementReasons.find(r=>r.managementType==='provider'&&r.outcomeKey==='participates'&&r.active&&!r.requiresNote)!;await mutate({action:'transition',leadId:String(provider.id),revision:provider.pipelineRevision,stage:'provider:participates',reasonId:providerReason.id});
  assert.equal((await db.selectFrom('crmAccounts').select('isClient').where('id','=',providerAccount.id).executeTakeFirstOrThrow()).isClient,false);
  const editorAccount=await db.insertInto('crmAccounts').values({nombre:`Rules editor ${stamp}`,status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const editor=await db.insertInto('leads').values({accountId:editorAccount.id,nombre:editorAccount.nombre,estado:'editor:proposal_preparing',managementType:'editor',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const editorReason=d.managementReasons.find(r=>r.managementType==='editor'&&r.outcomeKey==='proposal_won'&&r.active&&!r.requiresNote)!;await mutate({action:'transition',leadId:String(editor.id),revision:editor.pipelineRevision,stage:'editor:proposal_won',reasonId:editorReason.id,convertClient:false});
  assert.equal((await db.selectFrom('crmAccounts').select('isClient').where('id','=',editorAccount.id).executeTakeFirstOrThrow()).isClient,false);
  const editorClientAccount=await db.insertInto('crmAccounts').values({nombre:`Rules editor client ${stamp}`,status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const editorClient=await db.insertInto('leads').values({accountId:editorClientAccount.id,nombre:editorClientAccount.nombre,estado:'editor:proposal_preparing',managementType:'editor',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const convert={action:'transition',leadId:String(editorClient.id),revision:editorClient.pipelineRevision,stage:'editor:proposal_won',reasonId:editorReason.id,convertClient:true};
  await mutate(convert,user.cookie,400);assert.equal((await db.selectFrom('leads').select('estado').where('id','=',editorClient.id).executeTakeFirstOrThrow()).estado,'editor:proposal_preparing');
  await mutate({...convert,closing:agreement});assert.equal((await db.selectFrom('crmAccounts').select('isClient').where('id','=',editorClientAccount.id).executeTakeFirstOrThrow()).isClient,true);
  const legacyAccount=await db.insertInto('crmAccounts').values({nombre:`Rules legacy ${stamp}`,status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const legacyLead=await db.insertInto('leads').values({accountId:legacyAccount.id,nombre:legacyAccount.nombre,estado:'Cargado',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const legacy={action:'transition',leadId:String(legacyLead.id),revision:legacyLead.pipelineRevision,stage:'Ganada',convertClient:true};
  await mutate(legacy,user.cookie,400);await mutate({...legacy,closing:agreement});
 }
 // Board totals past the 500-row cap: real counts per classification, truncated flag, and per stage/type groups.
 {
  const stages=await db.selectFrom('crmStages').select(['name','classification']).execute();
  const pick=(c:string)=>stages.find(x=>x.classification===c)!.name;
  const plan=[['Cargado',400],[pick('won'),60],[pick('lost'),42]] as const;
  const accounts=await db.insertInto('crmAccounts').values(Array.from({length:502},(_,n)=>({nombre:bulkPrefix+n,assignedUserEmail:user.user.email}))).returning('id').execute();
  // Closing stages normally require a reason through the pipeline; this fixture only needs the counts, so the guard is paused on the disposable DB.
  const leadRows=await db.transaction().execute(async trx=>{
   await sql`ALTER TABLE leads DISABLE TRIGGER crm_pipeline_guard`.execute(trx);
   const inserted=await trx.insertInto('leads').values(accounts.map((account,n)=>({nombre:bulkPrefix+n,accountId:account.id,estado:n<400?plan[0][0]:n<460?plan[1][0]:plan[2][0],tipo:'Alojamiento',assignedUserEmail:user.user.email,opportunityName:'Bulk'}))).returning('id').execute();
   await sql`ALTER TABLE leads ENABLE TRIGGER crm_pipeline_guard`.execute(trx);
   return inserted;
  });
  const ids=leadRows.map(r=>Number(r.id));
  const bulkResponse=await list(new Request('http://localhost/_api/leads?view=board&idMin='+Math.min(...ids)+'&idMax='+Math.max(...ids),{headers:{cookie:user.cookie}}));
  const bulk=superjson.parse<{rows:unknown[];total:number;truncated:boolean;boardTotals:{open:number;won:number;lost:number;total:number;groups:{estado:string|null;managementType:string|null;count:number}[]}}>(await bulkResponse.text());
  assert.equal(bulk.rows.length,500);assert.equal(bulk.truncated,true);assert.equal(bulk.total,502);assert.equal(bulk.boardTotals.total,502);
  assert.deepEqual([bulk.boardTotals.open,bulk.boardTotals.won,bulk.boardTotals.lost],[400,60,42]);
  assert.equal(bulk.boardTotals.groups.reduce((sum,g)=>sum+g.count,0),502);assert.equal(bulk.boardTotals.groups.find(g=>g.estado===plan[1][0])?.count,60);
 }
 console.log('Pipeline integration: loss reason, queue filters, ownership, optimistic conflicts, legacy guards, blocked contact, reopen/new/followup, admin-only typed reopen messages, history, objections and catalogs passed');
}finally{
 try{
  await sql`ALTER TABLE leads ENABLE TRIGGER crm_pipeline_guard`.execute(db);
 if(accountId){await sql`DELETE FROM crm_pipeline_events WHERE account_id=${accountId}`.execute(db);await db.deleteFrom('leads').where('accountId','=',accountId).execute();}
 await sql`DELETE FROM crm_pipeline_events WHERE lead_id IN (SELECT id FROM leads WHERE nombre LIKE ${bulkPrefix+'%'})`.execute(db);await db.deleteFrom('leads').where('nombre','like',bulkPrefix+'%').execute();await sql`DELETE FROM crm_commercial_journal WHERE account_id IN (SELECT id FROM crm_accounts WHERE nombre LIKE ${bulkPrefix+'%'})`.execute(db);await db.deleteFrom('crmAccounts').where('nombre','like',bulkPrefix+'%').execute();
 }finally{
  await db.destroy();
 }
}
