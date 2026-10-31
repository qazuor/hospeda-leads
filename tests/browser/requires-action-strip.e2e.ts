import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import superjson from 'superjson';
import {simulateUserscript} from './helpers/userscript';
import {openRequiresAction} from './helpers/requiresAction';
import {pickOutcome} from './support/outcome';
import {waitForTransitions} from './support/transitions';

// Spec 100 block 2: the «Requiere acción» strip of a business. The data is real (created through the app API); only the clock is
// faked by ageing `last_interaction_at` with SQL on the disposable database: a WhatsApp open past the 5-minute script wait (counted)
// and one past 72 h (expired). The outcome cutoff is moved back if it is newer than the aged opens, and restored afterwards.
let sql:ReturnType<typeof postgres>;let outcomeSince:string|undefined;
test.beforeAll(async()=>{sql=postgres(process.env.DATABASE_URL!,{max:1,...(process.env.CRM_TEST_DATABASE==='1'&&process.env.CRM_TEST_DATABASE_SOCKET?{path:process.env.CRM_TEST_DATABASE_SOCKET}:{})});outcomeSince=(await sql<{value:string}[]>`SELECT value FROM app_settings WHERE key='crm_contact_outcome_since'`)[0]?.value;});
test.afterAll(async()=>{if(!sql)return;try{if(outcomeSince!==undefined)await sql`UPDATE app_settings SET value=${outcomeSince} WHERE key='crm_contact_outcome_since'`;}finally{await sql.end();}});
const age=async(id:string,interval:string)=>{
 await sql`UPDATE app_settings SET value=to_char((now()-interval '30 days') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE key='crm_contact_outcome_since' AND value::timestamptz>now()-interval '10 days'`;
 await sql`UPDATE crm_messages SET last_interaction_at=now()-${interval}::interval WHERE id=${id}::uuid AND status='whatsapp_opened'`;
};
async function login(page:Page){
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));await simulateUserscript(page,{user:'admin@example.com'});
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 // The session cookie is Secure, so page.request would drop it over http: call the API from the page itself.
 return async(endpoint:string,body?:unknown)=>{const result=await page.evaluate(async({endpoint,body})=>{const r=await fetch('/_api/'+endpoint,body?{method:'POST',headers:{'Content-Type':'application/json'},body}:{});return {status:r.status,text:await r.text()}},{endpoint,body:body?superjson.stringify(body):undefined});expect(result.status,result.text).toBe(200);return superjson.parse<any>(result.text)};
}

