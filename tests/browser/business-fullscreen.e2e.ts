import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {basePreferences} from '../../src/helpers/businessListPreferences';
for(const width of [1280,390])test(`fullscreen isolates business results at ${width}px`,async({page})=>{
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
  else if(url.pathname.endsWith('/saved_views'))data={views:[]};
  else if(url.pathname.endsWith('/leads'))data={rows:[1,2,3].map(id=>({id:String(-id),accountId:String(id),nombre:`Negocio ${id}`,ciudad:'Colón',telefono:'123',canModify:id!==2,opportunityCount:0,contactCount:0})),total:3,page:1,pageSize:25,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts');await expect(page.locator('tbody tr[data-business-id]')).toHaveCount(3);

 const horizontal=page.locator('table').locator('..');
 await horizontal.evaluate(node=>node.scrollLeft=100);
 const previousX=await horizontal.evaluate(node=>node.scrollLeft);
 await page.getByRole('button',{name:'Pantalla completa',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Resultados de negocios en pantalla completa'});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Salir de pantalla completa'})).toBeFocused();
 await expect(dialog.getByRole('status')).toContainText('3 de 3 negocios cargados');
 await expect(dialog.locator('thead')).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Tabla',exact:true})).toBeVisible();
 await expect(dialog.getByRole('textbox',{name:'Buscar negocios'})).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'Filtrar negocios'})).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'Nuevo negocio'})).toHaveCount(0);
 const bounds=await dialog.boundingBox();expect(bounds!.x).toBe(0);expect(bounds!.y).toBe(0);expect(bounds!.width).toBe(width);expect(bounds!.height).toBe(844);
 await expect.poll(()=>horizontal.evaluate(node=>node.scrollLeft)).toBe(previousX);
 await page.screenshot({path:`test-results/business-fullscreen-${width}.png`,animations:'disabled'});
 await dialog.getByRole('button',{name:'Grilla',exact:true}).click();await expect(dialog.locator('article')).toHaveCount(3);
 await dialog.getByRole('button',{name:'Tabla',exact:true}).click();await expect(dialog.locator('tbody tr[data-business-id]')).toHaveCount(3);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Pantalla completa',exact:true})).toBeFocused();
 await expect(page.getByRole('textbox',{name:'Buscar negocios'})).toBeVisible();
 await page.getByRole('button',{name:'Pantalla completa',exact:true}).click();
 await page.getByRole('button',{name:'Salir de pantalla completa'}).click();await expect(dialog).toHaveCount(0);
});
