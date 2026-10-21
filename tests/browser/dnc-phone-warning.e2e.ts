import {test,expect,type Page} from '@playwright/test';
import superjson from 'superjson';
import {basePreferences} from '../../src/helpers/businessListPreferences';
import {localDay} from '../../src/helpers/workDates';
import {waitForTransitions} from './support/transitions';

// Decision D2: a person whose phone is exactly a No contactar business's phone gets a NON-blocking notice at contact time. The API is mocked.
const NOTE='Teléfono de un negocio No contactar',TEXT='Este teléfono es de un negocio que pidió no ser contactado: Hostería Silenciosa (Colón).';
const account={id:'1',nombre:'Negocio de prueba',ciudad:'Concepción',assignedUserEmail:'owner@example.com',tipo:'Alojamientos',status:'reviewed',doNotContact:false,isClient:false,archivedAt:null,recontactAt:null,telefono:'3442000001',whatsapp:'3442000001',email:'fixture@example.com'};
const contacts=[
 {id:'21',accountId:'1',name:'Ana Silenciada',phone:'3445123456',email:null,isPrimary:true,deletedAt:null,dncPhoneBusinesses:[{nombre:'Hostería Silenciosa',ciudad:'Colón'}]},
 {id:'22',accountId:'1',name:'Leo Libre',phone:'3445999999',email:null,isPrimary:false,deletedAt:null,dncPhoneBusinesses:[]},
];
async function mock(page:Page,extra:Record<string,unknown>={}){
 const writes:string[]=[];
 await page.addInitScript(({preferences})=>{localStorage.setItem('hospeda-live-mode','off');localStorage.setItem('hospeda-business-list-v1-user-3',JSON.stringify({preferences,context:{page:1,scrollY:0,scrollX:0}}))},{preferences:{...basePreferences(),columns:['nombre','actions'],pins:{}}});
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());if(route.request().method()!=='GET')writes.push(url.pathname);
  let data:unknown={};const p=url.pathname;
  if(p.endsWith('/auth/session'))data={user:{id:3,email:'owner@example.com',displayName:'Owner',role:'user'}};
  else if(p.endsWith('/business_list_defaults'))data={defaults:null};
  else if(p.endsWith('/saved_views'))data={views:[]};
  else if(p.endsWith('/settings'))data={users:[],cities:[],types:[],subtypes:[],contactChannels:['WhatsApp','Email'],templates:[],authorizedEmails:[],opportunityStages:[]};
  else if(p.endsWith('/commercial'))data={account,opportunities:[],contacts,journal:[],leadJournal:[],stages:[],users:[]};
  else if(p.endsWith('/communication'))data={recentMessages:[],messages:[],resources:[],restrictions:[],activeRestrictions:[],responses:[],openManagements:[],recentContactHours:72};
  else if(p.endsWith('/pipeline'))data={stages:[{name:'Cargado',classification:'open'}]};
  else if(p.endsWith('/leads'))data={rows:[{...account,accountId:'1',canModify:true,opportunityCount:0,contactCount:2}],total:1,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  else if(p.endsWith('/work'))data={tasks:[],activities:[],types:[],accounts:[],opportunities:[],contacts:[],users:[],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalTasks:0,totalActivities:0,page:1,bucketCounts:{overdue:0,today:0,upcoming:0},cities:[],verticals:[],...extra};
  await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
 });
 return writes;
}
test('Contactar warns about a No contactar phone in the call panel and in the message step, and never blocks',async({page})=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const writes=await mock(page);
 await page.goto('/accounts');
 await page.getByRole('group',{name:'Acciones de Negocio de prueba'}).getByRole('button',{name:'Contactar',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Contactar',exact:true});await expect(dialog.getByText(/Sin gestiones abiertas/)).toBeVisible();
 await dialog.getByLabel('Canal',{exact:true}).selectOption('call');await waitForTransitions(page);
 await dialog.getByLabel('¿A quién llamás?').selectOption('22');await expect(dialog.getByRole('note',{name:NOTE})).toHaveCount(0);
 await dialog.getByLabel('¿A quién llamás?').selectOption('21');
 await expect(dialog.getByRole('note',{name:NOTE})).toContainText(TEXT);await expect(dialog.getByRole('note',{name:NOTE})).toContainText('No uses este teléfono para contactar sin consultar a un administrador.');
 await expect(dialog.getByLabel('Número a llamar')).toHaveText('3445123456');
 await expect(dialog.getByRole('button',{name:'Copiar número',exact:true})).toBeEnabled();
 // The notice does not block the message either: it shows up where the recipient is chosen.
 await dialog.getByLabel('Canal',{exact:true}).selectOption('whatsapp');await dialog.getByRole('button',{name:'Continuar con el mensaje',exact:true}).click();
 const step=page.getByRole('dialog');await step.getByLabel('Persona de contacto').selectOption('21');
 await expect(step.getByRole('note',{name:NOTE})).toContainText(TEXT);await expect(step.getByRole('button',{name:/Preparar|Crear|Continuar/}).first()).toBeEnabled();
 await step.getByLabel('Persona de contacto').selectOption('22');await expect(step.getByRole('note',{name:NOTE})).toHaveCount(0);
 expect(writes).toEqual([]);expect(errors).toEqual([]);
});
test('a task Contactar dialog warns once about the chosen person phone and still lets the seller contact',async({page})=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const task={id:'1',accountId:'1',leadId:null,title:'Llamar a Ana',purpose:'commercial',typeId:'call',assignedUserEmail:'owner@example.com',dueDate:localDay(),dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:[],accountName:account.nombre,opportunityName:null};
 const writes=await mock(page,{tasks:[task],totalTasks:1,bucketCounts:{overdue:0,today:1,upcoming:0}});
 await page.goto('/my-day');await page.locator('article').filter({has:page.getByText(task.title,{exact:true})}).getByRole('button',{name:'Contactar',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Destinatario').selectOption('21');
 const notes=dialog.getByRole('note',{name:NOTE});await expect(notes).toHaveCount(1);await expect(notes).toContainText(TEXT);
 await expect(dialog.getByRole('button',{name:'Preparar WhatsApp con un mensaje modelo',exact:true})).toBeEnabled();
 await expect(dialog.getByRole('button',{name:'Copiar número',exact:true})).toBeEnabled();await expect(dialog.getByRole('button',{name:'Ya llamé: anotar cómo salió',exact:true})).toBeEnabled();
 await dialog.getByLabel('Destinatario').selectOption('22');await expect(dialog.getByRole('note',{name:NOTE})).toHaveCount(0);
 expect(writes).toEqual([]);expect(errors).toEqual([]);
});
