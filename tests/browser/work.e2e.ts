import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {localDay,localDateTime} from '../../src/helpers/workDates';

test('Mi día completes a call while preserving the visit, with agenda and retrospective audit',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Password',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Log In',exact:true}).click();await expect(page).toHaveURL(/\/accounts$/);
 const name='Agenda E2E '+Date.now();
 async function mutate(endpoint:string,body:unknown){const r=await page.request.post('/_api/'+endpoint,{data:superjson.stringify(body),headers:{'Content-Type':'application/json'}});expect(r.status(),await r.text()).toBe(200);return superjson.parse<{id:string}>(await r.text()).id;}
 const accountId=await mutate('commercial',{action:'account_save',nombre:name,ciudad:'Colón',assignedUserEmail:'admin@example.com'});
 const leadId=await mutate('commercial',{action:'opportunity_save',accountId,opportunityName:'Publicación Premium',estado:'En tratativas',assignedUserEmail:'admin@example.com'});
 const today=localDay();const tomorrow=localDay(new Date(Date.now()+86400000));const yesterday=localDateTime(new Date(Date.now()-86400000));
 await page.getByRole('link',{name:'Mi día',exact:true}).click();
 for(const [title,type,date,time] of [['Llamada E2E','call',today,''],['Visita E2E','visit',tomorrow,'15:00']]){
  await page.getByRole('button',{name:'Nueva tarea',exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Negocio',{exact:true}).selectOption(accountId);await dialog.getByLabel('Contexto',{exact:true}).selectOption(leadId);await dialog.getByLabel('Título',{exact:true}).fill(title);await dialog.getByLabel('Tipo',{exact:true}).selectOption(type);await dialog.getByLabel('Fecha de vencimiento').fill(date);if(time)await dialog.getByLabel('Hora (opcional)').fill(time);await dialog.getByLabel('Descripción / notas').fill('Confirmar condiciones con propietaria');await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await expect(dialog).toHaveCount(0);
 }
 await expect(page.getByText('Llamada E2E',{exact:true})).toBeVisible();await expect(page.getByText('Visita E2E',{exact:true})).toBeVisible();
 const call=page.locator('article').filter({has:page.getByText('Llamada E2E',{exact:true})});await call.getByRole('button',{name:'Completar',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByLabel('Fecha y hora real').fill(yesterday);await dialog.getByLabel('Resultado',{exact:true}).fill('Confirmó interés y visita');await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByText('Llamada E2E',{exact:true})).toHaveCount(0);await expect(page.getByText('Visita E2E',{exact:true})).toBeVisible();
 const r=await page.request.get('/_api/commercial?accountId='+accountId);const detail=superjson.parse<{opportunities:{id:string;fechaProximaAccion:Date}[]}>(await r.text());expect(detail.opportunities.find(o=>o.id===leadId)!.fechaProximaAccion.toISOString().slice(0,10)).toBe(tomorrow);
 await page.screenshot({path:'test-results/work-day-light.png',fullPage:true});
 await page.getByRole('link',{name:'Agenda',exact:true}).click();await page.getByLabel('Mes',{exact:true}).fill(tomorrow.slice(0,7));await expect(page.getByText('Visita E2E',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Ver calendario'}).click();await expect(page.getByRole('button',{name:/15:00 · Visita E2E/})).toBeVisible();await page.screenshot({path:'test-results/work-calendar-light.png',fullPage:true});
 await page.getByRole('button',{name:'Admin Test',exact:true}).click();await page.getByRole('menuitem',{name:'Tema oscuro'}).click();await page.screenshot({path:'test-results/work-calendar-dark.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/work-calendar-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:900});
 await page.goto('/accounts/'+accountId);await expect(page.getByText('Confirmó interés y visita',{exact:false}).first()).toBeVisible();await page.getByText('Auditoría de tareas y actividades (últimos 200 cambios)',{exact:true}).click();await expect(page.getByText(/Actividad #.*Creada/).first()).toBeVisible();
 // Loading a past meeting from the same business records its real time, without changing the visit plan.
 await page.getByRole('button',{name:'Registrar actividad',exact:true}).first().click();dialog=page.getByRole('dialog');await dialog.getByLabel('Contexto',{exact:true}).selectOption(leadId);await dialog.getByLabel('Título',{exact:true}).fill('Reunión retrospectiva');await dialog.getByLabel('Tipo',{exact:true}).selectOption('meeting');await dialog.getByLabel('Fecha y hora real').fill(yesterday);await dialog.getByLabel('Resultado',{exact:true}).fill('Revisamos la propuesta');await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByText('Reunión retrospectiva',{exact:true})).toBeVisible();await expect(page.getByText('Visita E2E',{exact:true})).toBeVisible();
});
