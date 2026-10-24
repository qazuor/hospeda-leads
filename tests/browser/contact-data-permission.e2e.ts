import {test,expect,type Page} from '@playwright/test';
import superjson from 'superjson';

// Decision 8A: a seller with an open management corrects the contact data of a business she does not own; nothing else.
const seller={id:4,email:'colleague@example.com',displayName:'Colega',fullName:null,avatarUrl:null,role:'user'};
const account={id:'301',nombre:'Posada del Río',ciudad:'Colón',tipo:'Alojamiento',subtipo:null,email:'vieja@example.com',telefono:'3447111111',whatsapp:null,assignedUserEmail:'owner@example.com',commercialStatus:'prospect',isClient:false,status:'in_management',doNotContact:false,archivedAt:null,deletedAt:null,referredToLeandro:false,recontactAt:null};
const contacts=[{id:'11',accountId:'301',name:'Marta Principal',position:null,phone:'3447222222',email:null,preferredChannel:null,isPrimary:true,notes:null,deletedAt:null},{id:'12',accountId:'301',name:'Juan Segundo',position:null,phone:null,email:null,preferredChannel:null,isPrimary:false,notes:null,deletedAt:null}];
async function mock(page:Page,canEditContactData:boolean){
 const posts:any[]=[];
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());const path=url.pathname;let data:unknown=path.endsWith('/auth/session')?{user:seller}:{};
  if(path.endsWith('/commercial')){
   if(route.request().method()==='POST'){posts.push(superjson.parse(route.request().postData()!));data={id:'301'};}
   else if(url.searchParams.has('historyPage'))data={events:[],total:0,page:1,pending:[],totalPending:0};
   else data={account,contacts,opportunities:[],journal:[],leadJournal:[],managementJournal:[],stages:[],canEditContactData,users:[{email:'owner@example.com',displayName:'Marta'}]};
  }else if(path.endsWith('/settings'))data={types:[],subtypes:[],users:[],contactPositions:[],contactChannels:[]};
  else if(path.endsWith('/work'))data={tasks:[],activities:[],attention:[],accounts:[],opportunities:[],types:[],users:[],contacts:[],journal:[],totalTasks:0,totalActivities:0,page:1,followup:{stages:[],newAssignmentDays:7}};
  else if(path.endsWith('/communication'))data={recentMessages:[],messages:[],resources:[],restrictions:[],responses:[],openManagements:[],recentContactHours:72};
  else if(path.endsWith('/pipeline'))data={stages:[],insights:[],events:[],objections:[],lossReasons:[],objectionTypes:[],rules:[],users:[],verticals:[],managementReasons:[]};
  else if(path.endsWith('/resources'))data={documents:[],categories:[],maxDocumentBytes:2097152};
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 return posts;
}

test('a seller with an open management corrects only phone, email and WhatsApp',async({page})=>{
 const posts=await mock(page,true);
 await page.goto('/accounts/301');
 await expect(page.getByRole('heading',{name:'Posada del Río',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Editar negocio',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Más acciones del negocio',exact:true})).toHaveCount(0);
 await page.getByRole('tab',{name:'Gestiones · Personas · Datos',exact:true}).click();
 await page.getByRole('button',{name:'Corregir datos de contacto',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByText('Queda registrado en el historial.').first()).toBeVisible();
 await expect(dialog.getByLabel('Teléfono')).toHaveValue('3447111111');
 for(const label of ['Negocio','Ciudad','Vertical','Responsable'])await expect(dialog.getByLabel(label,{exact:true})).toHaveCount(0);
 await dialog.getByLabel('Teléfono').fill('3447999999');
 await dialog.getByLabel('WhatsApp').fill('3447888888');
 await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();
 await expect.poll(()=>posts.length).toBe(1);
 expect(posts[0]).toEqual({action:'account_save',id:'301',nombre:'Posada del Río',telefono:'3447999999',email:'vieja@example.com',whatsapp:'3447888888'});
});

test('the same seller adds and edits persons but cannot remove them or change the primary one',async({page})=>{
 const posts=await mock(page,true);
 await page.goto('/accounts/301');
 await page.getByRole('tab',{name:'Gestiones · Personas · Datos',exact:true}).click();
 await expect(page.getByRole('button',{name:'Agregar persona',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Quitar persona',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Editar',exact:true}).first().click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByLabel('Nombre de la persona')).toHaveValue('Marta Principal');
 await expect(dialog.getByText('Principal del negocio')).toHaveCount(0);
 await dialog.getByLabel('Email').fill('marta@example.com');
 await dialog.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect.poll(()=>posts.length).toBe(1);
 expect(posts[0]).toMatchObject({action:'contact_save',accountId:'301',id:'11',email:'marta@example.com',isPrimary:true});
});

test('without an open management the business stays read-only and offers no correction',async({page})=>{
 await mock(page,false);
 await page.goto('/accounts/301');
 await expect(page.getByRole('heading',{name:'Posada del Río',exact:true})).toBeVisible();
 for(const name of ['Corregir datos de contacto','Editar negocio'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
 await expect(page.getByText('Podés consultar este negocio. Solo su responsable o un administrador puede modificarlo.')).toBeVisible();
 await page.getByRole('tab',{name:'Gestiones · Personas · Datos',exact:true}).click();
 for(const name of ['Agregar persona','Editar','Quitar persona'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
});
