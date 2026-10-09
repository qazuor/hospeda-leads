import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {localDay} from '../../src/helpers/workDates';
for(const width of [1280,390])test(`slow result prevents duplicate submissions and preserves the retry at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const task={id:'1',accountId:'1',leadId:null,title:'Consultar necesidades',purpose:'commercial',description:null,typeId:'call',assignedUserEmail:'admin@example.com',dueDate:localDay(),dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:['1'],accountName:'Negocio de prueba',city:'Colón',opportunityName:null,deletedAt:null};
 const data={tasks:[task],activities:[],types:[{id:'call',name:'Llamada',active:true,agenda:false},{id:'followup',name:'Seguimiento',active:true,agenda:false}],accounts:[{id:'1',nombre:'Negocio de prueba',assignedUserEmail:'admin@example.com'}],opportunities:[],contacts:[{id:'1',accountId:'1',name:'Ana'}],users:[{email:'admin@example.com',displayName:'Admin'}],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalTasks:1,totalActivities:0,page:1,bucketCounts:{overdue:0,today:1,upcoming:0},cities:[],verticals:[]};
 let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve});
 const writes:any[]=[];
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/work')&&route.request().method()==='POST'){
   writes.push(superjson.parse(route.request().postData()!));if(writes.length===1)await gate;
   await route.fulfill({status:writes.length===1?500:200,contentType:'application/json',body:superjson.stringify(writes.length===1?{error:'No se pudo guardar el resultado'}:{id:'1'})});return;
  }
  await route.fulfill({contentType:'application/json',body:superjson.stringify(path.endsWith('/auth/session')?{user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}}:path.endsWith('/work')?data:{})});
 });
 await page.goto('/my-day');await page.locator('article').filter({has:page.getByText('Consultar necesidades',{exact:true})}).getByRole('button',{name:'Registrar qué pasó',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('combobox',{name:'¿Qué pasó?',exact:true}).selectOption('interested');
 const review=dialog.getByRole('region',{name:'Revisión del resultado',exact:true});
 await expect(review).toContainText('Mostró interés');await expect(review).toContainText('Ana');await expect(review).toContainText('Falta elegir cómo continuar');
 await dialog.getByRole('textbox',{name:'Detalles del resultado',exact:true}).fill('Pidió una propuesta para su equipo');
 await dialog.getByRole('button',{name:'Planificar una acción con fecha',exact:true}).click();await dialog.getByLabel('Qué hay que hacer',{exact:true}).fill('Revisar la propuesta con Ana');await dialog.getByLabel('Cuándo',{exact:true}).fill('18/01/2027');
 await expect(review).toContainText('Revisar la propuesta con Ana');await expect(review).toContainText('La etapa comercial se conserva');
 await dialog.locator('form').evaluate(form=>{(form as HTMLFormElement).requestSubmit();(form as HTMLFormElement).requestSubmit();});await expect(dialog.getByRole('button',{name:'Guardando…',exact:true})).toBeDisabled();await expect(dialog.getByRole('textbox',{name:'Detalles del resultado',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crm:navigate',{detail:'/accounts'})));await expect(page).toHaveURL(/my-day$/);await expect(page.getByRole('heading',{name:'Tenés cambios sin guardar',exact:true})).toHaveCount(0);await expect.poll(()=>writes.length).toBe(1);release();await expect(dialog.getByRole('alert')).toContainText('No se pudo guardar');await expect(dialog.getByRole('textbox',{name:'Detalles del resultado',exact:true})).toHaveValue('Pidió una propuesta para su equipo');await expect(dialog.getByLabel('Cuándo',{exact:true})).toHaveValue('18/01/2027');
 await page.screenshot({path:`test-results/loading-result-${width}.png`,fullPage:true});
 await dialog.getByRole('button',{name:'Guardar y programar',exact:true}).click();await expect(dialog).toHaveCount(0);expect(writes).toHaveLength(2);expect(writes[0]).toEqual(writes[1]);expect(writes[1]).toMatchObject({action:'task_status',id:'1',status:'completed',outcome:'interested',continuation:'task',contactIds:['1'],nextTask:{title:'Revisar la propuesta con Ana',dueDate:'2027-01-18'}});
 await page.goto('/agenda');await expect(page.getByRole('heading',{name:'Agenda de visitas y reuniones',exact:true})).toBeVisible();
 if(width===390)await expect.poll(()=>page.getByRole('region',{name:'Filtros de trabajo',exact:true}).locator('label').evaluateAll(labels=>labels.every(label=>label.getBoundingClientRect().width>=200))).toBe(true);
 await page.getByRole('button',{name:'Ver calendario',exact:true}).click();await page.screenshot({path:`test-results/agenda-filters-${width}.png`,fullPage:true,animations:'disabled'});

});
