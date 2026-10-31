import {test,expect,type Locator,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import superjson from 'superjson';
import {simulateUserscript} from './helpers/userscript';
import {openRequiresAction} from './helpers/requiresAction';
import {USERSCRIPT_MISSING_REASON,userscriptOutdatedReason} from '../../src/helpers/userscriptGate';
import {USERSCRIPT_VERSION} from '../../userscript/src/version';

// Spec 96 §2: from the business «Comunicación» tab, WhatsApp is three clicks away (channel → template → final button) and the user script
// gate keeps desktop WhatsApp/Instagram off until a connected, current script is announced. window.open is captured: nothing reaches WhatsApp.
// The template is created with SQL on the disposable database and deactivated afterwards, so other suites never list it.
let sql:ReturnType<typeof postgres>;const templateName='Tres clics e2e '+randomUUID().slice(0,8);
test.beforeAll(async()=>{
 sql=postgres(process.env.DATABASE_URL!,{max:1,...(process.env.CRM_TEST_DATABASE==='1'&&process.env.CRM_TEST_DATABASE_SOCKET?{path:process.env.CRM_TEST_DATABASE_SOCKET}:{})});
 await sql`INSERT INTO message_templates(name,channel,body) VALUES(${templateName},'whatsapp','<p>Hola {{name}}, te escribo desde Hospeda.</p>')`;
});
test.afterAll(async()=>{if(!sql)return;try{await sql`UPDATE message_templates SET active=false WHERE name=${templateName}`;}finally{await sql.end();}});

async function login(page:Page){
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 return async function api(endpoint:string,body?:unknown){const result=await page.evaluate(async({endpoint,body})=>{const r=await fetch('/_api/'+endpoint,body?{method:'POST',headers:{'Content-Type':'application/json'},body}:{});return {status:r.status,text:await r.text()}},{endpoint,body:body?superjson.stringify(body):undefined});expect(result.status,result.text).toBe(200);return superjson.parse<any>(result.text);};
}

test('WhatsApp from the business action bar reaches the dispatch in exactly three clicks',async({page})=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1280,height:900});
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));await simulateUserscript(page,{user:'admin@example.com'});
 const api=await login(page);const run=Date.now().toString(36);
 const accountId=(await api('commercial',{action:'account_save',nombre:'Zz Tres clics '+run,telefono:'+5493442000501',email:'tres-clics@example.com',assignedUserEmail:'admin@example.com'})).id;
 await api('commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:'Presentación tres clics '+run,estado:'Cargado'});
 await page.goto('/accounts/'+accountId+'?tab=comunicacion');
 const bar=page.getByRole('group',{name:'Acciones de comunicación',exact:true});await expect(bar.getByRole('button',{name:'WhatsApp',exact:true})).toBeEnabled();
 await page.evaluate(()=>{window.open=()=>{const popup={closed:false,opener:null,location:{href:'about:blank'}} as unknown as Window;(window as unknown as {crmWhatsAppPopup:Window}).crmWhatsAppPopup=popup;return popup}});
 const posts:any[]=[];page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/_api/communication')posts.push(superjson.parse<any>(request.postData()!));});
 let clicks=0;const click=async(target:Locator)=>{clicks++;await target.click();};
 // 1. The channel, preset from the bar: the step opens with the only open management and the business phone, no channel choice.
 await click(bar.getByRole('button',{name:'WhatsApp',exact:true}));
 const dialog=page.getByRole('dialog',{name:'Preparar WhatsApp',exact:true});await expect(dialog.getByRole('group',{name:'Canal',exact:true})).toHaveCount(0);
 await expect(dialog.getByRole('region',{name:'Destino del mensaje',exact:true})).toContainText('+5493442000501');
 // 2. The template: the draft is prepared with its final text, so the composer opens on the final view.
 await click(dialog.getByRole('button',{name:new RegExp(templateName)}));
 await expect(dialog.getByRole('heading',{name:'Revisá el contenido final'})).toBeVisible();await expect(dialog).toContainText('te escribo desde Hospeda.');
 await expect(dialog.getByRole('checkbox')).toHaveCount(0);
 // 3. The final button names the destination and opens WhatsApp.
 const finalButton=dialog.getByRole('button',{name:/^Abrir WhatsApp con (.+ · )?\+54 9 3442000501$/});await expect(finalButton).toBeEnabled();
 const dispatched=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/_api/communication'&&superjson.parse<any>(request.postData()!).action==='dispatch');
 await click(finalButton);
 const dispatch=superjson.parse<any>((await dispatched).postData()!);
 expect(clicks).toBe(3);
 // Only the message flow counts (the tab may record reads): one prepare and one dispatch, no edit in between.
 expect(posts.map(p=>p.action).filter(action=>['prepare','prepare_general','edit','dispatch'].includes(action))).toEqual(['prepare','dispatch']);
 const prepared=posts.find(p=>p.action==='prepare');
 expect(prepared).toMatchObject({action:'prepare',channel:'whatsapp',contactId:null});
 expect(dispatch).toMatchObject({action:'dispatch',id:prepared.id,confirm:true});
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {crmWhatsAppPopup:Window}).crmWhatsAppPopup.location.href)).toMatch(/^https:\/\/wa\.me\//);
 const intent=new URL(await page.evaluate(()=>(window as unknown as {crmWhatsAppPopup:Window}).crmWhatsAppPopup.location.href));
 expect(intent.pathname).toBe('/5493442000501');expect(intent.searchParams.get('text')).toContain('te escribo desde Hospeda.');
 // Spec 96 §2.6: the composer closes with a toast; the attempt stays unconfirmed (it waits in «Requiere acción»).
 await expect(dialog).toHaveCount(0);
 await expect(page.locator('[data-sonner-toast]').filter({hasText:/WhatsApp abierto para (.+ · )?\+54 9 3442000501\. Si el script registra el envío, se confirma solo; si no, lo vas a ver en «Requiere acción»\./})).toBeVisible();
 const message=(await api('communication?accountId='+accountId)).messages.find((m:any)=>m.id===prepared.id);
 expect([message.channel,message.recipient,message.status]).toEqual(['whatsapp','+5493442000501','whatsapp_opened']);
 await expect((await openRequiresAction(page)).getByRole('group',{name:/^WhatsApp sin confirmar para /})).toBeVisible();
 expect(errors).toEqual([]);
});

