import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {localDay} from '../../src/helpers/workDates';
import {pickOutcome} from './support/outcome';
import {simulateUserscript} from './helpers/userscript';
test('Seller continues from a message into the same task with its selected person and channel',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));await simulateUserscript(page,{user:'admin@example.com'});
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/\/my-day$/);
 async function mutate(endpoint:string,body:unknown){const r=await page.evaluate(async({endpoint,body})=>{const response=await fetch('/_api/'+endpoint,{method:'POST',body,headers:{'Content-Type':'application/json'}});return {status:response.status,text:await response.text()};},{endpoint,body:superjson.stringify(body)});expect(r.status,r.text).toBe(200);return superjson.parse<any>(r.text).id as string;}
 const accountId=await mutate('commercial',{action:'account_save',nombre:'Recorrido vendedor '+Date.now(),assignedUserEmail:'admin@example.com'});
 const ana=await mutate('commercial',{action:'contact_save',accountId,name:'Ana del recorrido',phone:'5493442000001',isPrimary:true});
 const luis=await mutate('commercial',{action:'contact_save',accountId,name:'Luis del recorrido',phone:'5493442000002'});
 const leadId=await mutate('commercial',{action:'opportunity_save',accountId,confirmReviewed:true,managementType:'main',opportunityName:'Propuesta del recorrido',primaryContactId:ana,assignedUserEmail:'admin@example.com'});
 const taskId=await mutate('work',{action:'task_save',accountId,leadId,title:'Conversar sobre la propuesta',purpose:'commercial',typeId:'message',dueDate:localDay(),contactIds:[luis],assignedUserEmail:'admin@example.com'});
 await page.goto('/my-day');const row=page.locator('article').filter({has:page.getByText('Conversar sobre la propuesta',{exact:true})});await row.getByRole('button',{name:'Contactar',exact:true}).click();
 let dialog=page.getByRole('dialog');await dialog.getByLabel('Destinatario').selectOption(luis);await dialog.getByRole('button',{name:'Preparar WhatsApp con un mensaje modelo',exact:true}).click();dialog=page.getByRole('dialog');
 // Spec 96 §2.3: the person chosen in the task carries over; the step shows it as one «Para:» line instead of a select.
 await expect(dialog.getByRole('region',{name:'Destino del mensaje',exact:true})).toContainText('Para: Luis del recorrido · 5493442000002');await expect(dialog.getByRole('combobox',{name:'Destinatario',exact:true})).toHaveCount(0);await dialog.getByRole('button',{name:'Escribir un mensaje nuevo'}).click();
 await dialog.locator('.tiptap').fill('Hola Luis, ¿podemos revisar la propuesta?');await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();
 await page.evaluate(()=>{window.open=()=>null});await dialog.getByRole('button',{name:'Abrir WhatsApp con Luis del recorrido · +54 9 3442000002',exact:true}).click();
 // A task flow (onLog) keeps the composer open after the open: completing the task needs «Anotar lo que pasó».
 await expect(dialog.getByRole('button',{name:'Anotar lo que pasó',exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Registrar respuesta',exact:true})).toHaveCount(0);
 const before=await page.evaluate(async accountId=>await (await fetch('/_api/work?mode=detail&accountId='+accountId)).text(),accountId);expect(superjson.parse<any>(before).tasks.find((t:any)=>t.id===taskId).status).toBe('pending');
 await page.screenshot({path:'test-results/seller-message-continue.png',fullPage:true});
 await dialog.getByRole('button',{name:'Anotar lo que pasó',exact:true}).click();dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Anotar lo que pasó',exact:true})).toBeVisible();await dialog.getByText('Fecha, canal y participantes',{exact:true}).click();await expect(dialog.getByRole('combobox',{name:'Canal',exact:true})).toHaveValue('whatsapp');await dialog.getByText('Revisar con quién hablamos',{exact:true}).click();await expect(dialog.getByLabel('Luis del recorrido',{exact:true})).toBeChecked();await expect(dialog.getByLabel('Ana del recorrido',{exact:true})).not.toBeChecked();
 await pickOutcome(dialog,'no_answer');await dialog.getByRole('combobox',{name:'¿Cómo sigue?',exact:true}).selectOption('wait');await dialog.getByLabel('Cuándo',{exact:true}).fill(localDay());await dialog.getByRole('button',{name:'Guardar y programar'}).click();await expect(dialog).toHaveCount(0);await expect(page.getByText('Retomar conversación',{exact:true}).first()).toBeVisible();
 await page.screenshot({path:'test-results/seller-continuity.png',fullPage:true});
});
