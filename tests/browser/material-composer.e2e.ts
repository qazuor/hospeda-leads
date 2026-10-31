import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import superjson from 'superjson';
import postgres from 'postgres';
import {simulateUserscript} from './helpers/userscript';
import {openRequiresAction} from './helpers/requiresAction';
import {reveal} from './support/contactStep';
import {waitForTransitions} from './support/transitions';

// Spec 89 F3: «Enviar material» from the business «Comunicación» tab opens the contact step with the material already added, the WhatsApp intent carries
// the link, the sent version is recorded and «Revocar enlace» turns the public page into 410. No real WhatsApp or email is ever sent: window.open is
// captured locally. The material is created with SQL on the disposable database (a file row: no R2 call is needed for this flow).
let sql:ReturnType<typeof postgres>;
test.beforeAll(()=>{sql=postgres(process.env.DATABASE_URL!,{max:1,...(process.env.CRM_TEST_DATABASE==='1'&&process.env.CRM_TEST_DATABASE_SOCKET?{path:process.env.CRM_TEST_DATABASE_SOCKET}:{})});});
test.afterAll(async()=>{await sql?.end();});

test('send sales material from the business, record it and revoke the link',async({page,request})=>{
 test.setTimeout(180000);
 const run=randomUUID().slice(0,8),title='Folleto e2e '+run,materialId=randomUUID();
 await sql`INSERT INTO crm_sales_materials(id,title,description,kind,source,created_by_email) VALUES(${materialId},${title},'Tarifas y fotos','deliverable','file','admin@example.com')`;
 await sql`INSERT INTO crm_sales_material_versions(id,material_id,version,object_key,file_name,mime_type,byte_size,actor_email) VALUES(${randomUUID()},${materialId},1,${`materials/${materialId}/v1-${run}.pdf`},'folleto.pdf','application/pdf',2048,'admin@example.com')`;
 await sql`UPDATE crm_sales_materials SET current_version=1 WHERE id=${materialId}`;
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));await simulateUserscript(page,{user:'admin@example.com'});
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 async function api(endpoint:string,body?:unknown){const result=await page.evaluate(async({endpoint,body})=>{const r=await fetch('/_api/'+endpoint,body?{method:'POST',headers:{'Content-Type':'application/json'},body}:{});return {status:r.status,text:await r.text()}},{endpoint,body:body?superjson.stringify(body):undefined});expect(result.status,result.text).toBe(200);return superjson.parse<any>(result.text);}
 const accountId=(await api('commercial',{action:'account_save',nombre:'Zz Material e2e '+run,telefono:'+5493442000301',assignedUserEmail:'admin@example.com'})).id;
 await api('commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:'Presentación material '+run,estado:'Cargado'});
 await page.goto('/accounts/'+accountId+'?section=comunicacion');
 await page.getByRole('tab',{name:'Comunicación',exact:true}).click();
 // Spec 91 §13: the open tab is in ?tab= and survives a reload.
 await page.getByRole('tab',{name:'Historial',exact:true}).click();await page.getByRole('tab',{name:'Comunicación',exact:true}).click();
 await expect(page).toHaveURL(new RegExp('/accounts/'+accountId+'\\?tab=comunicacion$'));
 await page.reload();
 await expect(page.getByRole('tab',{name:'Comunicación',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('region',{name:'Conversación',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Enviar material',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'Enviar material'});
 await dialog.getByLabel('Buscar material').fill(run);
 const row=dialog.getByRole('list',{name:'Material entregable'}).getByRole('listitem').filter({hasText:title});
 await row.getByRole('button',{name:'Agregar',exact:true}).click();
 // Spec 96 §2.3: one contact step. Spec 98 decision 2: the material travels by WhatsApp, Email or Instagram (as a link).
 dialog=page.getByRole('dialog',{name:/^Preparar /});
 // Owner review of spec 96: the floating panel scrolls its own body. A wrapper without flex limits let the body grow past the panel, so the
 // wheel scrolled nothing and the templates and the final button stayed out of reach (Playwright clicks still worked, scrolling by script).
 expect(await dialog.evaluate(panel=>{const body=panel.querySelector('[class*=scrollBody]');return !!body&&body.getBoundingClientRect().bottom<=panel.getBoundingClientRect().bottom+1;}),'The composer body stays inside the panel').toBe(true);
 await page.evaluate(()=>{window.open=()=>{const popup={closed:false,opener:null,location:{href:'about:blank'}} as unknown as Window;(window as unknown as {crmWhatsAppPopup:Window}).crmWhatsAppPopup=popup;return popup}});
 // Owner review of spec 96: «Enviar material» skips the template list and opens a free draft with the material, on WhatsApp because the business
 // has a phone; the model is a selector above it. The pre-draft «Material a enviar» notice and the channel controls show only without a draft.
 const composer=page.getByRole('dialog',{name:'Preparar WhatsApp'});
 await expect(composer.getByLabel('Mensaje modelo',{exact:true})).toHaveValue('');
 await expect(composer.getByRole('heading',{name:'Elegí un mensaje modelo'})).toHaveCount(0);
 const included=composer.getByRole('list',{name:'Material incluido'});
 await expect(included.getByText(title,{exact:true})).toBeVisible();
 // Back in the contact step the material is announced; spec 98 decision 2 offers Instagram too, and WhatsApp stays selected.
 await composer.getByRole('button',{name:'Cambiar destinatario o modelo',exact:true}).click();
 await expect(composer.getByRole('status').filter({hasText:'Material a enviar'})).toContainText(title);
 const channels=composer.getByRole('group',{name:'Canal',exact:true});await reveal(composer,channels);
 await expect(channels.getByRole('button',{name:'Instagram',exact:true})).toHaveCount(1);await expect(channels.getByRole('button',{name:'WhatsApp',exact:true})).toHaveAttribute('aria-pressed','true');
 // Preparing again never stacks a second message: the earlier draft is offered and kept.
 await composer.getByRole('button',{name:'Escribir un mensaje nuevo',exact:true}).click();
 await composer.getByRole('group',{name:'Borrador anterior'}).getByRole('button',{name:'Seguir con ese borrador',exact:true}).click();
 await expect(included.getByText(title,{exact:true})).toBeVisible();
 await expect(composer.getByText(new RegExp(`Podés ver «${title}» en: http.*/m/[A-Za-z0-9_-]{43}`))).toBeVisible();
 await composer.getByRole('button',{name:'Guardar cambios',exact:true}).click();
 await expect(composer.getByRole('heading',{name:'Revisá el contenido final'})).toBeVisible();
 await expect(composer.getByRole('heading',{name:'Material de venta'})).toBeVisible();
 // Spec 96 §2.5–2.6: the final button names the destination; from the business the composer closes with a toast once WhatsApp opened.
 await composer.getByRole('button',{name:/^Abrir WhatsApp con (.+ · )?\+54 9 3442000301$/}).click();
 await expect(page.locator('[data-sonner-toast]').filter({hasText:/^WhatsApp abierto para .*\+54 9 3442000301/})).toBeVisible();
 await expect(composer).toHaveCount(0);
 const intent=new URL(await page.evaluate(()=>(window as unknown as {crmWhatsAppPopup:Window}).crmWhatsAppPopup.location.href));
 const token=/\/m\/([A-Za-z0-9_-]{43})/.exec(intent.searchParams.get('text')??'')?.[1];expect(token,'The WhatsApp text carries the link').toBeTruthy();
 const message=(await api('communication?accountId='+accountId)).messages.find((m:any)=>m.channel==='whatsapp'&&m.status==='whatsapp_opened');
 expect(message.materials.map((m:any)=>[m.materialId,m.sentVersion,m.revokedAt])).toEqual([[materialId,1,null]]);
 // The record in «Comunicación»: revoke with a reason; the public link answers 410 from then on.
 await page.goto('/accounts/'+accountId+'?section=comunicacion');await page.getByRole('tab',{name:'Comunicación',exact:true}).click();
 // Spec 92: an unconfirmed WhatsApp is not in «Conversación»; its «Requiere acción» entry carries the material record.
 // Opening WhatsApp is not evidence of sending: the record never says «Versión enviada» for it.
 // Spec 100 §5: the strip starts collapsed, and the record sits behind «Ver mensaje y material» in the compact entry.
 const entry=(await openRequiresAction(page)).getByRole('group',{name:/^WhatsApp sin confirmar para /});
 // The panel clips its content while it grows: clicking «Revocar enlace» mid-animation slides it under the pointer and the click is lost.
 await entry.getByRole('button',{name:'Ver mensaje y material',exact:true}).click();await waitForTransitions(page);
 await expect(entry.getByText(/Versión incluida en el mensaje: 1 · WhatsApp/)).toBeVisible();await expect(entry.getByText(/Envío no confirmado/)).toBeVisible();await expect(page.getByText(/Versión enviada/)).toHaveCount(0);
 await expect(page.getByTestId('conversation-body').getByText(title,{exact:true})).toHaveCount(0);
 expect((await request.get('/m/'+token,{headers:{'user-agent':'WhatsApp/2.23.20.0'}})).status()).toBe(200);
 await entry.getByRole('button',{name:'Revocar enlace',exact:true}).click();
 const revoke=page.getByRole('dialog',{name:'Revocar enlace'});await revoke.getByLabel('Motivo').fill('Prueba e2e de revocación');await revoke.getByRole('button',{name:'Revocar enlace',exact:true}).click();
 await expect(page.getByText('Enlace revocado',{exact:true})).toBeVisible();
 expect((await request.get('/m/'+token,{headers:{'user-agent':'WhatsApp/2.23.20.0'}})).status()).toBe(410);
 expect(errors).toEqual([]);
});
