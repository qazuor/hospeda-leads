import {test,expect,type Page} from '@playwright/test';
import superjson from 'superjson';

// Decision 1C on /sales/:id: the responsible seller of an ARCHIVED business reads its management read-only; a colleague gets nothing.
const owner={id:3,email:'owner@example.com',displayName:'Marta',fullName:null,avatarUrl:null,role:'user'};
const colleague={...owner,id:4,email:'colleague@example.com',displayName:'Colega'};
const account={id:'201',nombre:'Hostería archivada',ciudad:'Colón',tipo:'Alojamiento',subtipo:null,email:'hola@example.com',telefono:'3447412345',assignedUserEmail:owner.email,commercialStatus:'prospect',isClient:false,doNotContact:false,referredToLeandro:false,status:'archived',recontactAt:null,archivedAt:new Date('2026-10-05T15:00:00Z'),deletedAt:null,mergedIntoId:null};
const lead={id:'301',accountId:'201',nombre:account.nombre,opportunityName:'Plan anual 2027',managementType:'main',estado:'Cargado',tipo:'Alojamiento',ciudad:'Colón',assignedUserEmail:owner.email,createdAt:new Date('2026-09-01T12:00:00Z'),updatedAt:new Date('2026-09-01T12:00:00Z'),deletedAt:null,canModify:false,accountArchived:true};
const response={id:'9c1b8f7e-0000-4000-8000-000000000001',accountId:'201',leadId:'301',category:'interested',summary:'Le interesa el plan anual',exactText:null,otherDetail:null,actorEmail:owner.email,contextName:'Plan anual 2027',occurredAt:new Date('2026-10-01T15:00:00Z')};

async function mock(page:Page,user:typeof owner){
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;let data:unknown={};
  if(path.endsWith('/auth/session'))data={user};
  else if(path.endsWith('/leads'))data={rows:user===owner?[lead]:[],total:user===owner?1:0,page:1,pageSize:10,filters:{ciudades:[],estados:[],tipos:[],businessStatuses:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  else if(path.endsWith('/settings'))data={users:[owner,colleague],templates:[],cities:[],types:[],subtypes:[],contactChannels:[],authorizedEmails:[],opportunityStages:[]};
  else if(path.endsWith('/lead_notes'))data={notes:[],rows:[]};
  else if(path.endsWith('/lead_journal'))data={rows:[],total:0,page:1,pageSize:100,filters:{actions:[],actors:[],cities:[],types:[],leads:[]}};
  else if(path.endsWith('/commercial'))data=url.searchParams.has('historyPage')?{events:[],total:0,page:1,pending:[],totalPending:0}:{account,contacts:[],opportunities:[lead],journal:[],leadJournal:[],managementJournal:[],stages:[],users:[{email:owner.email,displayName:'Marta'}],canEditContactData:false};
  else if(path.endsWith('/communication'))data={pendingOutcomes:[],recentMessages:[],messages:[],restrictions:[],activeRestrictions:[],responses:[response],openManagements:[],recentContactHours:72};
  else if(path.endsWith('/work'))data={tasks:[],activities:[],attention:[],contacts:[],journal:[],totalTasks:0,totalActivities:0,page:1,accounts:[],opportunities:[],types:[],users:[],followup:{stages:[],newAssignmentDays:7}};
  else if(path.endsWith('/pipeline'))data={stages:[],insights:[],events:[],objections:[],lossReasons:[],objectionTypes:[],rules:[],users:[],verticals:[],managementReasons:[]};
  else if(path.endsWith('/resources'))data={documents:[],categories:[],maxDocumentBytes:2097152};
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
}

test('the responsible seller reads the management of her archived business with no action to change it',async({page})=>{
 await mock(page,owner);
 await page.goto('/sales/301?contact=email');
 await expect(page.getByRole('heading',{name:'Plan anual 2027'})).toBeVisible();
 await expect(page.getByTestId('archived-management-banner')).toHaveText('Negocio archivado · Podés consultar esta gestión; solo un administrador puede desarchivar el negocio para continuarla.');
 for(const name of ['Editar datos de gestión','Más acciones de la gestión'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
 await expect(page.getByRole('tab',{name:'Seguimiento',exact:true})).toHaveCount(0);
 // ?contact=email must not open the message editor on a read-only management.
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('tab',{name:'Comunicación',exact:true}).click();
 // Spec 90: the response without a message is an event row with its text visible, no summary to expand.
 await expect(page.getByRole('article',{name:'Respuesta registrada sin mensaje · Respondió, le interesa',exact:true})).toBeVisible();
 await expect(page.getByText(/Le interesa el plan anual/)).toBeVisible();
 for(const name of ['Registrar respuesta sin mensaje','Registrar respuesta recibida','Corregir respuesta','Registrar llamada u otro contacto','Contactar','Preparar respuesta'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
 // Spec 91 §3: no item offers secondary actions either (no «⋯» menu, so no «Corregir respuesta» behind it).
 await expect(page.getByRole('region',{name:'Comunicación',exact:true}).getByRole('button',{name:'Registrar',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/^Más acciones · /})).toHaveCount(0);
 await expect(page.getByText('Registrar una llamada',{exact:true})).toHaveCount(0);
});

test('a colleague does not get the management of an archived business',async({page})=>{
 await mock(page,colleague);
 await page.goto('/sales/301');
 await expect(page.getByText('Esta gestión no está disponible',{exact:false})).toBeVisible();
 await expect(page.getByTestId('archived-management-banner')).toHaveCount(0);
});
