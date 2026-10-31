import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import superjson from 'superjson';
import postgres from 'postgres';

// Spec 89 F4: an admin inserts a sales material into a WhatsApp template from «Insertar material de venta» (chip with the title, stored as
// {{material:<uuid>}}), `prepare` turns it into a fresh /m/<token> link per message, and after the material is archived the template shows
// «Material no disponible» and `prepare` leaves it out with a reason. Nothing is sent. The material is created with SQL (no R2 call is needed).
let sql:ReturnType<typeof postgres>;
test.beforeAll(()=>{sql=postgres(process.env.DATABASE_URL!,{max:1,...(process.env.CRM_TEST_DATABASE==='1'&&process.env.CRM_TEST_DATABASE_SOCKET?{path:process.env.CRM_TEST_DATABASE_SOCKET}:{})});});
test.afterAll(async()=>{await sql?.end();});

test('insert sales material in a template and resolve it into a link per message',async({page})=>{
 test.setTimeout(180000);
 const run=randomUUID().slice(0,8),title='Folleto modelo e2e '+run,materialId=randomUUID(),templateName='Zz modelo con material '+run;
 await sql`INSERT INTO crm_sales_materials(id,title,description,kind,source,created_by_email) VALUES(${materialId},${title},'Tarifas','deliverable','file','admin@example.com')`;
 await sql`INSERT INTO crm_sales_material_versions(id,material_id,version,object_key,file_name,mime_type,byte_size,actor_email) VALUES(${randomUUID()},${materialId},1,${`materials/${materialId}/v1-${run}.pdf`},'folleto.pdf','application/pdf',2048,'admin@example.com')`;
 await sql`UPDATE crm_sales_materials SET current_version=1 WHERE id=${materialId}`;
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 async function api(endpoint:string,body?:unknown){const result=await page.evaluate(async({endpoint,body})=>{const r=await fetch('/_api/'+endpoint,body?{method:'POST',headers:{'Content-Type':'application/json'},body}:{});return {status:r.status,text:await r.text()}},{endpoint,body:body?superjson.stringify(body):undefined});expect(result.status,result.text).toBe(200);return superjson.parse<any>(result.text);}

 // The editor: optional insertion through the same picker as the composer, shown as a chip with the title and labelled in the preview.
 await page.goto('/settings?section=templates');
 await page.getByLabel('Nombre del modelo').fill(templateName);
 const editor=page.getByRole('textbox',{name:'Contenido del modelo'});
 await editor.click();await page.keyboard.type('Te paso el folleto: ');
 await page.getByRole('button',{name:'Insertar material de venta',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'Insertar material de venta'});
 await picker.getByLabel('Buscar material').fill(run);
 await picker.getByRole('list',{name:'Material entregable'}).getByRole('listitem').filter({hasText:title}).getByRole('button',{name:'Agregar',exact:true}).click();
 await expect(picker).toBeHidden();
 await expect(editor).toContainText(`[Material: ${title}]`);await expect(editor).not.toContainText(materialId);
 await expect(page.getByRole('complementary',{name:'Vista previa del modelo'})).toContainText(`[Material: ${title}]`);
 await page.getByRole('button',{name:'Crear modelo',exact:true}).click();
 await expect.poll(async()=>(await api('settings')).templates.some((t:any)=>t.name===templateName)).toBe(true);
 const template=(await api('settings')).templates.find((t:any)=>t.name===templateName);
 expect(template.body).toContain(`{{material:${materialId}}}`);expect(template.materialRefs).toEqual([{materialId,title,problem:null}]);

 // prepare: one fresh link per message, accepted by the dispatch claim later.
 const accountId=(await api('commercial',{action:'account_save',nombre:'Zz Material modelo e2e '+run,telefono:'+5493442000311',assignedUserEmail:'admin@example.com'})).id;
 await api('commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:'Modelo con material '+run,estado:'Cargado'});
 const leadId=String((await sql`SELECT id FROM leads WHERE account_id=${accountId} ORDER BY id DESC LIMIT 1`)[0]!.id);
 const prepare=(variation:number)=>api('communication',{action:'prepare',id:randomUUID(),leadId,contactId:null,channel:'whatsapp',templateId:template.id,variation});
 const first=await prepare(1),second=await prepare(2);
 const token=(body:string)=>new RegExp(`${title}: http\\S*/m/([a-z0-9]+(?:-[a-z0-9]+)*-[A-Za-z0-9]{4})(?![A-Za-z0-9_-])`).exec(body)?.[1];
 expect(token(first.body)).toBeTruthy();expect(token(second.body)).toBeTruthy();expect(token(first.body)).not.toBe(token(second.body));
 expect(first.materialWarnings).toEqual([]);expect(first.materials.map((m:any)=>m.materialId)).toEqual([materialId]);

 // Archived: the template list and the editor warn, and prepare leaves the material out with a reason.
 await sql`UPDATE crm_sales_materials SET status='archived',archived_at=now() WHERE id=${materialId}`;
 const third=await prepare(3);
 expect(token(third.body)).toBeFalsy();expect(third.materialWarnings.map((w:any)=>w.message)).toEqual([`«${title}» ya no está disponible. No se agregó al mensaje.`]);
 await page.reload();
 await page.getByPlaceholder('Buscar modelo…').fill(templateName);
 const group=page.getByRole('button',{name:/^WhatsApp/});if(await group.getAttribute('aria-expanded')==='false')await group.click();
 const row=page.getByRole('button',{name:new RegExp(templateName)});
 await expect(row).toContainText('Material no disponible');
 await row.click();
 await expect(page.getByText(`Este modelo incluye «${title}», que ya no está disponible. No se va a enviar.`)).toBeVisible();
 await expect(editor).toContainText(`[Material: ${title}]`);
 expect(errors).toEqual([]);
});
