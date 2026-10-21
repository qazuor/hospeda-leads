import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {localDay} from '../../src/helpers/workDates';
test('reschedule warns about duplicates and cancellation needs a factual reason',async({page})=>{
 test.setTimeout(120000);await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 async function api(endpoint:string,body?:unknown){const r=await page.evaluate(async({endpoint,body})=>{const r=await fetch('/_api/'+endpoint,body?{method:'POST',headers:{'Content-Type':'application/json'},body}:{});return{status:r.status,text:await r.text()}},{endpoint,body:body?superjson.stringify(body):undefined});expect(r.status,r.text).toBe(200);return superjson.parse<any>(r.text)}
 const accountId=(await api('commercial',{action:'account_save',nombre:'Pendientes claros '+Date.now(),assignedUserEmail:'admin@example.com'})).id;
 const title='Revisar propuesta turística '+Date.now();
 const today=localDay(),tomorrow=localDay(new Date(Date.now()+86400000));
 const taskId=(await api('work',{action:'task_save',accountId,title,typeId:'followup',purpose:'commercial',dueDate:today})).id;
 const otherId=(await api('work',{action:'task_save',accountId,title:title.toUpperCase().replace('Í','I\u0301'),typeId:'followup',purpose:'commercial',dueDate:tomorrow})).id;
 const writes:any[]=[];await page.route('**/_api/work**',async route=>{if(route.request().method()==='POST')writes.push(superjson.parse(route.request().postData()!));await route.continue()});
 await page.goto('/my-day');let row=page.locator('article').filter({has:page.getByText(title,{exact:true})});await row.getByRole('button',{name:'Más acciones de '+title,exact:true}).click();await page.getByRole('menuitem',{name:'Cambiar fecha o datos',exact:true}).click();let dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('status').filter({hasText:'Vencimiento original:'})).toBeVisible();await expect(dialog.getByRole('heading',{name:'Cambiar fecha o datos',exact:true})).toBeVisible();await expect(dialog.getByLabel('Propósito')).toHaveCount(0);await dialog.getByLabel('Fecha de vencimiento').fill(tomorrow);await expect(dialog.getByRole('alert')).toContainText('Ya hay 1 pendiente');await expect(dialog.getByRole('alert')).toContainText('ninguna se reemplazará automáticamente');await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(page.locator('[data-sonner-toast]')).toHaveCount(0,{timeout:15000});await page.getByText(/^Próximas acciones/).click();await page.waitForFunction(()=>!document.getAnimations().some(a=>a instanceof CSSTransition&&a.playState==='running'));row=page.locator('article').filter({has:page.getByText(title,{exact:true})});await row.getByRole('button',{name:'Más acciones de '+title,exact:true}).click();await page.getByRole('menuitem',{name:'Ya no hace falta',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Motivo de cancelación',{exact:true}).fill('   ');await dialog.getByRole('button',{name:'Guardar',exact:true}).click();expect(writes).toHaveLength(1);await expect(dialog).toBeVisible();
 await dialog.getByLabel('Motivo de cancelación',{exact:true}).fill('La acción ya estaba planificada en otro pendiente');await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await expect(dialog).toHaveCount(0);const data=await api('work?mode=detail&accountId='+accountId);expect(data.tasks.find((t:any)=>t.id===taskId)).toMatchObject({status:'cancelled',dueDate:tomorrow,result:'La acción ya estaba planificada en otro pendiente'});expect(data.tasks.find((t:any)=>t.id===otherId).status).toBe('pending');expect(writes[1]).toMatchObject({action:'task_status',id:taskId,status:'cancelled',result:'La acción ya estaba planificada en otro pendiente'});
});

test('a task without purpose is postponed with a shortcut and no purpose question',async({page})=>{
 test.setTimeout(120000);await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 async function api(endpoint:string,body?:unknown){const r=await page.evaluate(async({endpoint,body})=>{const r=await fetch('/_api/'+endpoint,body?{method:'POST',headers:{'Content-Type':'application/json'},body}:{});return{status:r.status,text:await r.text()}},{endpoint,body:body?superjson.stringify(body):undefined});expect(r.status,r.text).toBe(200);return superjson.parse<any>(r.text)}
 const accountId=(await api('commercial',{action:'account_save',nombre:'Sin propósito '+Date.now(),assignedUserEmail:'admin@example.com'})).id;
 const title='Tarea sin propósito '+Date.now();
 const taskId=(await api('work',{action:'task_save',accountId,title,typeId:'followup',dueDate:localDay()})).id;
 const writes:any[]=[];await page.route('**/_api/work**',async route=>{if(route.request().method()==='POST')writes.push(superjson.parse(route.request().postData()!));await route.continue()});
 await page.goto('/my-day?accountId='+accountId+'&taskId='+taskId);const row=page.locator('article').filter({has:page.getByText(title,{exact:true})});await row.getByRole('button',{name:'Más acciones de '+title,exact:true}).click();await page.getByRole('menuitem',{name:'Cambiar fecha o datos',exact:true}).click();
 const dialog=page.getByRole('dialog');const purposeAsk=dialog.getByLabel('¿De qué se trata?');await expect(purposeAsk).toHaveValue('');await expect(purposeAsk).not.toHaveAttribute('required','');
 await dialog.getByRole('button',{name:'En 1 semana',exact:true}).click();await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(dialog).toHaveCount(0);
 const week=localDay(new Date(Date.now()+7*86400000));expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({action:'task_save',id:taskId,dueDate:week});expect(writes[0].purpose).toBeUndefined();
 await expect(page.getByText('Tarea actualizada: '+title+' · ')).toBeVisible();
});

test('a past date needs its own confirmation and completing a purposeless task forces a purpose choice',async({page})=>{
 test.setTimeout(120000);await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 async function api(endpoint:string,body?:unknown){const r=await page.evaluate(async({endpoint,body})=>{const r=await fetch('/_api/'+endpoint,body?{method:'POST',headers:{'Content-Type':'application/json'},body}:{});return{status:r.status,text:await r.text()}},{endpoint,body:body?superjson.stringify(body):undefined});expect(r.status,r.text).toBe(200);return superjson.parse<any>(r.text)}
 const accountId=(await api('commercial',{action:'account_save',nombre:'Fecha pasada '+Date.now(),assignedUserEmail:'admin@example.com'})).id;
 const title='Tarea a vencer '+Date.now();const taskId=(await api('work',{action:'task_save',accountId,title,typeId:'followup',dueDate:localDay()})).id;
 const writes:any[]=[];await page.route('**/_api/work**',async route=>{if(route.request().method()==='POST')writes.push(superjson.parse(route.request().postData()!));await route.continue()});
 await page.goto('/my-day?accountId='+accountId+'&taskId='+taskId);const row=page.locator('article').filter({has:page.getByText(title,{exact:true})});
 await row.getByRole('button',{name:'Más acciones de '+title,exact:true}).click();await page.getByRole('menuitem',{name:'Cambiar fecha o datos',exact:true}).click();
 let dialog=page.getByRole('dialog');const box=dialog.getByRole('checkbox',{name:'Sí, quiero dejarla vencida'});
 await dialog.getByLabel('Fecha de vencimiento').fill(localDay(new Date(Date.now()-3*86400000)));await expect(box).not.toBeChecked();
 await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();expect(writes).toHaveLength(0);await expect(dialog).toBeVisible();
 await box.check();await dialog.getByLabel('Fecha de vencimiento').fill(localDay(new Date(Date.now()-5*86400000)));await expect(box).not.toBeChecked();
 await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();expect(writes).toHaveLength(0);await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Volver',exact:true}).click();const leave=page.getByRole('button',{name:'Descartar cambios y salir',exact:true});if(await leave.isVisible())await leave.click();await expect(dialog).toHaveCount(0);
 await row.getByRole('button',{name:'Anotar cómo salió',exact:true}).click();dialog=page.getByRole('dialog');
 const purpose=dialog.getByRole('combobox',{name:'Propósito',exact:true});const what=dialog.locator('input[name="outcome"]').first();
 await expect(purpose).toHaveValue('');await expect(what).toBeDisabled();
 await purpose.selectOption('care');await expect(what).toBeEnabled();await dialog.locator('input[name="outcome"][value="no_answer"]').check();await dialog.getByRole('combobox',{name:'¿Cómo sigue?',exact:true}).selectOption('done');await dialog.getByRole('combobox',{name:'¿Por qué no agendás nada?',exact:true}).selectOption('Ya tengo otra tarea agendada');
 await dialog.getByRole('button',{name:'Guardar resultado',exact:true}).click();await expect(dialog).toHaveCount(0);
 expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({action:'task_status',id:taskId,status:'completed',purpose:'care'});
});
