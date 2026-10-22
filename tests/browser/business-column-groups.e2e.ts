import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {DEFAULT_BUSINESS_COLUMN_GROUPS,type BusinessColumnGroup} from '../../src/helpers/businessColumnGroups';
import {basePreferences} from '../../src/helpers/businessListPreferences';

test('admin creates a group, seller uses it, and deleting it preserves other columns',async({page})=>{
 let role:'admin'|'user'='admin',groups=structuredClone(DEFAULT_BUSINESS_COLUMN_GROUPS),delayGroups=true;
 const base=basePreferences(),initialDefaults={preferences:{...base,columns:[...base.columns,'group:contact'],widths:{...base.widths,'group:contact':240},pins:{...base.pins,'group:contact':'left' as const},sortBy:'group:contact'},presets:[],initialPresetId:null};const postedDefaults:{value?:typeof initialDefaults}={};
 const rows=[{id:'-1',accountId:'1',nombre:'Negocio de prueba',ciudad:'Colón',telefono:'343 555',email:'negocio@example.test',tipo:'Hospedaje',subtipo:'Cabañas',canModify:true,canModifyManagement:true,opportunityCount:0,contactCount:1}];
 await page.route('**/_api/**',async route=>{const request=route.request(),url=new URL(request.url());let data:unknown={};let status=200;
  if(url.pathname.endsWith('/auth/session'))data={user:{id:role==='admin'?1:2,email:role==='admin'?'admin@example.test':'seller@example.test',displayName:role==='admin'?'Admin':'Vendedora',role}};
  else if(url.pathname.endsWith('/business_list_defaults')){if(request.method()==='POST'){postedDefaults.value=superjson.parse<typeof initialDefaults>(request.postData()??'null');data={ok:true};}else data={defaults:initialDefaults};}
  else if(url.pathname.endsWith('/business_column_groups')){if(request.method()==='POST'){if(role!=='admin')status=403;else groups=superjson.parse<BusinessColumnGroup[]>(request.postData()??'[]');data={ok:true};}else{if(delayGroups){delayGroups=false;await new Promise(resolve=>setTimeout(resolve,800));}data={groups};}}
  else if(url.pathname.endsWith('/settings'))data={users:[],cities:['Colón'],types:['Hospedaje'],templates:[],subtypes:[{name:'Cabañas',typeName:'Hospedaje'}],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/leads'))data={rows,total:rows.length,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  else if(url.pathname.endsWith('/saved_views'))data={views:[]};
  else if(url.pathname.endsWith('/live_version'))data={versions:{}};
  await route.fulfill({status,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/settings?section=businesses');await expect(page.getByRole('status')).toContainText('Las preferencias guardadas se conservan');
 await page.getByRole('combobox',{name:'Presentación inicial'}).selectOption('grid');await page.getByRole('button',{name:'Guardar configuraciones por defecto',exact:true}).click();await expect(page.getByText('Configuraciones por defecto guardadas',{exact:true})).toBeVisible();expect(postedDefaults.value?.preferences.columns).toContain('group:contact');expect(postedDefaults.value?.preferences.widths['group:contact']).toBe(240);expect(postedDefaults.value?.preferences.pins['group:contact']).toBe('left');expect(postedDefaults.value?.preferences.sortBy).toBe('group:contact');await expect(page.getByRole('heading',{name:'Columnas agrupadas'})).toBeVisible();
 await page.getByRole('button',{name:'Crear grupo',exact:true}).click();await page.getByRole('textbox',{name:'Nombre del grupo Nuevo grupo',exact:true}).fill('Mi grupo');await page.getByRole('button',{name:'Guardar columnas agrupadas',exact:true}).click();await expect(page.getByText('Columnas agrupadas guardadas',{exact:true})).toBeVisible();const createdGroupId=groups.find(group=>group.name==='Mi grupo')!.id;
 role='user';await page.goto('/accounts');await expect(page.locator('[data-business-id="1"]')).toBeVisible();await page.getByRole('button',{name:'Columnas',exact:true}).click();await page.getByRole('checkbox',{name:'Mi grupo',exact:true}).check();await page.getByRole('button',{name:'Cerrar columnas',exact:true}).click();
 await expect(page.getByRole('columnheader',{name:'Mi grupo',exact:true})).toBeVisible();const groupedCell=page.getByRole('row').filter({hasText:'Negocio de prueba'}).locator('td').filter({has:page.locator('.groupCell')});await expect(groupedCell).toContainText('Colón');await expect(groupedCell).toContainText('Negocio de prueba');
 role='admin';await page.goto('/settings?section=businesses');await page.getByRole('button',{name:'Eliminar grupo Mi grupo',exact:true}).click();await page.getByRole('button',{name:'Guardar columnas agrupadas',exact:true}).click();await expect(page.getByText('Columnas agrupadas guardadas',{exact:true})).toBeVisible();
 role='user';await page.goto('/accounts');await expect(page.getByRole('columnheader',{name:'Ciudad',exact:true})).toBeVisible();await expect(page.getByRole('columnheader',{name:'Mi grupo',exact:true})).toHaveCount(0);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('hospeda-business-list-v1-user-2')??'null')?.preferences);expect(saved.columns).toContain('ciudad');expect(saved.columns).not.toContain('group:'+createdGroupId);
});

test('Negocios stays available while grouped column definitions are delayed or fail',async({page})=>{
 const base=basePreferences(),stored={...base,columns:[...base.columns,'group:contact'],widths:{...base.widths,'group:contact':240},pins:{...base.pins,'group:contact':'left' as const},sortBy:'group:contact'};
 let holdGroups=true,failGroups=false,release!:()=>void;const groupGate=new Promise<void>(resolve=>release=resolve),sortRequests:string[]=[];
 const rows=[{id:'-1',accountId:'1',nombre:'Negocio visible',ciudad:'Colón',contactName:'Ana',canModify:false,opportunityCount:0,contactCount:1}];
 await page.route('**/_api/**',async route=>{const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:8,email:'seller@example.test',displayName:'Vendedora',role:'user'}};
  else if(url.pathname.endsWith('/business_list_defaults'))data={defaults:null};
  else if(url.pathname.endsWith('/business_column_groups')){if(failGroups){await route.fulfill({status:500,body:superjson.stringify({error:'Grupos no disponibles'})});return;}if(holdGroups)await groupGate;data={groups:DEFAULT_BUSINESS_COLUMN_GROUPS};}
  else if(url.pathname.endsWith('/settings'))data={users:[],cities:[],types:[],templates:[],subtypes:[],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/leads')){sortRequests.push(url.searchParams.get('sortBy')??'');data={rows,total:rows.length,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};}
  else if(url.pathname.endsWith('/saved_views'))data={views:[]};
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.addInitScript(preferences=>{localStorage.setItem('hospeda-business-seller-default-v1-user-8','1');localStorage.setItem('hospeda-business-list-v1-user-8',JSON.stringify({preferences,context:{page:1,scrollY:0,scrollX:0}}));},stored);
 await page.goto('/accounts');await expect(page.locator('[data-business-id="1"]')).toBeVisible();await expect(page.getByRole('columnheader',{name:'Contacto',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('hospeda-business-list-v1-user-8')!).preferences.sortBy)).toBe('group:contact');
 expect(sortRequests.length).toBeGreaterThan(0);expect(sortRequests).not.toContain('group:contact');
 release();holdGroups=false;await expect(page.getByRole('columnheader',{name:'Contacto',exact:true})).toBeVisible();await expect.poll(()=>sortRequests.at(-1)).toBe('contactName');
 failGroups=true;await page.reload();await expect(page.locator('[data-business-id="1"]')).toBeVisible();await expect(page.getByRole('columnheader',{name:'Contacto',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('hospeda-business-list-v1-user-8')!).preferences.sortBy)).toBe('group:contact');
 expect(sortRequests.at(-1)).not.toBe('group:contact');
});
