import {test,expect,type Page} from '@playwright/test';
import superjson from 'superjson';

// Decision 1C: the responsible seller keeps read-only access to her archived / No contactar business.
const owner={id:3,email:'owner@example.com',displayName:'Marta',fullName:null,avatarUrl:null,role:'user'};
const colleague={...owner,id:4,email:'colleague@example.com',displayName:'Colega'};
const account={id:'201',nombre:'Hostería sin contacto',ciudad:'Colón',tipo:'Alojamiento',subtipo:null,email:'hola@example.com',telefono:'3447412345',assignedUserEmail:owner.email,commercialStatus:'prospect',isClient:false,doNotContact:true,referredToLeandro:false,status:'archived',recontactAt:null,archivedAt:new Date('2026-10-05T15:00:00Z'),deletedAt:null,mergedIntoId:null};
const journal=[
 {id:'2',accountId:'201',action:'business_status_changed',actorEmail:owner.email,actorName:'Marta',createdAt:new Date('2026-10-06T12:00:00Z'),metadata:{before:{recontactAt:null},after:{recontactAt:null}}},
 {id:'1',accountId:'201',action:'contact_policy',actorEmail:owner.email,actorName:'Marta',createdAt:new Date('2026-10-05T15:00:00Z'),metadata:{before:{doNotContact:false,status:'in_management'},after:{doNotContact:true,status:'archived'},origin:'automatic',cause:'management_change'}},
];
async function mock(page:Page,user:typeof owner,detailStatus:number,business=account,entries=journal){
 const detailRequests:string[]=[];
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());const path=url.pathname;let status=200;
  let data:unknown=path.endsWith('/auth/session')?{user}:{};
  if(path.endsWith('/commercial')){
   if(url.searchParams.has('historyPage'))data={events:[],total:0,page:1,pending:[],totalPending:0};
   else{detailRequests.push(url.search);status=detailStatus;data=detailStatus===200?{account:business,contacts:[],opportunities:[],journal:entries,leadJournal:[],managementJournal:[],stages:[],users:[{email:owner.email,displayName:'Marta'}]}:{error:'Este negocio está archivado. Solo su responsable o un administrador puede consultarlo.'};}
  }else if(path.endsWith('/work'))data={tasks:[],activities:[],attention:[],contacts:[],journal:[],totalTasks:0,totalActivities:0,page:1,accounts:[],opportunities:[],types:[],users:[],followup:{stages:[],newAssignmentDays:7}};
  else if(path.endsWith('/communication'))data={recentMessages:[],messages:[],resources:[],restrictions:[],responses:[],openManagements:[],recentContactHours:72};
  else if(path.endsWith('/pipeline'))data={stages:[],insights:[],events:[],objections:[],lossReasons:[],objectionTypes:[],rules:[],users:[],verticals:[],managementReasons:[]};
  else if(path.endsWith('/resources'))data={documents:[],categories:[],maxDocumentBytes:2097152};
  await route.fulfill({status,contentType:'application/json',body:superjson.stringify(data)});
 });
 return detailRequests;
}

test('the responsible seller reads her No contactar business with a red banner and no contact or edit actions',async({page})=>{
 const requests=await mock(page,owner,200);
 await page.goto('/accounts/201');
 await expect(page.getByRole('heading',{name:'Hostería sin contacto',exact:true})).toBeVisible();
 const banner=page.getByTestId('do-not-contact-banner');
 await expect(banner).toHaveAttribute('role','alert');
 await expect(banner).toHaveText('No contactar · Pidió no ser contactado el 5 de oct de 2026. Solo un administrador puede levantar el bloqueo.');
 for(const name of ['Contactar','Editar negocio','Más acciones del negocio','WhatsApp','Instagram','Email','Agendar tarea','Anotar lo que pasó','Iniciar gestión'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
 await expect(page.getByText('Podés consultar este negocio. Solo su responsable o un administrador puede modificarlo.')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Agregar persona',exact:true})).toHaveCount(0);
 await expect(page.getByRole('alert').filter({hasText:'archivado'})).toHaveCount(0);
 expect(requests.length).toBe(1);
});

test('a No contactar set by hand says when it was marked, not that the business asked',async({page})=>{
 await mock(page,owner,200,account,[{...journal[1],metadata:{before:{doNotContact:false},after:{doNotContact:true},origin:'direct',cause:null}}]);
 await page.goto('/accounts/201');
 await expect(page.getByTestId('do-not-contact-banner')).toHaveText('No contactar · Marcado el 5 de oct de 2026. Solo un administrador puede levantar el bloqueo.');
});

test('an archived business without No contactar explains that only an admin can restore it',async({page})=>{
 await mock(page,owner,200,{...account,doNotContact:false});
 await page.goto('/accounts/201');
 await expect(page.getByTestId('archived-banner')).toHaveText('Negocio archivado · Podés consultarlo; solo un administrador puede desarchivarlo.');
 await expect(page.getByTestId('do-not-contact-banner')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Editar negocio',exact:true})).toHaveCount(0);
});

test('another seller gets one forbidden answer with a way back, not a retry storm',async({page})=>{
 const requests=await mock(page,colleague,403);
 await page.goto('/accounts/201');
 await expect(page.getByText('Este negocio está archivado. Solo su responsable o un administrador puede consultarlo.').first()).toBeVisible();
 await expect(page.getByRole('link',{name:'Volver a Negocios',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/Reintentar/})).toHaveCount(0);
 await page.waitForTimeout(3000);
 expect(requests.length).toBe(1);
});