test('collapsed strip, expanded blocks, one outcome per management, answerable «Vencidos» and the strip number matching the API follow-up counts',async({page})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1280,height:900});
 const api=await login(page),stamp=Date.now();
 const accountId=String((await api('commercial',{action:'account_save',nombre:'Zz Tira pendientes '+stamp,telefono:'5493442000088',assignedUserEmail:'admin@example.com'})).id);
 await api('commercial',{action:'business_status',accountId,status:'reviewed',recontactAt:null});
 const planA='Plan A '+stamp,planB='Plan B '+stamp;
 const leadA=String((await api('commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:planA,estado:'Cargado'})).id);
 const leadB=String((await api('commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:planB,estado:'Cargado'})).id);
 // Three confirmed calls without outcome: two in Plan A (one group) and one in Plan B.
 const call=(leadId:string,recipientName:string)=>api('communication',{action:'manual_start',id:randomUUID(),accountId,leadId,contactId:null,channel:'call',purpose:null,otherPurpose:null,recipient:recipientName,recipientName,destination:null,body:'Llamada de la prueba de la tira',result:'manual_sent',templateId:null});
 await call(leadA,'Recepción A1');await call(leadA,'Recepción A2');await call(leadB,'Recepción B');
 // Two WhatsApp opens through the API (nothing reaches WhatsApp): one past the script wait, one expired.
 const open=async(leadId:string,body:string)=>{const m=await api('communication',{action:'prepare',id:randomUUID(),leadId,contactId:null,channel:'whatsapp',templateId:null});const edited=await api('communication',{action:'edit',id:m.id,revision:m.revision,subject:'',body});await api('communication',{action:'dispatch',id:m.id,revision:edited.revision,confirm:true});return String(m.id);};
 const counted=await open(leadA,'Hola, te escribo desde Hospeda.'),expired=await open(leadB,'Mensaje viejo sin confirmar.');
 await age(counted,'6 minutes');await age(expired,'4 days');

 // The server lists, the same for the business «Comunicación» and the work detail: 1 unconfirmed + 2 management groups. The strip number
 // is checked against these API counts; Hoy's own tile and the toast still count sends until spec 100 block 4.
 const work=await api('work?mode=detail&accountId='+accountId+'&followUps=1'),comm=await api('communication?accountId='+accountId);
 for(const followUps of [work.followUps,comm.followUps]){expect([followUps.unconfirmed.count,followUps.outcomes.count,followUps.outcomes.groupCount,followUps.expired.unconfirmed.count]).toEqual([1,3,2,1]);}
 const n=work.followUps.unconfirmed.count+work.followUps.outcomes.groupCount;expect(n).toBe(3);

 // Collapsed on mount: one line «3 pendientes · Revisar» with the breakdown on a wide container; the conversation right below.
 await page.goto('/accounts/'+accountId+'?section=communication');
 const region=page.getByRole('region',{name:'Requiere acción',exact:true});
 await expect(region.getByText(n+' pendientes',{exact:true})).toBeVisible();
 await expect(region.getByText('1 envío sin confirmar · 2 gestiones sin resultado',{exact:true})).toBeVisible();
 await expect(region.getByRole('button',{name:'Revisar',exact:true})).toHaveAttribute('aria-expanded','false');
 await expect(region.getByRole('group',{name:/sin confirmar para/})).toHaveCount(0);
 expect((await region.boundingBox())!.height).toBeLessThanOrEqual(50);
 await expect(page.getByRole('region',{name:'Conversación',exact:true})).toBeInViewport();

 // Expanded: the blocks in order; «Vencidos» collapsed and uncounted.
 await openRequiresAction(page);
 await expect(region.getByRole('heading')).toHaveText(['Requiere acción · 3','¿Lo enviaste? · 1','Anotá cómo salió · 2']);
 await expect(region.getByRole('group',{name:/^WhatsApp sin confirmar para /})).toHaveCount(1);
 const outcomes=region.getByRole('region',{name:'Anotá cómo salió',exact:true});
 await expect(outcomes.getByRole('article')).toHaveCount(2);
 const rowA=outcomes.getByRole('article',{name:'Resultado pendiente de '+planA,exact:true});
 await expect(rowA).toContainText('2 envíos sin resultado');await expect(rowA).toContainText('Recepción A1');await expect(rowA).toContainText('Recepción A2');
 await expect(rowA.getByRole('button',{name:'Anotá cómo salió',exact:true})).toHaveCount(1);

 // «Vencidos» is answerable; expiring wrote nothing (the open is still unconfirmed in the database).
 expect((await sql<{status:string}[]>`SELECT status FROM crm_messages WHERE id=${expired}::uuid`)[0].status).toBe('whatsapp_opened');
 const expiredToggle=region.getByRole('button',{name:'Vencidos · 1',exact:true});await expect(expiredToggle).toHaveAttribute('aria-expanded','false');await expiredToggle.click();await waitForTransitions(page);
 const old=region.getByRole('region',{name:'Vencidos',exact:true}).getByRole('group',{name:/^WhatsApp sin confirmar para /});
 await old.getByRole('button',{name:'No se envió',exact:true}).click();
 await expect(region.getByRole('button',{name:/^Vencidos/})).toHaveCount(0);
 expect((await sql<{status:string}[]>`SELECT status FROM crm_messages WHERE id=${expired}::uuid`)[0].status).toBe('manual_not_done');
 await expect(region.getByRole('heading',{name:'Requiere acción · 3',exact:true})).toBeVisible();

 // One outcome for Plan A resolves both of its sends (D2): the dialog says so, and the server drops the whole group.
 await rowA.getByRole('button',{name:'Anotá cómo salió',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Anotar lo que pasó',exact:true});
 await expect(dialog.getByRole('note').filter({hasText:'Este resultado vale para los 2 envíos de esta gestión.'})).toBeVisible();
 await pickOutcome(dialog,'interested');await dialog.getByLabel('¿Cómo sigue?').selectOption('task');await dialog.getByRole('textbox',{name:'Qué hay que hacer',exact:true}).fill('Mandar propuesta '+stamp);await dialog.getByRole('button',{name:'Mañana',exact:true}).click();await dialog.getByRole('button',{name:'Guardar y programar',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(rowA).toHaveCount(0);await expect(region.getByRole('heading',{name:'Requiere acción · 2',exact:true})).toBeVisible();
 const after=(await api('work?mode=detail&accountId='+accountId+'&followUps=1')).followUps;
 expect([after.unconfirmed.count,after.outcomes.count,after.outcomes.groupCount]).toEqual([1,1,1]);

 // 390 px (D4): the same place, one line «2 pendientes» + «Revisar», without the breakdown and without horizontal scroll.
 await page.setViewportSize({width:390,height:844});await page.reload();
 await expect(region.getByText('2 pendientes',{exact:true})).toBeVisible();await expect(region.getByRole('button',{name:'Revisar',exact:true})).toBeVisible();
 await expect(region.getByText('1 envío sin confirmar · 1 gestión sin resultado',{exact:true})).toBeHidden();
 expect((await region.boundingBox())!.height).toBeLessThanOrEqual(50);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

 // `?pending=open` arrives expanded (block 4 links Hoy «Ver en el negocio» and the work editor toast to it).
 await page.setViewportSize({width:1280,height:900});await page.goto('/accounts/'+accountId+'?section=communication&pending=open');
 await expect(region.getByRole('heading',{name:'Requiere acción · 2',exact:true})).toBeVisible();await expect(region.getByRole('button',{name:'Ocultar',exact:true})).toBeVisible();
 await region.getByRole('button',{name:'Ocultar',exact:true}).click();await expect(region.getByRole('button',{name:'Revisar',exact:true})).toBeVisible();

 await api('commercial',{action:'account_trash',accountIds:[accountId],deleted:true,reason:'Limpieza de la prueba de la tira'});
 expect(errors).toEqual([]);
});

// Spec 100 block 3 (§8, §16): bulk «Sí, se enviaron» over 3 WhatsApp opens, one to a person with an active WhatsApp restriction.
test('bulk «Sí, se enviaron»: unchecked boxes, the confirmation lists 2 to mark and 1 blocked, per-item result, strip and API updated, nothing retried',async({page})=>{
 test.setTimeout(180000);const errors:string[]=[],outcomes:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/_api/communication')&&(r.postData()??'').includes('"outcome"'))outcomes.push(r.postData()!);});
 await page.setViewportSize({width:1280,height:900});
 const api=await login(page),stamp=Date.now();
 const accountId=String((await api('commercial',{action:'account_save',nombre:'Zz Masivo '+stamp,telefono:'5493442000077',assignedUserEmail:'admin@example.com'})).id);
 await api('commercial',{action:'business_status',accountId,status:'reviewed',recontactAt:null});
 const lead=String((await api('commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:'Plan masivo '+stamp,estado:'Cargado'})).id);
 const person=String((await api('commercial',{action:'contact_save',accountId,name:'Bloqueada '+stamp,phone:'5493442000066',isPrimary:false})).id);
 const open=async(contactId:string|null,body:string)=>{const m=await api('communication',{action:'prepare',id:randomUUID(),leadId:lead,contactId,channel:'whatsapp',templateId:null});const edited=await api('communication',{action:'edit',id:m.id,revision:m.revision,subject:'',body});await api('communication',{action:'dispatch',id:m.id,revision:edited.revision,confirm:true});return String(m.id);};
 const ids=[await open(null,'Primer mensaje.'),await open(null,'Segundo mensaje.'),await open(person,'Tercer mensaje.')];
 for(const id of ids)await age(id,'6 minutes');
 await api('communication',{action:'restrict',accountId,leadId:null,contactId:person,channel:'whatsapp',reason:'Pidió no recibir WhatsApp (prueba masiva)'});

 await page.goto('/accounts/'+accountId+'?section=communication');
 const region=await openRequiresAction(page),asking=region.getByRole('region',{name:'¿Lo enviaste?',exact:true});
 const boxes=asking.getByRole('checkbox',{name:/^Seleccionar WhatsApp para /});
 await expect(boxes).toHaveCount(3);for(const box of await boxes.all())await expect(box).not.toBeChecked();
 await expect(asking.getByRole('button',{name:/^Sí, se enviaron/})).toHaveCount(0);
 await asking.getByRole('button',{name:'Seleccionar todos (3)',exact:true}).click();
 await asking.getByRole('button',{name:'Sí, se enviaron (3)',exact:true}).click();

 const dialog=page.getByRole('dialog',{name:'¿Confirmás que enviaste estos 2 mensajes?',exact:true});
 await expect(dialog.getByRole('list',{name:'Se van a marcar',exact:true}).getByRole('listitem')).toHaveCount(2);
 const blocked=dialog.getByRole('list',{name:'No se van a marcar',exact:true}).getByRole('listitem');
 await expect(blocked).toHaveCount(1);await expect(blocked).toContainText('Hay una restricción de contacto activa para este canal');
 await expect(dialog).toContainText('Marcar como enviado es tu confirmación: queda registrado como contacto.');
 await dialog.getByRole('button',{name:'Sí, marcar 2',exact:true}).click();

 // After the run the same dialog switches to the fixed title «Resultado» (the question no longer applies).
 const done=page.getByRole('dialog',{name:'Resultado',exact:true}),result=done.getByRole('list',{name:'Resultado',exact:true}).getByRole('listitem');
 await expect(result).toHaveCount(3);
 await expect(result.filter({hasText:'Marcado como enviado'})).toHaveCount(2);await expect(result.filter({hasText:'Hay una restricción de contacto activa'})).toHaveCount(1);
 await expect(page.getByText('2 de 3 marcados. 1 no se pudo marcar.',{exact:true})).toBeVisible();
 await expect(done.getByRole('button',{name:/^Reintentar los que fallaron/})).toHaveCount(0);// a blocked item is not a failed call
 await done.getByRole('button',{name:'Listo',exact:true}).click();// «Listo», not the dialog X «Cerrar»await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(outcomes).toHaveLength(2);// one call per markable open, none for the blocked one, nothing retried

 // The server state: two confirmed, the restricted one still unconfirmed; the strip reloaded to match the API counts.
 const statuses=await sql<{id:string;status:string}[]>`SELECT id::text,status FROM crm_messages WHERE id=ANY(${ids}::uuid[])`;
 expect(ids.map(id=>statuses.find(s=>s.id===id)?.status)).toEqual(['manual_sent','manual_sent','whatsapp_opened']);
 const after=(await api('work?mode=detail&accountId='+accountId+'&followUps=1')).followUps;
 await expect(asking.getByRole('group',{name:/^WhatsApp sin confirmar para /})).toHaveCount(1);
 await expect(region.getByRole('heading',{name:'Requiere acción · '+(after.unconfirmed.count+after.outcomes.groupCount),exact:true})).toBeVisible();
 expect(after.outcomes.groupCount).toBe(1);// both confirmed sends now ask «Anotá cómo salió» once, in their management

 await api('commercial',{action:'account_trash',accountIds:[accountId],deleted:true,reason:'Limpieza de la prueba masiva'});
 expect(errors).toEqual([]);
});
