import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {localDay} from '../../src/helpers/workDates';
test('delegated task explains communication permissions without expanding management access',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const task={id:'1',accountId:'1',leadId:'2',title:'Llamar por la propuesta',purpose:'commercial',typeId:'call',assignedUserEmail:'delegate@example.com',dueDate:localDay(),dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:[],accountName:'Negocio de prueba',city:null,opportunityName:'Propuesta',deletedAt:null};
 const account={id:'1',nombre:task.accountName,assignedUserEmail:'owner@example.com',telefono:'5493442000001',email:'fixture@example.com',commercialStatus:'prospect',doNotContact:false,archivedAt:null,mergedIntoId:null};
 const work={tasks:[task],activities:[],types:[],accounts:[],opportunities:[],contacts:[],users:[],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalTasks:1,totalActivities:0,page:1,bucketCounts:{overdue:0,today:1,upcoming:0},cities:[],verticals:[]};
 const writes:string[]=[];
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;if(route.request().method()==='POST')writes.push(path);
  const data=path.endsWith('/auth/session')?{user:{id:1,email:'delegate@example.com',displayName:'Delegado',role:'user'}}:path.endsWith('/work')?work:path.endsWith('/commercial')?{account,contacts:[],opportunities:[{id:'2',accountId:'1',opportunityName:'Propuesta',assignedUserEmail:'owner@example.com',estado:'Cargado',deletedAt:null}],journal:[],leadJournal:[],users:[],stages:[]}:path.endsWith('/communication')?{restrictions:[],messages:[],recentMessages:[],sequences:[],runs:[]}:path.endsWith('/settings')?{templates:[]}:{};
  await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/my-day');await page.locator('article').filter({has:page.getByText(task.title,{exact:true})}).getByRole('button',{name:'Contactar',exact:true}).click();const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('button',{name:'Preparar email con un mensaje modelo',exact:true})).toBeDisabled();await expect(dialog.getByRole('button',{name:'Preparar WhatsApp con un mensaje modelo',exact:true})).toBeDisabled();await expect(dialog).toContainText('la asignación de esta tarea no cambia esos permisos');await expect(dialog.getByRole('link',{name:'Llamar',exact:true})).toHaveAttribute('href','tel:5493442000001');await expect(dialog.getByRole('button',{name:'Registrar qué pasó',exact:true})).toBeEnabled();expect(writes).toEqual([]);
});
