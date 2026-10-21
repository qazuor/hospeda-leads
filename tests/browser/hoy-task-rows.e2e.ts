import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {localDay} from '../../src/helpers/workDates';

test('Hoy task rows: one primary action, Posponer with Deshacer, honest menu, management link remembers Hoy and progress',async({page})=>{
 test.setTimeout(180000);
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/\/my-day$/);
 async function api(endpoint:string,body?:unknown){const r=await page.evaluate(async({endpoint,body})=>{const r=await fetch('/_api/'+endpoint,body?{method:'POST',headers:{'Content-Type':'application/json'},body}:{});return {status:r.status,text:await r.text()}},{endpoint,body:body?superjson.stringify(body):undefined});expect(r.status,r.text).toBe(200);return superjson.parse<any>(r.text)}
 const stamp=Date.now(),name='Hoy filas '+stamp,title='Llamar por filas '+stamp;
 const accountId=(await api('commercial',{action:'account_save',nombre:name,assignedUserEmail:'admin@example.com'})).id;
 const person=(await api('commercial',{action:'contact_save',accountId,name:'Ana',email:'ana@example.com',isPrimary:true})).id;
 const sale=(await api('commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:'Gestión filas',estado:'Cargado',primaryContactId:person})).id;
 const yesterday=localDay(new Date(Date.now()-3*86400000));
 const taskId=(await api('work',{action:'task_save',accountId,leadId:sale,title,typeId:'call',purpose:'commercial',dueDate:yesterday})).id;
 await page.goto('/my-day');
 const row=page.locator('article').filter({has:page.getByText(title,{exact:true})});
 await expect(row.getByText(/^Vencida hace 3 días/)).toBeVisible();
 await expect(row.getByRole('button',{name:'Anotar cómo salió',exact:true})).toBeVisible();await expect(row.getByRole('button',{name:'Contactar',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Agendar tarea',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Anotar lo que pasó',exact:true}).first()).toBeVisible();
 await expect(page.getByRole('status').filter({hasText:/^Hoy: \d+ de \d+ hechas/})).toBeVisible();
 // The row menu uses the same words as the editor titles.
 await row.getByRole('button',{name:'Más acciones de '+title,exact:true}).click();
 for(const item of ['Cambiar fecha o datos','Ya no hace falta','Anotar lo que pasó','Borrar (cargada por error)'])await expect(page.getByRole('menuitem',{name:item,exact:true})).toBeVisible();
 await expect(page.getByRole('menuitem',{name:'Editar / reprogramar'})).toHaveCount(0);
 await page.keyboard.press('Escape');
 // Posponer a Mañana, then Deshacer restores the old day.
 await row.getByRole('button',{name:'Posponer '+title,exact:true}).click();await page.getByRole('menuitem',{name:/^Mañana/}).click();
 await expect(page.getByText('Tarea pospuesta para el',{exact:false})).toBeVisible();
 await expect.poll(async()=>(await api('work?mode=detail&accountId='+accountId+'&taskId='+taskId+'&responsible=all')).tasks[0].dueDate).toBe(localDay(new Date(Date.now()+86400000)));
 await page.getByRole('button',{name:'Deshacer',exact:true}).click();
 await expect.poll(async()=>(await api('work?mode=detail&accountId='+accountId+'&taskId='+taskId+'&responsible=all')).tasks[0].dueDate).toBe(yesterday);
 await expect(page.locator('[data-sonner-toast]')).toHaveCount(0,{timeout:20000});
 // The management link remembers Hoy.
 await page.goto('/my-day');
 await page.locator('article').filter({has:page.getByText(title,{exact:true})}).getByRole('link',{name:new RegExp(name)}).click();
 await expect(page).toHaveURL(new RegExp('/sales/'+sale+'$'));await expect(page.getByRole('link',{name:'← Volver a Hoy'})).toBeVisible();
 // A completed task can have its result corrected: the menu opens the activity it created.
 const doneTitle='Completada por filas '+stamp;
 const doneId=(await api('work',{action:'task_save',accountId,leadId:sale,title:doneTitle,typeId:'call',purpose:'commercial',dueDate:localDay()})).id;
 await api('work',{action:'task_status',id:doneId,status:'completed',result:'Habló con Ana',continuation:'done',continuationReason:'Ya quedó todo resuelto'});
 await page.goto('/my-day?accountId='+accountId+'&taskId='+doneId);
 const done=page.locator('article').filter({has:page.getByText(doneTitle,{exact:true})});
 await done.getByRole('button',{name:'Más acciones de '+doneTitle,exact:true}).click();await page.getByRole('menuitem',{name:'Corregir resultado',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('heading',{name:'Editar actividad',exact:true})).toBeVisible();
});
