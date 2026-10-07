import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {basePreferences} from '../../src/helpers/businessListPreferences';
for(const width of [1280,390])test(`business table ellipsis and fixed headers at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.addInitScript(preferences=>{
  localStorage.setItem('hospeda-live-mode','off');
  localStorage.setItem('hospeda-business-list-v1-user-3',JSON.stringify({preferences,context:{page:1,scrollY:0,scrollX:0}}));
 },{...basePreferences(),columns:['nombre','ciudad','telefono','email','sitioWeb','actions'],widths:{nombre:220,ciudad:150,telefono:100,email:100,sitioWeb:100,actions:110},pins:{nombre:'left',actions:'right'}});
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'viewer@example.com',displayName:'Viewer',role:'user'}};
  else if(url.pathname.endsWith('/business_list_defaults'))data={defaults:null};
  else if(url.pathname.endsWith('/settings'))data={users:[],cities:[],types:[],templates:[],subtypes:[],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/saved_views'))data={views:[]};
  else if(url.pathname.endsWith('/leads')){const current=Number(url.searchParams.get('page')??1);const first=(current-1)*50;data={rows:Array.from({length:current===1?50:20},(_,i)=>({id:String(-(first+i+1)),accountId:String(first+i+1),nombre:`Negocio ${first+i+1}`,ciudad:'Colón',telefono:'+54 3442 123456 789012',email:'correo-muy-largo-para-la-columna@example.com',sitioWeb:'https://hospeda.com.ar/ruta-muy-larga-para-la-columna',canModify:true,opportunityCount:0,contactCount:0})),total:70,page:current,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};}
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts');await expect(page.locator('tbody tr[data-business-id]')).toHaveCount(50);

 const row=page.locator('tbody tr[data-business-id]').first(),email=row.locator('td').nth(4).locator('div');
 await expect(email).toHaveCSS('white-space','nowrap');await expect(email).toHaveCSS('text-overflow','ellipsis');await expect(email).not.toHaveAttribute('title',/.+/);
 const horizontal=page.locator('section[aria-label="Resultados de negocios"] table').locator('..');
 await horizontal.evaluate(node=>node.scrollLeft=320);await email.hover();await expect(page.getByRole('tooltip')).toContainText('correo-muy-largo-para-la-columna@example.com');
 // Radix keeps the tooltip open while the pointer travels toward its content.
 // A second movement leaves that grace area instead of teleporting and stopping there.
 await page.mouse.move(0,0,{steps:10});await page.mouse.move(0,100,{steps:10});await expect(page.getByRole('tooltip')).toHaveCount(0);
 await email.focus();await expect(page.getByRole('tooltip')).toContainText('correo-muy-largo-para-la-columna@example.com');await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);
 await horizontal.evaluate(node=>window.scrollTo(0,window.scrollY+node.getBoundingClientRect().top+100));const floating=page.getByLabel('Encabezados fijos de negocios');await expect(floating).toBeVisible();
 const count=page.getByRole('status');await expect.poll(()=>count.locator('..').evaluate(node=>Math.round(node.getBoundingClientRect().top))).toBe(0);
 await expect.poll(()=>floating.evaluate(node=>Math.round(node.getBoundingClientRect().top))).toBe(await count.locator('..').evaluate(node=>Math.round(node.getBoundingClientRect().bottom)));
 await page.screenshot({path:`test-results/business-sticky-${width}.png`,animations:'disabled'});
 await page.getByRole('button',{name:'Pantalla completa',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Resultados de negocios en pantalla completa'});await expect(dialog).toBeVisible();
 const fullScroll=dialog.locator('table').locator('..');const windowY=await page.evaluate(()=>window.scrollY);const headerTop=await dialog.locator('thead th').first().boundingBox();
 await fullScroll.evaluate(node=>node.scrollTop=500);await expect.poll(()=>fullScroll.evaluate(node=>node.scrollTop)).toBe(500);
 expect(await page.evaluate(()=>window.scrollY)).toBe(windowY);await expect.poll(async()=>Math.round((await dialog.locator('thead th').first().boundingBox())!.y)).toBe(Math.round(headerTop!.y));
 await expect(dialog.getByRole('status')).toBeVisible();await page.screenshot({path:`test-results/business-table-scroll-fullscreen-${width}.png`,animations:'disabled'});
 await fullScroll.evaluate(node=>node.scrollTop=node.scrollHeight);await expect(dialog.locator('tbody tr[data-business-id]')).toHaveCount(70);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Pantalla completa',exact:true})).toBeFocused();
});
