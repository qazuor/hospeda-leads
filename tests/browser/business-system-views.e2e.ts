import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {basePreferences} from '../../src/helpers/businessListPreferences';
for(const width of [1280,390])test(`system views coexist with personal views at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.addInitScript(preferences=>{
  localStorage.setItem('hospeda-live-mode','off');localStorage.setItem('hospeda-business-seller-default-v1-user-3','1');
  localStorage.setItem('hospeda-business-list-v1-user-3',JSON.stringify({preferences,context:{page:1,scrollY:0,scrollX:0}}));
 },{...basePreferences(),columns:['nombre','ciudad','telefono','actions'],pins:{nombre:'left',ciudad:'right',actions:'right'}});
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'viewer@example.com',displayName:'Viewer',role:'user'}};
  else if(url.pathname.endsWith('/business_list_defaults'))data={defaults:null};
  else if(url.pathname.endsWith('/settings'))data={users:[],cities:[],types:[],templates:[],subtypes:[],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/saved_views'))data={views:[{id:'personal-mine',name:'Mis negocios',config:{entity:'business',preferences:{...basePreferences(),query:'personal',filters:[{rules:[{field:'ciudad',operator:'eq',value:'Colón'}]}]}}}]};
  else if(url.pathname.endsWith('/leads'))data={rows:[1,2,3].map(id=>({id:String(-id),accountId:String(id),nombre:`Negocio ${id}`,ciudad:'Colón',telefono:'123',canModify:id!==2,opportunityCount:0,contactCount:0})),total:3,page:1,pageSize:25,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts');await expect(page.locator('tbody tr[data-business-id]')).toHaveCount(3);

 const selector=page.getByRole('region',{name:'Vistas guardadas',exact:true});
 await expect(selector.locator('[data-view-id^="system:"]')).toHaveCount(7);
 await expect(selector.locator('[data-view-id^="personal:"]')).toHaveCount(1);
 const mine=page.waitForRequest(r=>{const url=new URL(r.url());return url.pathname.endsWith('/leads')&&(url.searchParams.get('filterGroups')??'').includes('viewer@example.com');});
 await selector.locator('[data-view-id="system:mine"]').click();await mine;
 const personal=page.waitForRequest(r=>new URL(r.url()).searchParams.get('q')==='personal');await selector.locator('[data-view-id="personal:personal-mine"]').click();await personal;
 await expect(page.getByRole('textbox',{name:'Buscar negocios'})).toHaveValue('personal');
 await expect(page.getByRole('status').filter({hasText:'Mis negocios'})).toBeVisible();await expect(page.getByRole('button',{name:/Cambiar valor del filtro/})).toHaveCount(0);await expect(page.locator('[aria-label="Filtros aplicados"]')).toContainText('Sin filtros agregados manualmente');
 await selector.locator('[data-view-id="system:all"]').click();await expect(page.getByRole('textbox',{name:'Buscar negocios'})).toHaveValue('');
 await expect(selector.locator('[aria-pressed="true"]')).toHaveCount(1);const manager=page.getByRole('button',{name:'Administrar tus vistas',exact:true}),reset=page.getByRole('button',{name:'Restablecer configuraciones por defecto',exact:true});expect(Math.abs((await manager.boundingBox())!.y-(await reset.boundingBox())!.y)).toBeLessThanOrEqual(2);
 await selector.locator('[data-view-id="personal:personal-mine"]').click();await expect(page.getByRole('textbox',{name:'Buscar negocios'})).toHaveValue('personal');
 await page.getByRole('textbox',{name:'Buscar negocios'}).fill('manual');const activeStatus=page.getByRole('status').filter({hasText:'Mis negocios'});await expect(activeStatus).toBeVisible();await expect(activeStatus).toContainText('Vista: Mis negocios');const manualFilter=page.getByRole('button',{name:/Cambiar valor del filtro Texto libre/});await expect(manualFilter).toBeVisible();await expect(page.getByRole('button',{name:/Cambiar valor del filtro Ciudad/})).toHaveCount(0);await expect(page.locator('[aria-label="Filtros aplicados"]')).not.toContainText('personal');
 const statusBox=await activeStatus.boundingBox(),filterBox=await manualFilter.boundingBox();expect(statusBox&&filterBox).toBeTruthy();expect(Math.abs((statusBox!.y+statusBox!.height/2)-(filterBox!.y+filterBox!.height/2))).toBeLessThanOrEqual(2);await page.screenshot({path:`test-results/business-active-view-filters-${width}.png`,animations:'disabled'});
 await reset.click();await expect(selector.locator('[aria-pressed="true"]')).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:'Vista:'})).toHaveCount(0);
 await page.screenshot({path:`test-results/business-system-views-${width}.png`,animations:'disabled'});
});
for(const role of ['user','admin'])test(`empty state starts ${role==='user'?'on Mis negocios':'on Todos'} for a ${role}`,async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 const requests:string[]=[];
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'viewer@example.com',displayName:'Viewer',role}};
  else if(url.pathname.endsWith('/business_list_defaults'))data={defaults:null};
  else if(url.pathname.endsWith('/settings'))data={users:[],cities:[],types:[],templates:[],subtypes:[],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/saved_views'))data={views:[]};
  else if(url.pathname.endsWith('/leads')){requests.push(url.searchParams.get('filterGroups')??'');data={rows:[{id:'-1',accountId:'1',nombre:'Negocio 1',ciudad:'Colón',telefono:'123',canModify:true,opportunityCount:0,contactCount:0}],total:1,page:1,pageSize:25,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};}
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts');await expect(page.locator('tbody tr[data-business-id]')).toHaveCount(1);
 const status=page.getByRole('status').filter({hasText:'Vista:'});
 if(role==='user'){await expect(status).toContainText('Mis negocios');expect(requests.every(r=>r.includes('viewer@example.com'))).toBe(true);await expect(page.getByRole('columnheader',{name:'Último contacto'})).toBeVisible();await expect(page.getByRole('columnheader',{name:'Revisados'})).toHaveCount(0);}
 else{await expect(status).toHaveCount(0);expect(requests.some(r=>r.includes('viewer@example.com'))).toBe(false);}
});
test('an existing seller gets Mis negocios once, keeping their columns, and can leave it',async({page})=>{
 await page.addInitScript(preferences=>{localStorage.setItem('hospeda-live-mode','off');if(!localStorage.getItem('hospeda-business-list-v1-user-3'))localStorage.setItem('hospeda-business-list-v1-user-3',JSON.stringify({preferences,context:{page:1,scrollY:0,scrollX:0}}));},{...basePreferences(),columns:['nombre','ciudad','actions']});
 const requests:string[]=[];
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'viewer@example.com',displayName:'Viewer',role:'user'}};
  else if(url.pathname.endsWith('/business_list_defaults'))data={defaults:null};
  else if(url.pathname.endsWith('/settings'))data={users:[],cities:[],types:[],templates:[],subtypes:[],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/saved_views'))data={views:[]};
  else if(url.pathname.endsWith('/leads')){requests.push(url.searchParams.get('filterGroups')??'');data={rows:[{id:'-1',accountId:'1',nombre:'Negocio 1',ciudad:'Colón',telefono:'123',canModify:true,opportunityCount:0,contactCount:0}],total:1,page:1,pageSize:25,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};}
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts');await expect(page.locator('tbody tr[data-business-id]')).toHaveCount(1);
 await expect(page.getByRole('status').filter({hasText:'Vista:'})).toContainText('Mis negocios');expect(requests.every(r=>r.includes('viewer@example.com'))).toBe(true);
 await expect(page.getByRole('columnheader',{name:'Ciudad'})).toBeVisible();await expect(page.getByRole('columnheader',{name:'Teléfono'})).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('hospeda-business-seller-default-v1-user-3'))).toBe('1');
 await page.getByRole('button',{name:'Restablecer configuraciones por defecto',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Vista:'})).toHaveCount(0);
 await page.reload();await expect(page.locator('tbody tr[data-business-id]')).toHaveCount(1);await expect(page.getByRole('status').filter({hasText:'Vista:'})).toHaveCount(0);
});
