import {test,expect} from '@playwright/test';
import superjson from 'superjson';
test('a call is logged from the management page and chains into the outcome step',async({page})=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 async function api(endpoint:string,body?:unknown){const result=await page.evaluate(async({endpoint,body})=>{const r=await fetch('/_api/'+endpoint,body?{method:'POST',headers:{'Content-Type':'application/json'},body}:{});return {status:r.status,text:await r.text()}},{endpoint,body:body?superjson.stringify(body):undefined});expect(result.status,result.text).toBe(200);return superjson.parse<any>(result.text);}
 const stamp=Date.now(),accountId=(await api('commercial',{action:'account_save',nombre:'Llamada gestión '+stamp,telefono:'+5493442000555',assignedUserEmail:'admin@example.com'})).id;
 const leadId=(await api('commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:'Gestión con llamada '+stamp,estado:'Cargado'})).id;
 await page.goto('/sales/'+leadId);await page.getByRole('tab',{name:'Comunicación',exact:true}).click();
 await page.getByText('Registrar una llamada',{exact:true}).click();
 await expect(page.getByLabel('Número a llamar')).toHaveText('+5493442000555');await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
 await page.getByRole('button',{name:'Copiar número',exact:true}).click();expect((await api('communication?leadId='+leadId)).messages).toHaveLength(0);
 await page.getByLabel('Nota de la llamada (opcional)').fill('Hablé con la dueña');await page.getByRole('button',{name:'Ya llamé: anotar cómo salió',exact:true}).click();
 const outcome=page.getByRole('dialog',{name:'Registrar actividad',exact:true});await expect(outcome.getByLabel('Título')).toHaveValue('Contacto por llamada');
 const messages=(await api('communication?leadId='+leadId)).messages;expect(messages).toHaveLength(1);expect(messages[0]).toMatchObject({channel:'call',status:'manual_sent',purpose:null});expect(String(messages[0].leadId)).toBe(String(leadId));
 await outcome.getByLabel('¿Qué pasó?').selectOption('no_answer');await outcome.getByLabel('¿Cómo sigue?').selectOption('done');await outcome.getByLabel('¿Por qué no agendás nada?').selectOption('Ya tengo otra tarea agendada');await outcome.getByRole('button',{name:'Guardar',exact:true}).click();await expect(outcome).toHaveCount(0);
 await expect.poll(async()=>(await api('communication?leadId='+leadId)).messages[0].activityId).toBeTruthy();
 expect(errors).toEqual([]);
});
