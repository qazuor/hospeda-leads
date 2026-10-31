import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import superjson from 'superjson';
import {simulateUserscript} from './helpers/userscript';
import {openRequiresAction} from './helpers/requiresAction';
import {pickOutcome} from './support/outcome';

// Spec 100 blocks 2 and 4: the «Requiere acción» strip of a business and Hoy «Pendientes de contacto» with the same number. The data is real (created through the app API); only the clock is
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

test('collapsed strip, expanded blocks, one outcome per management, answerable «Vencidos», and Hoy counting the same as the strip',async({page})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1280,height:900});
 const api=await login(page),stamp=Date.now();
 const accountId=String((await api('commercial',{action:'account_save',nombre:'Zz Tira pendientes '+stamp,telefono:'5493442000088',assignedUserEmail:'admin@example.com'})).id);
 await api('commercial',{action:'business_status',accountId,status:'reviewed',recontactAt:null});
 const planA='Plan A '+stamp,planB='Plan B '+stamp;
 const leadA=String((await api('commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:planA,estado:'Cargado'})).id);
 const leadB=String((await api('commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:planB,estado:'Cargado'})).id);
 // Three confirmed calls without outcome: two in Plan A (one group) and one in Plan B.
 const call=(leadId:string,recipientName:string)=>api('communication',{action:'manual_start',id:randomUUID(),accountId,leadId,contactId:null,channel:'call',purpose:'first_contact',otherPurpose:null,recipient:recipientName,recipientName,destination:null,body:'Llamada de la prueba de la tira',result:'manual_sent',templateId:null});
 await call(leadA,'Recepción A1');await call(leadA,'Recepción A2');await call(leadB,'Recepción B');
 // Two WhatsApp opens through the API (nothing reaches WhatsApp): one past the script wait, one expired.
 const open=async(leadId:string,body:string)=>{const m=await api('communication',{action:'prepare',id:randomUUID(),leadId,contactId:null,channel:'whatsapp',templateId:null});const edited=await api('communication',{action:'edit',id:m.id,revision:m.revision,subject:'',body});await api('communication',{action:'dispatch',id:m.id,revision:edited.revision,confirm:true});return String(m.id);};
 const counted=await open(leadA,'Hola, te escribo desde Hospeda.'),expired=await open(leadB,'Mensaje viejo sin confirmar.');
 await age(counted,'6 minutes');await age(expired,'4 days');

 // The server lists, the same for the business «Comunicación», Hoy filtered by the business and the work detail the toast reads:
 // 1 unconfirmed + 2 management groups. Hoy, the toast and the strip all count unconfirmed + groups (the strip adds «Por revisar», none here).
 const work=await api('work?mode=detail&accountId='+accountId+'&followUps=1'),comm=await api('communication?accountId='+accountId),day=await api('work?mode=day&accountId='+accountId);
 for(const followUps of [work.followUps,comm.followUps,day.followUps]){expect([followUps.unconfirmed.count,followUps.outcomes.count,followUps.outcomes.groupCount,followUps.expired.unconfirmed.count]).toEqual([1,3,2,1]);}
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
 const expiredToggle=region.getByRole('button',{name:'Vencidos · 1',exact:true});await expect(expiredToggle).toHaveAttribute('aria-expanded','false');await expiredToggle.click();
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

 // `?pending=open` arrives expanded (Hoy «Ver en el negocio» and the work editor toast link to it).
 await page.setViewportSize({width:1280,height:900});await page.goto('/accounts/'+accountId+'?section=communication&pending=open');
 await expect(region.getByRole('heading',{name:'Requiere acción · 2',exact:true})).toBeVisible();await expect(region.getByRole('button',{name:'Ocultar',exact:true})).toBeVisible();
 await region.getByRole('button',{name:'Ocultar',exact:true}).click();await expect(region.getByRole('button',{name:'Revisar',exact:true})).toBeVisible();

 // Hoy (spec 100 block 4): the business follow-ups count 2 there too (Hoy lists every business of the seller, so the number is checked
 // filtered by this business through the API); its Plan B row is a management group whose «Ver en el negocio» opens the strip expanded.
 const dayAfter=(await api('work?mode=day&accountId='+accountId)).followUps;expect(dayAfter.unconfirmed.count+dayAfter.outcomes.groupCount).toBe(2);
 await page.goto('/my-day');
 const card=page.getByRole('region',{name:'Pendientes de contacto',exact:true});
 const rowB=card.getByRole('region',{name:'Anotá cómo salió',exact:true}).getByRole('article',{name:'Resultado pendiente de '+planB,exact:true});
 await expect(rowB).toContainText('Zz Tira pendientes '+stamp);await expect(rowB).toContainText('1 envío sin resultado');
 const link=rowB.getByRole('link',{name:'Ver en el negocio',exact:true});await expect(link).toHaveAttribute('href','/accounts/'+accountId+'?section=communication&pending=open');
 await link.click();await expect(page).toHaveURL(/pending=open/);
 await expect(region.getByRole('heading',{name:'Requiere acción · 2',exact:true})).toBeVisible();

 await api('commercial',{action:'account_trash',accountIds:[accountId],deleted:true,reason:'Limpieza de la prueba de la tira'});
 expect(errors).toEqual([]);
});
