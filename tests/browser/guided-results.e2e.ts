import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {localDay} from '../../src/helpers/workDates';
import {pickOutcome} from './support/outcome';
for(const width of [1280,390])test(`guided result reviews the next step and preserves values after an error at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const task={id:'1',accountId:'1',leadId:null,title:'Consultar necesidades',purpose:'commercial',description:null,typeId:'call',assignedUserEmail:'admin@example.com',dueDate:localDay(),dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:['1'],accountName:'Negocio de prueba',city:'Colón',opportunityName:null,deletedAt:null};
 const data={tasks:[task],activities:[],types:[{id:'call',name:'Llamada',active:true,agenda:false},{id:'followup',name:'Seguimiento',active:true,agenda:false}],accounts:[{id:'1',nombre:'Negocio de prueba',assignedUserEmail:'admin@example.com'}],opportunities:[],contacts:[{id:'1',accountId:'1',name:'Ana'}],users:[{email:'admin@example.com',displayName:'Admin'}],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalTasks:1,totalActivities:0,page:1,bucketCounts:{overdue:0,today:1,upcoming:0},cities:[],verticals:[]};
 const writes:any[]=[];
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/work')&&route.request().method()==='POST'){
   writes.push(superjson.parse(route.request().postData()!));
   await route.fulfill({status:writes.length===1?500:200,contentType:'application/json',body:superjson.stringify(writes.length===1?{error:'No se pudo guardar el resultado'}:{id:'1'})});return;
  }
  await route.fulfill({contentType:'application/json',body:superjson.stringify(path.endsWith('/auth/session')?{user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}}:path.endsWith('/work')?data:{})});
 });
 await page.goto('/my-day');await page.locator('article').filter({has:page.getByText('Consultar necesidades',{exact:true})}).getByRole('button',{name:'Anotar cómo salió',exact:true}).click();
 const dialog=page.getByRole('dialog');await pickOutcome(dialog,'interested');
 const review=dialog.getByRole('region',{name:'Revisión del resultado',exact:true});
 await expect(review).toContainText('Respondió, le interesa');await expect(review).toContainText('Ana');await expect(review).toContainText('Falta elegir cómo continuar');
 await dialog.getByRole('textbox',{name:'Detalles del resultado',exact:true}).fill('Pidió una propuesta para su equipo');
 // Decision 2B: saving without "¿Cómo sigue?" is blocked, and "Otro (contame)" needs the seller's words.
 const next=dialog.getByRole('combobox',{name:/^¿Cómo sigue\?/});await dialog.getByRole('button',{name:'Guardar resultado',exact:true}).click();await expect(dialog).toBeVisible();await expect.poll(()=>next.evaluate(el=>(el as HTMLSelectElement).validity.valueMissing)).toBe(true);expect(writes).toHaveLength(0);
 await next.selectOption('done');await dialog.getByRole('combobox',{name:'¿Por qué no agendás nada?',exact:true}).selectOption('Otro (contame)');const why=dialog.getByRole('textbox',{name:/^Contá por qué/});await dialog.getByRole('button',{name:'Guardar resultado',exact:true}).click();await expect(dialog).toBeVisible();await expect.poll(()=>why.evaluate(el=>(el as HTMLInputElement).validity.valueMissing)).toBe(true);expect(writes).toHaveLength(0);
 await expect(review).toContainText('No agendar nada');
 await dialog.getByRole('button',{name:'Agendar tarea',exact:true}).click();await dialog.getByLabel('Qué hay que hacer',{exact:true}).fill('Revisar la propuesta con Ana');await dialog.getByLabel('Cuándo',{exact:true}).fill('2027-01-18');
 await expect(review).toContainText('Revisar la propuesta con Ana');await expect(review).toContainText('La etapa de la gestión se conserva');
 await dialog.getByRole('button',{name:'Guardar y programar',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('No se pudo guardar');await expect(dialog.getByRole('textbox',{name:'Detalles del resultado',exact:true})).toHaveValue('Pidió una propuesta para su equipo');await expect(dialog.getByLabel('Cuándo',{exact:true})).toHaveValue('18/01/2027');
 await page.screenshot({path:`test-results/guided-results-${width}.png`,fullPage:true});
 await dialog.getByRole('button',{name:'Guardar y programar',exact:true}).click();await expect(dialog).toHaveCount(0);expect(writes).toHaveLength(2);expect(writes[0]).toEqual(writes[1]);expect(writes[1]).toMatchObject({action:'task_status',id:'1',status:'completed',outcome:'interested',continuation:'task',contactIds:['1'],nextTask:{title:'Revisar la propuesta con Ana',dueDate:'2027-01-18'}});
});

// Decision 9A: the suggested stage is an unticked choice; only a tick sends it, and it carries the revision the seller saw.
for(const accept of [false,true])test(`a suggested stage is offered unticked and only moves when the seller ticks it (ticked: ${accept})`,async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const task={id:'1',accountId:'1',leadId:'7',title:'Consultar necesidades',purpose:'commercial',description:null,typeId:'call',assignedUserEmail:'admin@example.com',dueDate:localDay(),dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:['1'],accountName:'Negocio de prueba',city:'Colón',opportunityName:null,deletedAt:null};
 const data={tasks:[task],activities:[],types:[{id:'call',name:'Llamada',active:true,agenda:false},{id:'followup',name:'Seguimiento',active:true,agenda:false}],accounts:[{id:'1',nombre:'Negocio de prueba',assignedUserEmail:'admin@example.com',doNotContact:false}],opportunities:[{id:'7',accountId:'1',opportunityName:'Plan principal',tipo:null,estado:'main:contact',managementType:'main',pipelineRevision:4,assignedUserEmail:'admin@example.com',createdAt:new Date(),fechaUltimoContacto:null}],contacts:[{id:'1',accountId:'1',name:'Ana'}],users:[{email:'admin@example.com',displayName:'Admin'}],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalTasks:1,totalActivities:0,page:1,bucketCounts:{overdue:0,today:1,upcoming:0},cities:[],verticals:[]};
 const writes:any[]=[];
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/work')&&route.request().method()==='POST'){writes.push(superjson.parse(route.request().postData()!));await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify({id:'1'})});return;}
  await route.fulfill({contentType:'application/json',body:superjson.stringify(path.endsWith('/auth/session')?{user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}}:path.endsWith('/work')?data:{})});
 });
 await page.goto('/my-day');await page.locator('article').filter({has:page.getByText('Consultar necesidades',{exact:true})}).getByRole('button',{name:'Anotar cómo salió',exact:true}).click();
 const dialog=page.getByRole('dialog');const offer=dialog.getByRole('checkbox',{name:/¿Pasar la gestión a/});
 await pickOutcome(dialog,'no_answer');await expect(offer).toHaveCount(0);
 await pickOutcome(dialog,'interested');await expect(offer).toBeVisible();await expect(offer).not.toBeChecked();
 await expect(dialog.getByRole('region',{name:'Revisión del resultado',exact:true})).toContainText('La etapa de la gestión se conserva');
 await dialog.getByLabel('Detalles del resultado',{exact:true}).fill('Le interesa');
 await dialog.getByRole('combobox',{name:/^¿Cómo sigue\?/}).selectOption('done');await dialog.getByRole('combobox',{name:'¿Por qué no agendás nada?',exact:true}).selectOption('Ya tengo otra tarea agendada');
 await offer.check();await expect(dialog.getByRole('region',{name:'Revisión del resultado',exact:true})).toContainText('La gestión pasará a');
 // Changing the result drops the choice instead of carrying it over.
 await pickOutcome(dialog,'no_answer');await expect(offer).toHaveCount(0);await pickOutcome(dialog,'interested');await expect(offer).not.toBeChecked();
 if(accept)await offer.check();
 await dialog.getByRole('button',{name:'Guardar resultado',exact:true}).click();await expect(dialog).toHaveCount(0);
 expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({action:'task_status',outcome:'interested'});
 if(accept)expect(writes[0].stageChange).toEqual({stage:'main:interested',revision:4});else expect(writes[0].stageChange).toBeUndefined();
});

/** Opens "Anotar cómo salió" on a task of a main management at `main:contact`; `state.revision` is what the next /work reads return. */
async function openSuggestion(page:import('@playwright/test').Page,state:{revision:number;reads:number;respond:(n:number)=>{status:number;body:unknown}},writes:any[]){
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const task={id:'1',accountId:'1',leadId:'7',title:'Consultar necesidades',purpose:'commercial',description:null,typeId:'call',assignedUserEmail:'admin@example.com',dueDate:localDay(),dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:['1'],accountName:'Negocio de prueba',city:'Colón',opportunityName:null,deletedAt:null};
 const data=()=>({tasks:[task],activities:[],types:[{id:'call',name:'Llamada',active:true,agenda:false},{id:'followup',name:'Seguimiento',active:true,agenda:false}],accounts:[{id:'1',nombre:'Negocio de prueba',assignedUserEmail:'admin@example.com',doNotContact:false}],opportunities:[{id:'7',accountId:'1',opportunityName:'Plan principal',tipo:null,estado:'main:contact',managementType:'main',pipelineRevision:state.revision,assignedUserEmail:'admin@example.com',createdAt:new Date(),fechaUltimoContacto:null}],contacts:[{id:'1',accountId:'1',name:'Ana'}],users:[{email:'admin@example.com',displayName:'Admin'}],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalTasks:1,totalActivities:0,page:1,bucketCounts:{overdue:0,today:1,upcoming:0},cities:[],verticals:[]});
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/work')&&route.request().method()==='POST'){writes.push(superjson.parse(route.request().postData()!));const r=state.respond(writes.length);await route.fulfill({status:r.status,contentType:'application/json',body:superjson.stringify(r.body)});return;}
  if(path.endsWith('/work'))state.reads++;
  await route.fulfill({contentType:'application/json',body:superjson.stringify(path.endsWith('/auth/session')?{user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}}:path.endsWith('/work')?data():{})});
 });
 await page.goto('/my-day');await page.locator('article').filter({has:page.getByText('Consultar necesidades',{exact:true})}).getByRole('button',{name:'Anotar cómo salió',exact:true}).click();
 const dialog=page.getByRole('dialog');await pickOutcome(dialog,'interested');
 await dialog.getByLabel('Detalles del resultado',{exact:true}).fill('Le interesa mucho');
 await dialog.getByRole('combobox',{name:/^¿Cómo sigue\?/}).selectOption('done');await dialog.getByRole('combobox',{name:'¿Por qué no agendás nada?',exact:true}).selectOption('Ya tengo otra tarea agendada');
 return dialog;
}
// A concurrent change makes the server answer 409: say nothing was saved, keep what she typed, drop the tick, and let her save again.
for(const retick of [false,true])test(`a stale suggested stage explains that nothing was saved and recovers (retick: ${retick})`,async({page})=>{
 const writes:any[]=[];const state={revision:4,reads:0,respond:(n:number)=>n===1?{status:409,body:{error:'La gestión cambió; revisala.'}}:{status:200,body:{id:'1'}}};
 const dialog=await openSuggestion(page,state,writes);const offer=dialog.getByRole('checkbox',{name:/¿Pasar la gestión a/});
 await offer.check();state.revision=5;
 await dialog.getByRole('button',{name:'Guardar resultado',exact:true}).click();
 await expect(dialog.getByRole('alert').filter({hasText:'No se guardó nada'})).toContainText('Lo que escribiste sigue acá');
 expect(writes[0].stageChange).toEqual({stage:'main:interested',revision:4});
 await expect(dialog.getByRole('textbox',{name:'Detalles del resultado',exact:true})).toHaveValue('Le interesa mucho');
 await expect(offer).not.toBeChecked();
 if(retick){await expect.poll(()=>state.reads).toBeGreaterThan(2);await offer.check();}
 await dialog.getByRole('button',{name:'Guardar resultado',exact:true}).click();await expect(dialog).toHaveCount(0);
 expect(writes).toHaveLength(2);
 if(retick)expect(writes[1].stageChange).toEqual({stage:'main:interested',revision:5});else expect(writes[1].stageChange).toBeUndefined();
});
// The revision sent is the one she saw when she ticked, even if the data refreshed afterwards, so the server can detect the change.
test('the suggested stage keeps the revision seen at tick time',async({page})=>{
 const writes:any[]=[];const state={revision:4,reads:0,respond:(_n:number)=>({status:200,body:{id:'1'}})};
 // Queries stay fresh for a minute: move the clock so a reconnect really refetches the management with its new revision.
 await page.clock.install();
 const dialog=await openSuggestion(page,state,writes);
 await dialog.getByRole('checkbox',{name:/¿Pasar la gestión a/}).check();
 state.revision=5;const before=state.reads;await page.clock.fastForward(61000);await page.evaluate(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'))});
 await expect.poll(()=>state.reads).toBeGreaterThan(before);
 await dialog.getByRole('button',{name:'Guardar resultado',exact:true}).click();await expect(dialog).toHaveCount(0);
 expect(writes[0].stageChange).toEqual({stage:'main:interested',revision:4});
});
