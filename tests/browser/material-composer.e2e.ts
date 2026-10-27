import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import superjson from 'superjson';
import postgres from 'postgres';

// Spec 89 F3: «Enviar material» from the business «Comunicación» tab opens «Contactar» with the material already added, the WhatsApp intent carries
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
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 async function api(endpoint:string,body?:unknown){const result=await page.evaluate(async({endpoint,body})=>{const r=await fetch('/_api/'+endpoint,body?{method:'POST',headers:{'Content-Type':'application/json'},body}:{});return {status:r.status,text:await r.text()}},{endpoint,body:body?superjson.stringify(body):undefined});expect(result.status,result.text).toBe(200);return superjson.parse<any>(result.text);}
 const accountId=(await api('commercial',{action:'account_save',nombre:'Material e2e '+run,telefono:'+5493442000301',assignedUserEmail:'admin@example.com'})).id;
 await api('commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:'Presentación material '+run,estado:'Cargado'});
 await page.goto('/accounts/'+accountId+'?section=comunicacion');
 await page.getByRole('tab',{name:'Comunicación',exact:true}).click();
 await page.getByRole('button',{name:'Enviar material',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'Enviar material'});
 await dialog.getByLabel('Buscar material').fill(run);
 const row=dialog.getByRole('list',{name:'Material entregable'}).getByRole('listitem').filter({hasText:title});
 await row.getByRole('button',{name:'Agregar',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Contactar'});
 await expect(dialog.getByRole('status').filter({hasText:'Material a enviar'})).toContainText(title);
 await dialog.getByRole('combobox',{name:'Canal',exact:true}).selectOption('whatsapp');
 await dialog.getByRole('button',{name:'Continuar con el mensaje',exact:true}).click();
 await page.evaluate(()=>{window.open=()=>{const popup={closed:false,opener:null,location:{href:'about:blank'}} as unknown as Window;(window as unknown as {crmWhatsAppPopup:Window}).crmWhatsAppPopup=popup;return popup}});
 const composer=page.getByRole('dialog',{name:'Preparar WhatsApp'});
 await composer.getByRole('button',{name:'Escribir un mensaje nuevo',exact:true}).click();
 const included=composer.getByRole('list',{name:'Material incluido'});
 await expect(included.getByText(title,{exact:true})).toBeVisible();
 await expect(composer.getByText(new RegExp(`${title}: http.*/m/[A-Za-z0-9_-]{43}`))).toBeVisible();
 await composer.getByRole('button',{name:'Guardar y ver contenido final'}).click();
 await expect(composer.getByRole('heading',{name:'Material de venta'})).toBeVisible();
 await composer.getByLabel('Revisé destinatario y contenido final').check();
 await composer.getByRole('button',{name:'Abrir WhatsApp con este mensaje'}).click();
 await expect(composer.getByRole('button',{name:'Sí, se envió',exact:true}).or(composer.getByText('WhatsApp abierto · envío no confirmado'))).toBeVisible();
 const intent=new URL(await page.evaluate(()=>(window as unknown as {crmWhatsAppPopup:Window}).crmWhatsAppPopup.location.href));
 const token=/\/m\/([A-Za-z0-9_-]{43})/.exec(intent.searchParams.get('text')??'')?.[1];expect(token,'The WhatsApp text carries the link').toBeTruthy();
 const message=(await api('communication?accountId='+accountId)).messages.find((m:any)=>m.channel==='whatsapp'&&m.status==='whatsapp_opened');
 expect(message.materials.map((m:any)=>[m.materialId,m.sentVersion,m.revokedAt])).toEqual([[materialId,1,null]]);
 // The record in «Comunicación»: revoke with a reason; the public link answers 410 from then on.
 await page.goto('/accounts/'+accountId+'?section=comunicacion');await page.getByRole('tab',{name:'Comunicación',exact:true}).click();
 // Spec 90: the sent message is a bubble in «Conversación» with its material record right under it.
 // Opening WhatsApp is not evidence of sending: the record never says «Versión enviada» for it.
 await expect(page.getByText(/Versión incluida en el mensaje: 1 · WhatsApp/)).toBeVisible();await expect(page.getByText(/Envío no confirmado/)).toBeVisible();await expect(page.getByText(/Versión enviada/)).toHaveCount(0);
 expect((await request.get('/m/'+token,{headers:{'user-agent':'WhatsApp/2.23.20.0'}})).status()).toBe(200);
 await page.getByRole('button',{name:'Revocar enlace',exact:true}).click();
 const revoke=page.getByRole('dialog',{name:'Revocar enlace'});await revoke.getByLabel('Motivo').fill('Prueba e2e de revocación');await revoke.getByRole('button',{name:'Revocar enlace',exact:true}).click();
 await expect(page.getByText('Enlace revocado',{exact:true})).toBeVisible();
 expect((await request.get('/m/'+token,{headers:{'user-agent':'WhatsApp/2.23.20.0'}})).status()).toBe(410);
 expect(errors).toEqual([]);
});
