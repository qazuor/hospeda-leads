import {test,expect} from '@playwright/test';
import superjson from 'superjson';
for(const width of [1280,390])test(`business deletion, CRM search and management chooser at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 const errors:string[]=[],writes:any[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{localStorage.setItem('hospeda-live-mode','off');localStorage.setItem('hospeda-theme-mode','light');});
 let deleted=true;
 const account={id:'1',nombre:'Café del puerto con nombre largo',ciudad:'Colón',assignedUserEmail:'admin@example.com',commercialStatus:'prospect',archivedAt:null,deletedAt:new Date('2026-10-01'),deletionReason:'Registro de prueba',deletedByEmail:'admin@example.com',opportunityCount:0,contactCount:0};
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;let data:any={};
  if(path.endsWith('/auth/session'))data={user:{id:3,email:'admin@example.com',displayName:'Fixture',role:'admin'}};
  else if(path.endsWith('/settings'))data={users:[],cities:[],types:[],subtypes:[],contactChannels:[],templates:[],authorizedEmails:[],opportunityStages:[]};
  else if(path.endsWith('/commercial')){
   if(route.request().method()==='POST'){writes.push(superjson.parse(route.request().postData()!));deleted=false;data={id:'1'};}
   else if(url.searchParams.has('accountId'))data={account:{...account,deletedAt:null},contacts:[],opportunities:[],journal:[],leadJournal:[],stages:[]};
   else data={rows:url.searchParams.get('deleted')==='true'&&!deleted?[]:[account],total:url.searchParams.get('deleted')==='true'&&!deleted?0:1,page:1};
  }else if(path.endsWith('/search'))data={results:[{id:'business:1',kind:'Negocios',label:account.nombre,description:'Colón',url:'/accounts/1'},{id:'note:2',kind:'Notas',label:'Café y reunión',description:account.nombre,url:'/sales/4'},{id:'file:3',kind:'Archivos',label:'Propuesta café.pdf',description:account.nombre,url:'/accounts/1?section=documents'}]};
  else if(path.endsWith('/leads'))data={rows:[],total:0,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  else if(path.endsWith('/saved_views'))data={views:[]};
  else if(path.endsWith('/work'))data={tasks:[],activities:[],journal:[],attention:[],accounts:[],opportunities:[],contacts:[],users:[],types:[],totalTasks:0,totalActivities:0,totalAttention:0,page:1};
  else if(path.endsWith('/leads_stats'))data={total:0,pendientes:0,suscriptos:0,vencidos:0,paraHoy:0,misPendientesHoy:0};
  else if(path.endsWith('/pipeline'))data={insights:[],events:[],objections:[],stages:[],rules:[],verticals:[],users:[],lossReasons:[],objectionTypes:[],reactivations:[],configJournal:[],total:0,page:1};
  else if(path.endsWith('/leads_trash'))data={rows:[],total:0,page:1,pageSize:50};
  await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/trash');await expect(page.getByText(account.nombre,{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Restaurar',exact:true}).click();const restore=page.getByRole('dialog',{name:'Restaurar negocio',exact:true});
 await expect(restore).toContainText('mantienen');await restore.getByRole('button',{name:'Restaurar negocio',exact:true}).click();
 await expect(restore).toHaveCount(0);await expect(page.getByText('No hay negocios en papelera.',{exact:true})).toBeVisible();expect(writes).toEqual([{action:'account_trash',accountIds:['1'],deleted:false,reason:'Restauración desde Papelera'}]);
 await page.getByText('Gestiones',{exact:true}).click();await expect(page.getByText('No hay gestiones en papelera.',{exact:true})).toBeVisible();
 await page.goto('/guide');await page.getByRole('button',{name:'Abrir accesos rápidos',exact:true}).click();
 const palette=page.getByRole('dialog',{name:'Accesos rápidos',exact:true}),search=palette.getByRole('textbox',{name:'Buscar opciones',exact:true});
 await search.fill('cafe');await expect(palette.locator('[data-command-option]')).toHaveCount(3);await expect(palette.getByRole('group',{name:'Archivos',exact:true})).toBeVisible();
 await search.press('ArrowDown');await expect(palette.locator('[data-command-option][data-selected]')).toContainText(account.nombre);
 await page.screenshot({path:`test-results/crm-search-${width}.png`,animations:'disabled'});
 await search.press('Enter');await expect(page).toHaveURL(/accounts\/1$/);await expect(palette).toHaveCount(0);
 await page.goto('/opportunities');await page.getByRole('button',{name:'Iniciar gestión',exact:true}).first().click();
 const chooser=page.getByRole('dialog',{name:'Iniciar gestión',exact:true});await expect(chooser.getByRole('button',{name:new RegExp(account.nombre)})).toBeVisible();
 await expect(chooser.getByText('0 gestiones')).toHaveCount(0);await page.screenshot({path:`test-results/start-management-${width}.png`,animations:'disabled'});
 const bounds=await chooser.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right};});expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.right).toBeLessThanOrEqual(width);
 await chooser.getByRole('button',{name:'Cancelar',exact:true}).click();expect(writes).toHaveLength(1);expect(errors).toEqual([]);
});
