import {test,expect,type Page} from '@playwright/test';
import superjson from 'superjson';

// Decisions D1 and 1C (2026-10-21): recording «Pidió no ser contactado» needs the business/management responsible or an admin, and a No contactar business is read-only for non-admins.
const seller=(id:number,email:string,displayName:string,role='user')=>({id,email,displayName,fullName:null,avatarUrl:null,role});
const owner=seller(3,'owner@example.com','Marta'),manager=seller(4,'manager@example.com','Gestora'),stranger=seller(5,'stranger@example.com','Colega'),admin=seller(1,'admin@example.com','Admin','admin');
const account={id:'301',nombre:'Posada del Río',ciudad:'Colón',tipo:'Alojamiento',subtipo:null,email:'hola@example.com',telefono:'3447412345',whatsapp:null,assignedUserEmail:owner.email,commercialStatus:'prospect',isClient:false,doNotContact:false,referredToLeandro:false,status:'in_management',recontactAt:null,archivedAt:null,deletedAt:null,mergedIntoId:null,updatedAt:new Date('2026-10-05T15:00:00Z')};
const management={id:'401',accountId:'301',opportunityName:'Alianza',managementType:'main',estado:'Cargado',assignedUserEmail:manager.email,deletedAt:null,pipelineRevision:1,tipo:'Alojamiento',createdAt:new Date('2026-10-01T12:00:00Z')};
const response={id:'6a1f5c1e-0000-4000-8000-000000000001',accountId:'301',leadId:null,category:'interested',summary:'Le interesa',exactText:null,otherDetail:null,contextName:'Negocio',occurredAt:new Date('2026-10-06T12:00:00Z'),actorEmail:'',contactId:null};

async function mock(page:Page,user:typeof owner,business=account,{responses=[] as unknown[]}={}){
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;let data:unknown=path.endsWith('/auth/session')?{user}:{};
  if(path.endsWith('/commercial')){
   if(new URL(route.request().url()).searchParams.has('historyPage'))data={events:[],total:0,page:1,pending:[],totalPending:0};
   else data={account:business,contacts:[],opportunities:[management],journal:[],leadJournal:[],managementJournal:[],stages:[],users:[owner,manager,stranger,admin].map(u=>({email:u.email,displayName:u.displayName})),canEditContactData:false};
  }else if(path.endsWith('/work'))data={tasks:[],activities:[],attention:[],contacts:[],journal:[],totalTasks:0,totalActivities:0,page:1,accounts:[{id:'301',nombre:business.nombre,ciudad:'Colón',assignedUserEmail:owner.email,doNotContact:business.doNotContact}],opportunities:[],types:[],users:[],followup:{stages:[],newAssignmentDays:7}};
  else if(path.endsWith('/communication'))data={recentMessages:[],messages:[],resources:[],restrictions:[],activeRestrictions:[],responses,openManagements:[],recentContactHours:72};
  else if(path.endsWith('/pipeline'))data={stages:[],insights:[],events:[],objections:[],lossReasons:[],objectionTypes:[],rules:[],users:[],verticals:[],managementReasons:[]};
  else if(path.endsWith('/resources'))data={documents:[],categories:[],maxDocumentBytes:2097152};
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
}
const openResponseDialog=async(page:Page)=>{
 await page.goto('/accounts/301?section=communication');
 await expect(page.getByRole('heading',{name:'Posada del Río',exact:true})).toBeVisible();
 // Spec 91 §6: «Registrar ▾» holds «Respuesta sin mensaje».
 await page.getByRole('button',{name:'Registrar',exact:true}).click();await page.getByRole('menuitem',{name:'Respuesta sin mensaje',exact:true}).click();
 return page.getByRole('dialog').last();
};

for(const [who,user,allowed] of [['the business responsible',owner,true],['the responsible of one of its managements',manager,true],['an admin',admin,true],['an unrelated seller',stranger,false]] as const){
 test(`D1: «Pidió no ser contactado» is ${allowed?'offered to':'disabled for'} ${who} when recording a received response`,async({page})=>{
  await mock(page,user);
  const dialog=await openResponseDialog(page);
  const option=dialog.getByRole('option',{name:'Pidió no ser contactado',exact:true});
  await expect(option).toHaveCount(1);
  if(allowed){await expect(option).toHaveJSProperty('disabled',false);await expect(page.getByTestId('dnc-record-denied')).toHaveCount(0);}
  else{
   await expect(option).toHaveJSProperty('disabled',true);
   await expect(page.getByTestId('dnc-record-denied')).toHaveText('Solo el responsable del negocio, el de una de sus gestiones o un administrador puede registrar «Pidió no ser contactado».');
   // Every other category stays available: recording what the business wrote back is not contacting it.
   await expect(dialog.getByRole('option',{name:'Respondió, le interesa',exact:true})).toHaveJSProperty('disabled',false);
  }
 });
}

