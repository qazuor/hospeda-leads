import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {localDay} from '../../src/helpers/workDates';

test('planning a task shows visible pending commitments and distinguishes task, activity and stage',async({page})=>{
 await page.setViewportSize({width:1280,height:900});
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const task={id:'41',accountId:'1',leadId:null,title:'Llamar a Ana por la propuesta',purpose:'commercial',description:null,typeId:'call',assignedUserEmail:'admin@example.com',dueDate:localDay(),dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:[],accountName:'Negocio de prueba',city:'Colón',opportunityName:null,deletedAt:null};
 const data={tasks:[task],activities:[],types:[{id:'call',name:'Llamada',active:true,agenda:false}],accounts:[{id:'1',nombre:'Negocio de prueba',ciudad:'Colón',assignedUserEmail:'admin@example.com'}],opportunities:[],contacts:[],users:[{email:'admin@example.com',displayName:'Admin'}],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalTasks:1,totalActivities:0,page:1,bucketCounts:{overdue:0,today:1,upcoming:0},cities:[],verticals:[]};
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  await route.fulfill({contentType:'application/json',body:superjson.stringify(path.endsWith('/auth/session')?{user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}}:path.endsWith('/work')?data:{})});
 });
 await page.goto('/my-day');
 await page.getByRole('button',{name:'Agendar tarea',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('combobox',{name:'Negocio',exact:true}).selectOption('1');
 await expect(dialog.getByText(/Tarea: algo pendiente con fecha/)).toHaveCount(0);
 const pending=dialog.getByRole('region',{name:'Tareas pendientes del negocio'});
 await expect(pending).toContainText('Llamar a Ana por la propuesta');
 await expect(pending).toContainText('Sin gestión (general del negocio)');
});
