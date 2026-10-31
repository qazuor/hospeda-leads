import {test,expect,type Page} from '@playwright/test';
import superjson from 'superjson';
import {localDay} from '../../src/helpers/workDates';

// U-27: first-use checklist in Hoy. Mocked API so the server flags are controlled; the real flags are covered by scripts/test-work.ts.
const seller={id:3,email:'marta@example.com',displayName:'Marta',fullName:null,avatarUrl:null,role:'user'};
type Flags={contacted:boolean;logged:boolean;scheduled:boolean};
const task={id:'41',accountId:'201',leadId:null,title:'Llamar a la panadería',description:null,typeId:'call',assignedUserEmail:seller.email,dueDate:localDay(),dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:[],accountName:'Panadería Sol',city:'Colón',opportunityName:null,deletedAt:null};
const base={activities:[],types:[{id:'call',name:'Llamada',agenda:false,active:true}],accounts:[{id:'201',nombre:'Panadería Sol',ciudad:'Colón',assignedUserEmail:seller.email}],opportunities:[],contacts:[],users:[{email:seller.email,displayName:'Marta'}],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalActivities:0,page:1,cities:['Colón'],verticals:[]};
async function mock(page:Page,state:{flags:Flags;withTask?:boolean}){
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:seller};
  else if(url.pathname.endsWith('/work')){
   const detail=url.searchParams.get('mode')==='detail',tasks=detail||state.withTask?[task]:[];
   data={...base,tasks,totalTasks:tasks.length,bucketCounts:{overdue:0,today:tasks.length,upcoming:0},doneToday:0,firstSteps:state.flags};
  }else if(url.pathname.endsWith('/communication'))data={recentMessages:[],messages:[],resources:[],restrictions:[],responses:[],openManagements:[],recentContactHours:72};
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
}
const checklist=(page:Page)=>page.getByRole('region',{name:'Primeros pasos'});
const hecho=(page:Page,label:string)=>checklist(page).getByRole('listitem').filter({hasText:label}).getByText('(hecho)');

test('Primeros pasos: four steps tick from real flags, step 1 from opening a task, and the list stays usable',async({page})=>{
 const state={flags:{contacted:false,logged:false,scheduled:false},withTask:true};await mock(page,state);
 await page.goto('/my-day');
 await expect(checklist(page)).toBeVisible();
 await expect(checklist(page).getByRole('listitem')).toHaveText(['Abrí una tarea','Contactá a un negocio','Anotá cómo salió','Agendá la próxima tarea']);
 await expect(checklist(page).getByText('0 de 4 hechos')).toBeVisible();
 // Seeing the screen ticks nothing, and it never blocks the work underneath.
 await expect(page.getByText('Llamar a la panadería')).toBeVisible();await expect(page.getByRole('button',{name:'Agendar tarea',exact:true})).toBeEnabled();
 // Opening a task ticks step 1 (browser flag).
 await page.goto('/my-day?taskId=41&accountId=201');await expect(page.getByRole('region',{name:'Pendiente seleccionado'})).toBeVisible();
 await page.goto('/my-day');await expect(hecho(page,'Abrí una tarea')).toBeVisible();await expect(checklist(page).getByText('1 de 4 hechos')).toBeVisible();
 // Server flags tick the other steps.
 state.flags={contacted:true,logged:false,scheduled:true};await page.reload();
 await expect(checklist(page).getByText('3 de 4 hechos')).toBeVisible();await expect(hecho(page,'Anotá cómo salió')).toHaveCount(0);
});

test('Primeros pasos: dismissible for good, hidden when everything is done, and no horizontal scroll on a phone',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const state={flags:{contacted:false,logged:false,scheduled:false}};await mock(page,state);
 await page.goto('/my-day');await expect(checklist(page)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 const hide=checklist(page).getByRole('button',{name:'Ocultar',exact:true});expect((await hide.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await hide.click();await expect(checklist(page)).toHaveCount(0);
 await page.reload();await expect(page.getByRole('heading',{name:'Hoy',exact:true})).toBeVisible();await expect(checklist(page)).toHaveCount(0);
 // Everything done (opened flag + server flags): hidden even after clearing the dismissal.
 await page.evaluate(()=>localStorage.removeItem('hospeda-first-steps-dismissed:marta@example.com'));
 state.flags={contacted:true,logged:true,scheduled:true};await page.evaluate(()=>localStorage.setItem('hospeda-first-steps-opened:marta@example.com','1'));await page.reload();
 await expect(page.getByRole('heading',{name:'Hoy',exact:true})).toBeVisible();await expect(checklist(page)).toHaveCount(0);
});

test('An experienced user on a new browser never sees the checklist',async({page})=>{
 await mock(page,{flags:{contacted:true,logged:true,scheduled:true},withTask:true});await page.goto('/my-day');
 await expect(page.getByText('Llamar a la panadería')).toBeVisible();await expect(checklist(page)).toHaveCount(0);
});

test('Hoy with filters and no tasks says so and clears the filters instead of teaching',async({page})=>{
 await mock(page,{flags:{contacted:true,logged:true,scheduled:true}});await page.goto('/my-day');
 await page.getByLabel('Localidad').selectOption('Colón');
 const filtered=page.getByRole('region',{name:'Sin tareas con filtros'});
 await expect(filtered.getByRole('heading',{name:'No hay tareas con estos filtros'})).toBeVisible();await expect(page.getByRole('region',{name:'Todavía no hay tareas'})).toHaveCount(0);
 await filtered.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await expect(page.getByRole('region',{name:'Todavía no hay tareas'})).toBeVisible();
});

test('Hoy without tasks teaches what each list is for and offers to schedule one',async({page})=>{
 await mock(page,{flags:{contacted:true,logged:true,scheduled:true}});await page.goto('/my-day');
 const empty=page.getByRole('region',{name:'Todavía no hay tareas'});
 await expect(empty.getByRole('heading',{name:'Todavía no tenés tareas pendientes'})).toBeVisible();
 for(const term of ['Vencidas','Para hoy','Próximas tareas'])await expect(empty.getByText(term,{exact:true})).toBeVisible();
 await expect(empty.getByText(/Llamar a la panadería/)).toBeVisible();
 await empty.getByRole('button',{name:'Agendar mi primera tarea',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
});
