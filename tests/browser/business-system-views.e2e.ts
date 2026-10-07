import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {basePreferences} from '../../src/helpers/businessListPreferences';
for(const width of [1280,390])test(`system views coexist with personal views at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.addInitScript(preferences=>{
  localStorage.setItem('hospeda-live-mode','off');
  localStorage.setItem('hospeda-business-list-v1-user-3',JSON.stringify({preferences,context:{page:1,scrollY:0,scrollX:0}}));
 },{...basePreferences(),columns:['nombre','ciudad','telefono','actions'],pins:{nombre:'left',ciudad:'right',actions:'right'}});
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'viewer@example.com',displayName:'Viewer',role:'user'}};
  else if(url.pathname.endsWith('/business_list_defaults'))data={defaults:null};
  else if(url.pathname.endsWith('/settings'))data={users:[],cities:[],types:[],templates:[],subtypes:[],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/saved_views'))data={views:[{name:'Mis negocios',config:{entity:'business',preferences:{...basePreferences(),query:'personal'}}}]};
  else if(url.pathname.endsWith('/leads'))data={rows:[1,2,3].map(id=>({id:String(-id),accountId:String(id),nombre:`Negocio ${id}`,ciudad:'Colón',telefono:'123',canModify:id!==2,opportunityCount:0,contactCount:0})),total:3,page:1,pageSize:25,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts');await expect(page.locator('tbody tr[data-business-id]')).toHaveCount(3);

 const selector=page.getByRole('combobox',{name:'Vistas guardadas',exact:true});
 await expect(selector.locator('optgroup[label="Vistas del sistema"] option')).toHaveCount(6);
 await expect(selector.locator('optgroup[label="Tus vistas"] option')).toHaveCount(1);
 const mine=page.waitForRequest(r=>{const url=new URL(r.url());return url.pathname.endsWith('/leads')&&(url.searchParams.get('filterGroups')??'').includes('viewer@example.com');});
 await selector.selectOption('system:mine');await mine;
 await expect(page.getByText('viewer@example.com',{exact:false}).first()).toBeVisible();
 const personal=page.waitForRequest(r=>new URL(r.url()).searchParams.get('q')==='personal');await selector.selectOption('personal:Mis negocios');await personal;
 await expect(page.getByRole('textbox',{name:'Buscar negocios'})).toHaveValue('personal');
 await selector.selectOption('system:all');await expect(page.getByRole('textbox',{name:'Buscar negocios'})).toHaveValue('');
 await page.screenshot({path:`test-results/business-system-views-${width}.png`,animations:'disabled'});
});
