import {test,expect} from '@playwright/test';
import superjson from 'superjson';

for(const width of [1280,390])test(`Referente WhatsApp models can be saved and historical scope stays explicit at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const writes:any[]=[];
 const historical={id:'31',name:'Modelo histórico',channel:'whatsapp',body:'<p>Hola {{name}}</p>',subject:null,vertical:'Alojamiento',commercialProfile:'Referente'};
 const settings={users:[],cities:[],types:['Alojamientos','Gastronomía'],templates:[historical],subtypes:[],authorizedEmails:[],opportunityStages:[]};
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  let data:unknown={};
  if(path.endsWith('/auth/session'))data={user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}};
  else if(path.endsWith('/settings'))data=settings;
  else if(path.endsWith('/leads'))data={rows:[],total:0,page:1,pageSize:100};
  else if(path.endsWith('/settings_save')){writes.push(superjson.parse(route.request().postData()!));data={ok:true};}
  await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/settings?section=templates');
 await page.getByRole('combobox',{name:'Perfil comercial',exact:true}).selectOption('Referente');
 await page.getByLabel('Nombre del modelo',{exact:true}).fill('Invitación por WhatsApp');
 await page.getByRole('textbox',{name:'Contenido del modelo',exact:true}).fill('Hola {{name}}, te presentamos Hospeda.');
 await expect(page.getByRole('button',{name:'Crear modelo',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Crear modelo',exact:true}).click();
 await expect.poll(()=>writes.length).toBe(1);
 expect(writes[0]).toMatchObject({action:'saveTemplate',channel:'whatsapp',commercialProfile:'Referente',vertical:null});
 await expect(page.getByLabel('Nombre del modelo',{exact:true})).toHaveValue('');
 await page.getByRole('button',{name:/^WhatsApp \d+$/}).click();
 await page.getByRole('button',{name:/Modelo histórico/}).click();
 await expect(page.getByRole('combobox',{name:'Vertical',exact:true})).toHaveValue('Alojamiento');
 await expect(page.getByText(/Este modelo usa una vertical histórica/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Guardar cambios',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await page.screenshot({path:`test-results/message-model-${width}.png`,fullPage:true});
});

test('selector offers Referente WhatsApp and explains models excluded by explicit segmentation',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const account={id:'101',nombre:'Negocio de prueba',email:'fixture@example.com',telefono:'5493442000003',ciudad:'Colón',assignedUserEmail:'owner@example.com',commercialStatus:'prospect',archivedAt:null,mergedIntoId:null};
 const lead={id:'201',accountId:'101',nombre:account.nombre,opportunityName:'Presentación',tipo:'Gastronomía',commercialProfile:'Referente',estado:'Cargado',assignedUserEmail:'owner@example.com',deletedAt:null};
 const models=[
  {id:'1',name:'Institucional por WhatsApp',channel:'whatsapp',vertical:'Gastronomía',commercialProfile:'Referente',subject:null,body:'<p>Hola {{name}}</p>'},
  {id:'2',name:'Modelo general',channel:'whatsapp',vertical:null,commercialProfile:null,subject:null,body:'<p>Hola</p>'},
  {id:'3',name:'Modelo de otro perfil',channel:'whatsapp',vertical:null,commercialProfile:'Consolidado',subject:null,body:'<p>Hola</p>'}
 ];
 const writes:any[]=[];
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;let data:unknown={};
  if(path.endsWith('/auth/session'))data={user:{id:3,email:'owner@example.com',displayName:'Owner',role:'user'}};
  else if(path.endsWith('/settings'))data={users:[],cities:[],types:['Gastronomía'],subtypes:[],templates:models,authorizedEmails:[],opportunityStages:[]};
  else if(path.endsWith('/commercial'))data={account,opportunities:[lead],contacts:[],journal:[],leadJournal:[],stages:[],users:[]};
  else if(path.endsWith('/work'))data={activities:[],tasks:[],types:[],users:[],attention:[],contacts:[]};
  else if(path.endsWith('/pipeline'))data={stages:[{name:'Cargado',classification:'open'}],insights:[],events:[],objections:[],lossReasons:[],objectionTypes:[],rules:[],users:[],verticals:[]};
  else if(path.endsWith('/communication')){
   if(route.request().method()==='POST'){
    const input=superjson.parse<any>(route.request().postData()!);writes.push(input);
    data={id:input.id,accountId:'101',leadId:'201',contactId:null,channel:'whatsapp',recipient:account.telefono,recipientName:'',subject:'',body:'Hola Negocio de prueba',status:'draft',revision:1,ownerEmail:'owner@example.com',createdAt:new Date(),updatedAt:new Date(),textBody:null,htmlBody:null,templateSnapshot:null};
   }else data={restrictions:[],messages:[],recentMessages:[],sequences:[],runs:[],recentContactHours:24};
  }
  await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts/101');
 await page.getByRole('button',{name:'Contactar',exact:true}).click();
 await page.getByRole('button',{name:'Continuar con el mensaje',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('button',{name:/Institucional por WhatsApp/})).toBeEnabled();
 await expect(dialog.getByRole('button',{name:/Modelo general/})).toBeVisible();
 await expect(dialog.getByRole('button',{name:/Modelo de otro perfil/})).toHaveCount(0);
 await expect(dialog.getByText(/1 modelo de este canal no coincide/)).toBeVisible();
 await dialog.getByLabel('Buscar mensaje modelo').fill('gastronomia');await expect(dialog.getByRole('button',{name:/Institucional por WhatsApp/})).toBeVisible();await expect(dialog.getByRole('button',{name:/Modelo general/})).toHaveCount(0);await dialog.getByLabel('Buscar mensaje modelo').fill('');
 await dialog.getByRole('button',{name:/Institucional por WhatsApp/}).click();
 await expect.poll(()=>writes.length).toBe(1);
 expect(writes[0]).toMatchObject({action:'prepare',templateId:'1',channel:'whatsapp'});
 await expect(dialog.getByRole('textbox',{name:'Mensaje final',exact:true})).toBeVisible();
});
