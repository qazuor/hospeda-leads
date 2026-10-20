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
  else if(url.pathname.endsWith('/work'))data={tasks:[],activities:[],attention:[],accounts:[],opportunities:[],types:[],users:[],followup:{stages:[],newAssignmentDays:7}};
  else if(url.pathname.endsWith('/resources'))data={documents:[],categories:[],maxDocumentBytes:2097152};
  else if(url.pathname.endsWith('/settings'))data={users:[{id:3,email:'owner@example.com',displayName:'Owner',role:'admin'}],cities:[],types:['Alojamientos'],subtypes:[],templates:[],authorizedEmails:[],opportunityStages:[]};
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts/1');
 const card=page.getByRole('region',{name:'Estado del negocio',exact:true});
 await expect(card.locator('span').filter({hasText:'Revisado'})).toBeVisible();
 await card.getByRole('combobox',{name:'Actualizar estado',exact:true}).selectOption('recontact');
 await card.getByLabel('Fecha opcional').fill('2026-11-15');
 await card.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(card.locator('span').filter({hasText:'Recontactar'})).toBeVisible();
 await expect(card.getByText(/15 de nov de 2026/i)).toBeVisible();
 await expect(card.getByLabel('Fecha opcional')).toHaveValue('15/11/2026');
 expect(writes).toContainEqual({action:'business_status',accountId:'1',status:'recontact',recontactAt:'2026-11-15',reason:''});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
 await page.screenshot({path:`test-results/business-state-${viewport.width}.png`,fullPage:true});
});
