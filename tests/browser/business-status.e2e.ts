import {test,expect} from '@playwright/test';
import superjson from 'superjson';

for(const viewport of [{width:1280,height:900},{width:390,height:844}])test(`business status can be set with an optional recontact date at ${viewport.width}px`,async({page})=>{
 await page.setViewportSize(viewport);
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 let status='reviewed';let recontactAt:Date|string|null=null;const writes:unknown[]=[];
 const account={id:'1',nombre:'Hostería del Río',ciudad:'Colón',tipo:'Alojamientos',subtipo:'Hotel',assignedUserEmail:'owner@example.com',commercialStatus:'prospect',isClient:false,doNotContact:false,referredToLeandro:false,archivedAt:null,deletedAt:null};
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'owner@example.com',displayName:'Owner',role:'admin'}};
  else if(url.pathname.endsWith('/commercial')&&route.request().method()==='POST'){
   const body=superjson.parse<Record<string,unknown>>(route.request().postData()||'{}');writes.push(body);
   if(body.action==='business_status'){status=String(body.status);recontactAt=typeof body.recontactAt==='string'?new Date(`${body.recontactAt}T00:00:00.000Z`):null;}
   data={id:'1'};
  }else if(url.pathname.endsWith('/commercial'))data=url.searchParams.has('historyPage')?{events:[],total:0,page:1,pending:[],totalPending:0}:{account:{...account,status,recontactAt},contacts:[],opportunities:[],journal:[],leadJournal:[],stages:[],users:[{email:'owner@example.com',displayName:'Owner'}]};
  else if(url.pathname.endsWith('/work'))data={tasks:[],activities:[],types:[],accounts:[],opportunities:[],contacts:[],users:[],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalTasks:0,totalActivities:0,page:1};
  else if(url.pathname.endsWith('/resources'))data={documents:[],categories:[],maxDocumentBytes:2097152};
  else if(url.pathname.endsWith('/settings'))data={users:[{id:3,email:'owner@example.com',displayName:'Owner',role:'admin'}],cities:[],types:['Alojamientos'],subtypes:[],templates:[],authorizedEmails:[],opportunityStages:[]};
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts/1');
 const card=page.getByRole('region',{name:'Estado del negocio',exact:true});
 await expect(card).toContainText(/Estado:\s*Revisado\s*Cambiar/);
 await expect(card).toContainText('Sus datos ya están revisados.');
 await expect(card.getByRole('combobox')).toHaveCount(0);
 await card.getByRole('button',{name:'Cambiar estado del negocio. Ahora: Revisado',exact:true}).click();
 const popup=page.getByRole('dialog',{name:'Estado del negocio',exact:true});
 await expect(popup.getByRole('button',{name:/^Revisado/})).toHaveAttribute('aria-pressed','true');
 await expect(popup.getByRole('button',{name:'Guardar',exact:true})).toHaveCount(0);
 await popup.getByRole('button',{name:/^Recontactar/}).click();
 await popup.getByLabel('Fecha de recontacto (opcional)').fill('2026-11-15');
 await popup.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(popup).toHaveCount(0);
 await expect(card).toContainText(/Estado:\s*Recontactar\s*Cambiar/);
 await expect(card.getByText(/Fecha de referencia: 15 de nov de 2026/i)).toBeVisible();
 await card.getByRole('button',{name:'Cambiar estado del negocio. Ahora: Recontactar',exact:true}).click();
 await expect(popup.getByLabel('Fecha de recontacto (opcional)')).toHaveValue('15/11/2026');
 await page.keyboard.press('Escape');
 expect(writes).toContainEqual({action:'business_status',accountId:'1',status:'recontact',recontactAt:'2026-11-15'});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
 await page.screenshot({path:`test-results/business-state-${viewport.width}.png`,fullPage:true});
});

test('a new business opens its status popover on Nuevo without preselecting another value',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 const account={id:'1',nombre:'Hostería Nueva',ciudad:'Colón',assignedUserEmail:'owner@example.com',commercialStatus:'prospect',isClient:false,doNotContact:false,referredToLeandro:false,archivedAt:null,deletedAt:null,status:'new',recontactAt:null};
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'owner@example.com',displayName:'Owner',role:'user'}};
  else if(url.pathname.endsWith('/commercial'))data=url.searchParams.has('historyPage')?{events:[],total:0,page:1,pending:[],totalPending:0}:{account,contacts:[],opportunities:[],journal:[],leadJournal:[],stages:[],users:[{email:'owner@example.com',displayName:'Owner'}]};
  else if(url.pathname.endsWith('/work'))data={tasks:[],activities:[],types:[],accounts:[],opportunities:[],contacts:[],users:[],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalTasks:0,totalActivities:0,page:1};
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts/1');
 const card=page.getByRole('region',{name:'Estado del negocio',exact:true});
 await expect(card).toContainText(/Estado:\s*Nuevo\s*Cambiar/);
 await card.getByRole('button',{name:'Cambiar estado del negocio. Ahora: Nuevo',exact:true}).click();
 const popup=page.getByRole('dialog',{name:'Estado del negocio',exact:true});
 await expect(popup.getByRole('button',{name:/^Nuevo/})).toHaveAttribute('aria-pressed','true');
 await expect(popup.getByRole('button',{name:/^Revisado/})).toHaveAttribute('aria-pressed','false');
 await expect(popup.getByRole('button',{name:'Guardar',exact:true})).toHaveCount(0);
});