test('D1: correcting a response to «Pidió no ser contactado» is disabled for an unrelated seller and enabled for the responsible',async({page})=>{
 await mock(page,stranger,account,{responses:[{...response,actorEmail:stranger.email}]});
 await page.goto('/accounts/301?section=communication');
 const event=page.getByRole('article',{name:'Respuesta registrada sin mensaje · Respondió, le interesa',exact:true});await expect(event).toBeVisible();
 await expect(event.getByRole('button',{name:'Corregir respuesta',exact:true})).toHaveCount(0);await event.getByRole('button',{name:/^Más acciones · /}).click();await page.getByRole('menuitem',{name:'Corregir respuesta',exact:true}).click();
 await expect(page.getByLabel('¿Qué respondió?').last().getByRole('option',{name:'Pidió no ser contactado',exact:true})).toHaveJSProperty('disabled',true);
});

test('D1: the responsible can pick «Pidió no ser contactado» while correcting a response',async({page})=>{
 await mock(page,owner,account,{responses:[{...response,actorEmail:owner.email}]});
 await page.goto('/accounts/301?section=communication');
 const event=page.getByRole('article',{name:'Respuesta registrada sin mensaje · Respondió, le interesa',exact:true});await expect(event).toBeVisible();
 await expect(event.getByRole('button',{name:'Corregir respuesta',exact:true})).toHaveCount(0);await event.getByRole('button',{name:/^Más acciones · /}).click();await page.getByRole('menuitem',{name:'Corregir respuesta',exact:true}).click();
 await expect(page.getByLabel('¿Qué respondió?').last().getByRole('option',{name:'Pidió no ser contactado',exact:true})).toHaveJSProperty('disabled',false);
});

test('1C: a non-archived No contactar business is read-only for its responsible seller, with the banner and no edit or work actions',async({page})=>{
 await mock(page,owner,{...account,doNotContact:true});
 await page.goto('/accounts/301');
 await expect(page.getByRole('heading',{name:'Posada del Río',exact:true})).toBeVisible();
 await expect(page.getByTestId('do-not-contact-banner')).toContainText('Solo un administrador puede levantar el bloqueo.');
 await expect(page.getByRole('status').filter({hasText:'Mientras tenga No contactar, solo un administrador puede modificarlo.'})).toBeVisible();
 for(const name of ['Contactar','Editar negocio','Más acciones del negocio','WhatsApp','Instagram','Email','Agendar tarea','Anotar lo que pasó','Iniciar gestión','Agendar otra tarea'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Agregar persona',exact:true})).toHaveCount(0);
});

test('1C: the same No contactar business keeps its edit actions for an admin',async({page})=>{
 await mock(page,admin,{...account,doNotContact:true});
 await page.goto('/accounts/301');
 await expect(page.getByTestId('do-not-contact-banner')).toBeVisible();
 await expect(page.getByRole('button',{name:'Editar negocio',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Contactar',exact:true})).toHaveCount(0);
});

test('1C: the same business without No contactar stays editable for its responsible seller',async({page})=>{
 await mock(page,owner);
 await page.goto('/accounts/301');
 await expect(page.getByRole('button',{name:'Editar negocio',exact:true})).toBeVisible();
});

test('1C: only an admin can lift a No contactar block by correcting its response',async({page})=>{
 const dnc={...response,category:'do_not_contact',summary:'Pidió no ser contactado'};
 await mock(page,owner,{...account,doNotContact:true},{responses:[{...dnc,actorEmail:owner.email}]});
 await page.goto('/accounts/301?section=communication');
 const event=page.getByRole('article',{name:'Respuesta registrada sin mensaje · Pidió no ser contactado',exact:true});await expect(event).toBeVisible();
 await expect(event.getByRole('button',{name:'Corregir respuesta',exact:true})).toHaveCount(0);await event.getByRole('button',{name:/^Más acciones · /}).click();await page.getByRole('menuitem',{name:'Corregir respuesta',exact:true}).click();
 await expect(page.getByTestId('dnc-lift-denied')).toContainText('Solo un administrador puede levantar el bloqueo No contactar');
 await expect(page.getByLabel('¿Qué respondió?').last().getByRole('option',{name:'Respondió, le interesa',exact:true})).toHaveJSProperty('disabled',true);
});

test('1C: an admin can still change the category of a No contactar response',async({page})=>{
 await mock(page,admin,{...account,doNotContact:true},{responses:[{...response,category:'do_not_contact',actorEmail:admin.email}]});
 await page.goto('/accounts/301?section=communication');
 const event=page.getByRole('article',{name:'Respuesta registrada sin mensaje · Pidió no ser contactado',exact:true});await expect(event).toBeVisible();
 await expect(event.getByRole('button',{name:'Corregir respuesta',exact:true})).toHaveCount(0);await event.getByRole('button',{name:/^Más acciones · /}).click();await page.getByRole('menuitem',{name:'Corregir respuesta',exact:true}).click();
 await expect(page.getByTestId('dnc-lift-denied')).toHaveCount(0);
 await expect(page.getByLabel('¿Qué respondió?').last().getByRole('option',{name:'Respondió, le interesa',exact:true})).toHaveJSProperty('disabled',false);
});

test('1C: the reminder of a "later" response is disabled with the reason on a No contactar business',async({page})=>{
 await mock(page,owner,{...account,doNotContact:true});
 const dialog=await openResponseDialog(page);
 await dialog.getByLabel('¿Qué respondió?').selectOption('later');
 await expect(dialog.getByRole('checkbox',{name:/Crear recordatorio/})).toBeDisabled();
 await expect(dialog.getByText('Solo un administrador puede modificarlo.',{exact:false}).first()).toBeVisible();
});