for(const scenario of [{name:'an outdated script',version:'1.4.0',reason:userscriptOutdatedReason({installed:'1.4.0',latest:USERSCRIPT_VERSION})},{name:'no script',version:null,reason:USERSCRIPT_MISSING_REASON}])test(`desktop WhatsApp and Instagram are gated with ${scenario.name}; Email is not`,async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1280,height:900});
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 if(scenario.version)await simulateUserscript(page,{version:scenario.version,user:'admin@example.com'});
 const api=await login(page);const run=Date.now().toString(36);
 // Every channel has its data, so the gate is the only reason left for WhatsApp and Instagram.
 const accountId=(await api('commercial',{action:'account_save',nombre:'Zz Script requerido '+run,telefono:'+5493442000502',email:'script-requerido@example.com',perfilInstagram:'https://www.instagram.com/zz_gate_'+run+'/',assignedUserEmail:'admin@example.com'})).id;
 await page.goto('/accounts/'+accountId+'?tab=comunicacion');
 const bar=page.getByRole('group',{name:'Acciones de comunicación',exact:true});
 const gate=page.locator('[data-userscript-gate="blocked"]');await expect(gate).toContainText(scenario.reason);
 await expect(bar.getByRole('button',{name:'WhatsApp',exact:true})).toBeDisabled();await expect(bar.getByRole('button',{name:'Instagram',exact:true})).toBeDisabled();
 await expect(bar.getByRole('button',{name:'Email',exact:true})).toBeEnabled();
 await gate.getByRole('link',{name:'Ir a User script',exact:true}).click();await expect(page).toHaveURL(/\/userscript$/);
 expect(errors).toEqual([]);
});
