import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {basePreferences} from '../../src/helpers/businessListPreferences';

test('a business keeps several verticals in its editor, list filter and new management',async({page})=>{
 await page.setViewportSize({width:1280,height:900});const account={id:'106',nombre:'Hostería y restaurante',tipo:'Alojamiento',subtipo:null,status:'reviewed',classifications:[{tipo:'Alojamiento',subtipo:null}],ciudad:'Concepción del Uruguay',assignedUserEmail:'admin@example.com',archivedAt:null,deletedAt:null,mergedIntoId:null,isClient:false};const writes:any[]=[];let classifications=account.classifications;
 await page.addInitScript(preferences=>{localStorage.setItem('hospeda-live-mode','off');localStorage.setItem('hospeda-business-list-v1-user-1',JSON.stringify({preferences,context:{page:1,scrollY:0,scrollX:0}}));},{...basePreferences(),columns:['nombre','tipo','actions']});
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());const path=url.pathname;let data:unknown={};
  if(path.endsWith('/auth/session'))data={user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}};
  else if(path.endsWith('/business_list_defaults'))data={defaults:null};
  else if(path.endsWith('/saved_views'))data={views:[]};
  else if(path.endsWith('/settings'))data={users:[{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}],cities:[{id:'1',name:'Concepción del Uruguay'}],types:['Alojamiento','Gastronomía'],subtypes:[],templates:[],authorizedEmails:[],opportunityStages:[]};
  else if(path.endsWith('/commercial')){
   if(route.request().method()==='POST'){const input=superjson.parse<any>(route.request().postData()!);writes.push(input);if(input.action==='account_save')classifications=input.classifications;data={id:'106'};}
   else if(url.searchParams.has('historyPage'))data={events:[],total:0,page:1,pending:[],totalPending:0};
   else data={account:{...account,classifications,tipo:classifications[0]?.tipo??null,subtipo:classifications[0]?.subtipo??null},contacts:[],opportunities:[],journal:[],leadJournal:[],stages:[],users:[]};
  }else if(path.endsWith('/leads')){
   const filterGroups=JSON.parse(url.searchParams.get('filterGroups')??'[]');const filtering=JSON.stringify(filterGroups).includes('Gastronomía');
   data={rows:!filtering||classifications.some(item=>item.tipo==='Gastronomía')?[{id:'-106',accountId:'106',...account,accountTipos:classifications.map(item=>item.tipo),accountSubtipos:classifications.flatMap(item=>item.subtipo?[item.subtipo]:[]),canModify:true,opportunityCount:0,contactCount:0}]:[],total:!filtering||classifications.some(item=>item.tipo==='Gastronomía')?1:0,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:['Alojamiento','Gastronomía'],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  }else if(path.endsWith('/pipeline'))data={stages:[],insights:[],events:[],objections:[],lossReasons:[],objectionTypes:[],rules:[],users:[],verticals:[]};
  else if(path.endsWith('/work'))data={tasks:[],activities:[],types:[],accounts:[],opportunities:[],contacts:[],users:[],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalTasks:0,totalActivities:0,page:1};
  await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts/106');await page.getByRole('button',{name:'Editar negocio',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Agregar otra vertical',exact:true}).click();await dialog.getByLabel('Vertical').first().selectOption('Alojamiento');await dialog.getByLabel('Vertical').nth(1).selectOption('Gastronomía');await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect.poll(()=>writes.length).toBe(1);expect(writes[0].classifications).toEqual([{tipo:'Alojamiento',subtipo:null},{tipo:'Gastronomía',subtipo:null}]);
 await expect(dialog).toHaveCount(0);await expect(page.getByText('Alojamiento',{exact:true}).first()).toBeVisible();await expect(page.getByText('Gastronomía',{exact:true}).first()).toBeVisible();
 await page.goto('/accounts');let row=page.locator('tr[data-business-id="106"]');await expect(row).toBeVisible();await expect(row.getByText('Alojamiento',{exact:true})).toBeVisible();await expect(row.getByText('+1',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Filtrar negocios',exact:true}).click();dialog=page.getByRole('dialog',{name:'Filtrar negocios',exact:true});await dialog.getByRole('button',{name:'Agregar otro filtro (y)',exact:true}).click();await dialog.getByRole('combobox',{name:'Campo del filtro'}).selectOption('tipo');await dialog.getByRole('combobox',{name:'Valor del filtro'}).selectOption('Gastronomía');await dialog.getByRole('button',{name:'Aplicar filtros',exact:true}).click();await expect(row).toBeVisible();
 await page.goto('/accounts/106');await page.getByRole('tab',{name:'Gestiones'}).click();await page.getByRole('button',{name:'Iniciar gestión',exact:true}).click();dialog=page.getByRole('dialog',{name:'Iniciar gestión',exact:true});const vertical=dialog.getByRole('combobox',{name:'¿Sobre qué vertical es esta gestión?',exact:true});await expect(vertical).toBeVisible();await expect(vertical.locator('option')).toHaveText(['Alojamiento','Gastronomía']);await vertical.selectOption('Gastronomía');await dialog.getByRole('button',{name:'Iniciar gestión',exact:true}).click();await expect.poll(()=>writes.filter(input=>input.action==='opportunity_save').length).toBe(1);expect(writes.find(input=>input.action==='opportunity_save')?.tipo).toBe('Gastronomía');
});
