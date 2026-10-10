import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {basePreferences} from '../../src/helpers/businessListPreferences';

for(const theme of ['light','dark'])test(`business headers highlight the entire column in ${theme} mode`,async({page})=>{
 await page.setViewportSize({width:1280,height:844});
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
 if(theme==='dark')await page.evaluate(()=>document.body.classList.add('dark'));
 const headers=page.locator('thead th'),cells=page.locator('tbody tr[data-business-id]');
 const background=(index:number)=>cells.evaluateAll((rows,index)=>rows.map(row=>getComputedStyle(row.children[index]).backgroundColor),index);
 const original=await background(2);expect(original[0]).not.toBe(original[1]);
 // Both fixed sides and ordinary columns share the highlight; leaving restores the stripes.
 for(const index of [1,2,3,0,4]){
  await headers.nth(index).hover();
  const color=await headers.nth(index).evaluate(cell=>getComputedStyle(cell).backgroundColor);
  await expect.poll(()=>background(index)).toEqual([color,color,color]);
  await expect.poll(()=>background(index===2?3:2)).not.toEqual([color,color,color]);
  if(index===2){
   await expect(cells.first().locator('td').nth(index)).toHaveCSS('position','sticky');
   await expect(headers.nth(index).getByRole('button')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
   await page.screenshot({path:`test-results/business-column-hover-${theme}.png`,animations:'disabled'});
  }
  await page.getByRole('heading',{name:'Negocios',exact:true}).hover();
  await expect.poll(()=>background(2)).toEqual(original);
 }
 const sort=headers.nth(1).getByRole('button');await sort.focus();await sort.press('Tab');await page.keyboard.press('Shift+Tab');await expect(sort).toBeFocused();
 await expect(sort).toHaveCSS('outline-style','solid');expect(await sort.evaluate(el=>parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThan(0);
 await sort.press('Enter');await expect(headers.nth(1)).toHaveAttribute('aria-sort','descending');
 await cells.first().getByRole('checkbox').check();await expect(page.getByRole('checkbox',{name:'Deseleccionar todos',exact:true})).toHaveJSProperty('indeterminate',true);await page.getByRole('checkbox',{name:'Deseleccionar todos',exact:true}).click();await expect(cells.locator('input:checked')).toHaveCount(0);await page.getByRole('checkbox',{name:'Seleccionar todos los negocios cargados',exact:true}).check();await expect(cells.locator('input:checked')).toHaveCount(2);await expect(cells.nth(1).getByRole('checkbox')).toBeDisabled();await page.getByRole('checkbox',{name:'Deseleccionar todos',exact:true}).click();await expect(cells.locator('input:checked')).toHaveCount(0);
 expect((await cells.first().boundingBox())!.height).toBeLessThanOrEqual(64);
});
