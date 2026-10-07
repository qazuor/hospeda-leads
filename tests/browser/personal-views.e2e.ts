import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {basePreferences} from '../../src/helpers/businessListPreferences';
for(const width of [1280,390])test(`manage personal views without changing the current list at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 const original={entity:'business',preferences:{...basePreferences(),query:'Guardada'}};
 let views=[{name:'Mi vista',config:original}],failUpdate=true;const mutations:any[]=[];let releaseUpdate!:()=>void;const slowUpdate=new Promise<void>(resolve=>{releaseUpdate=resolve;});
 await page.addInitScript(preferences=>{localStorage.setItem('hospeda-live-mode','off');localStorage.setItem('hospeda-business-list-v1-user-3',JSON.stringify({preferences,context:{page:1,scrollY:0,scrollX:0}}));},{...basePreferences(),query:'Actual'});
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={},status=200;
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'owner@example.com',role:'user',displayName:'Owner'}};
  else if(url.pathname.endsWith('/business_list_defaults'))data={defaults:null};
  else if(url.pathname.endsWith('/settings'))data={users:[],cities:[],types:[],templates:[],subtypes:[],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/saved_views')){
   if(route.request().method()==='POST'){
    const input=superjson.parse<any>(route.request().postData()!);mutations.push(input);
    if(input.action==='update'&&failUpdate){failUpdate=false;status=400;data={error:'No pude guardar la vista. Volvé a intentarlo.'};}
    else {if(input.action==='update'&&mutations.filter(m=>m.action==='update').length===2)await slowUpdate;if(input.action==='delete')views=views.filter(v=>v.name!==input.name);else if(input.action==='update')views=views.map(v=>v.name===input.name?input.view:v);else views.push(input.view);data={ok:true};}
   }else data={views};
  }else if(url.pathname.endsWith('/leads'))data={rows:[],total:0,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  await route.fulfill({status,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts');const search=page.getByRole('textbox',{name:'Buscar negocios',exact:true});await expect(search).toHaveValue('Actual');
 await page.getByRole('button',{name:'Administrar tus vistas',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Tus vistas',exact:true});await expect(dialog.getByRole('button',{name:'Editar vista Mi vista',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:/Editar vista Todos/})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Editar vista Mi vista',exact:true}).click();dialog=page.getByRole('dialog',{name:'Editar vista',exact:true});const name=dialog.getByRole('textbox',{name:'Nombre de la vista',exact:true});await name.fill('Renombrada');await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('No pude guardar');await expect(name).toHaveValue('Renombrada');await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(dialog.getByRole('button',{name:'Guardando vista…',exact:true})).toBeDisabled();await expect(dialog.getByRole('button',{name:'Cancelar',exact:true})).toBeDisabled();await expect(dialog.getByRole('button',{name:'Cerrar',exact:true})).toHaveCount(0);await page.keyboard.press('Escape');await expect(dialog).toBeVisible();releaseUpdate();dialog=page.getByRole('dialog',{name:'Tus vistas',exact:true});await expect(dialog.getByRole('button',{name:'Editar vista Renombrada',exact:true})).toBeVisible();expect(views[0].config).toEqual(original);
 await dialog.getByRole('button',{name:'Editar vista Renombrada',exact:true}).click();dialog=page.getByRole('dialog',{name:'Editar vista',exact:true});await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(page.getByRole('dialog',{name:'Tus vistas',exact:true})).toBeVisible();expect(views[0].config.preferences.query).toBe('Actual');
 await page.screenshot({path:`test-results/personal-views-${width}.png`,animations:'disabled'});
 await page.getByRole('button',{name:'Eliminar vista Renombrada',exact:true}).click();dialog=page.getByRole('dialog',{name:'Eliminar vista',exact:true});const before=mutations.length;await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();expect(mutations).toHaveLength(before);
 await page.getByRole('button',{name:'Eliminar vista Renombrada',exact:true}).click();await page.getByRole('dialog',{name:'Eliminar vista',exact:true}).getByRole('button',{name:'Eliminar vista',exact:true}).click();await expect(page.getByText('Todavía no guardaste vistas personales.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Listo',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Administrar tus vistas',exact:true})).toBeFocused();await expect(search).toHaveValue('Actual');await expect(page.getByRole('combobox',{name:'Vistas guardadas',exact:true}).locator('optgroup[label="Tus vistas"] option')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});
