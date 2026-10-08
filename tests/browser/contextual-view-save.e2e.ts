import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {basePreferences} from '../../src/helpers/businessListPreferences';

for(const width of [1280,390])for(const role of ['user','admin'])test(`contextual view save, identity and system protection for ${role} at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 const initial=basePreferences();const config={entity:'business',extra:'preserve',preferences:{...initial,query:'Guardada',filters:[{rules:[{field:'ciudad',operator:'eq',value:'Colón'}]}]}};
 let views:any[]=[{id:'my-original',name:'Mi vista',config}],failUpdate=true;const mutations:any[]=[],errors:string[]=[];
 let release!:()=>void;const slow=new Promise<void>(resolve=>{release=resolve;});page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({initial,dark})=>{localStorage.setItem('hospeda-live-mode','off');if(dark)localStorage.setItem('hospeda-theme-mode','dark');if(!localStorage.getItem('hospeda-business-list-v1-user-3'))localStorage.setItem('hospeda-business-list-v1-user-3',JSON.stringify({preferences:initial,context:{page:1,scrollY:0,scrollX:0}}));},{initial,dark:width===390});
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={},status=200;
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'owner@example.com',displayName:'Owner',role}};
  else if(url.pathname.endsWith('/business_list_defaults'))data={defaults:null};
  else if(url.pathname.endsWith('/settings'))data={users:[],cities:[{id:'1',name:'Colón'},{id:'2',name:'Concordia'}],types:[],templates:[],subtypes:[],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/saved_views')){
   if(route.request().method()==='POST'){
    const input=superjson.parse<any>(route.request().postData()!);mutations.push(input);
    if(input.action==='update'&&failUpdate){failUpdate=false;status=400;data={error:'No pude actualizar. Volvé a intentarlo.'};}
    else if(input.action==='save'&&views.some(view=>view.name===input.view.name)){status=400;data={error:'Ya tenés una vista con ese nombre.'};}
    else{
     if(input.action==='update'&&mutations.filter(m=>m.action==='update').length===2)await slow;
     let view;
     if(input.action==='save'){view={...input.view,id:'copy-'+mutations.length};views.push(view);}
     else if(input.action==='update'){view={...input.view,id:input.id};views=views.map(v=>v.id===input.id?view:v);}
     else views=views.filter(v=>v.id!==input.id);
     data={ok:true,view};
    }
   }else data={views};
  }else if(url.pathname.endsWith('/leads'))data={rows:[],total:0,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  await route.fulfill({status,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts');const selector=page.getByRole('combobox',{name:'Vistas guardadas',exact:true}),search=page.getByRole('textbox',{name:'Buscar negocios',exact:true});
 // Without a selected view only creation is offered. Duplicate names keep the draft.
 await page.getByRole('button',{name:'Guardar como vista',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Guardar como vista',exact:true});
 await expect(dialog.getByRole('button',{name:'Actualizar la vista actual',exact:true})).toHaveCount(0);
 await dialog.getByRole('textbox',{name:'Nombre de la vista',exact:true}).fill('Mi vista');await dialog.getByRole('button',{name:'Guardar vista',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Ya tenés');await expect(dialog.getByRole('textbox')).toHaveValue('Mi vista');await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
 await selector.selectOption('personal:my-original');const save=page.getByRole('button',{name:'Guardar vista',exact:true});await expect(save).toBeDisabled();await expect(search).toHaveValue('Guardada');
 await search.fill('Cambio');await expect(save).toBeEnabled();await search.fill('Guardada');await expect(save).toBeDisabled();
 await page.getByRole('button',{name:'Grilla',exact:true}).click();await expect(save).toBeEnabled();await page.getByRole('button',{name:'Tabla',exact:true}).click();await expect(save).toBeDisabled();
 // Value-only badge edits mark the selected view dirty and persist across reload.
 await page.getByRole('button',{name:'Cambiar valor del filtro Ciudad es Colón',exact:true}).click();await page.getByRole('option',{name:'Concordia',exact:true}).click();await expect(save).toBeEnabled();
 await page.reload();await expect(selector).toHaveValue('personal:my-original');await expect(save).toBeEnabled();await expect(page.getByRole('button',{name:'Cambiar valor del filtro Ciudad es Concordia',exact:true})).toBeVisible();
 const beforeCancel=mutations.length;await save.click();dialog=page.getByRole('dialog',{name:'Guardar vista',exact:true});await expect(dialog.getByRole('button',{name:'Guardar como vista nueva',exact:true})).toBeVisible();
 await page.screenshot({path:`test-results/contextual-view-choice-${role}-${width}.png`,animations:'disabled'});
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(selector).toBeFocused();expect(mutations).toHaveLength(beforeCancel);
 await save.click();await dialog.getByRole('button',{name:'Actualizar la vista actual',exact:true}).click();dialog=page.getByRole('dialog',{name:'Actualizar vista',exact:true});await expect(dialog.getByText('Mi vista',{exact:true})).toBeVisible();await expect(dialog.getByRole('textbox')).toHaveCount(0);
 await dialog.getByRole('button',{name:'Actualizar vista',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('No pude actualizar');await expect(save).toBeEnabled();
 await dialog.getByRole('button',{name:'Actualizar vista',exact:true}).click();await expect(dialog.getByRole('button',{name:'Guardando vista…',exact:true})).toBeDisabled();await expect(dialog.getByRole('button',{name:'Cancelar',exact:true})).toBeDisabled();await expect(dialog.getByRole('button',{name:'Cerrar',exact:true})).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(dialog).toBeVisible();release();await expect(dialog).toHaveCount(0);await expect(save).toBeDisabled();await expect(selector).toHaveValue('personal:my-original');
 expect(mutations.filter(m=>m.action==='update')).toHaveLength(2);expect(views[0].id).toBe('my-original');expect(views[0].name).toBe('Mi vista');expect(views[0].config.extra).toBe('preserve');expect(views[0].config.preferences.filters[0].rules[0].value).toBe('Concordia');
 await page.reload();await expect(selector).toHaveValue('personal:my-original');await expect(save).toBeDisabled();
 // Saving a copy leaves the source untouched and activates the new identity.
 await search.fill('Copia');await save.click();await page.getByRole('dialog',{name:'Guardar vista',exact:true}).getByRole('button',{name:'Guardar como vista nueva',exact:true}).click();dialog=page.getByRole('dialog',{name:'Guardar como vista',exact:true});await dialog.getByRole('textbox',{name:'Nombre de la vista',exact:true}).fill('Mi copia');await dialog.getByRole('button',{name:'Guardar vista',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(save).toBeDisabled();const copied=views.find(view=>view.name==='Mi copia');await expect(selector).toHaveValue('personal:'+copied.id);expect(views[0].config.preferences.query).toBe('Guardada');
 // Rename and deletion act on the stable ID while keeping current list filters.
 await page.getByRole('button',{name:'Administrar tus vistas',exact:true}).click();await page.getByRole('button',{name:'Editar vista Mi copia',exact:true}).click();dialog=page.getByRole('dialog',{name:'Editar vista',exact:true});await dialog.getByRole('textbox',{name:'Nombre de la vista',exact:true}).fill('Renombrada');await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(page.getByRole('button',{name:'Editar vista Renombrada',exact:true})).toBeVisible();await page.getByRole('button',{name:'Listo',exact:true}).click();await expect(selector).toHaveValue('personal:'+copied.id);await expect(selector.locator('option:checked')).toHaveText('Renombrada');await expect(save).toBeDisabled();
 await page.screenshot({path:`test-results/contextual-view-saved-${role}-${width}.png`,animations:'disabled'});
 await page.getByRole('button',{name:'Administrar tus vistas',exact:true}).click();await page.getByRole('button',{name:'Eliminar vista Renombrada',exact:true}).click();dialog=page.getByRole('dialog',{name:'Eliminar vista',exact:true});await dialog.getByRole('button',{name:'Eliminar vista',exact:true}).click();await page.getByRole('button',{name:'Listo',exact:true}).click();await expect(selector).toHaveValue('');await expect(search).toHaveValue('Copia');await expect(page.getByRole('button',{name:'Guardar como vista',exact:true})).toBeEnabled();
 // System views can be copied, never updated through this action (including admin).
 await selector.selectOption('system:mine');const systemSave=page.getByRole('button',{name:'Guardar como vista',exact:true});await expect(systemSave).toBeDisabled();await search.fill('Personalización');await systemSave.click();dialog=page.getByRole('dialog',{name:'Guardar como vista',exact:true});await expect(dialog.getByRole('button',{name:'Actualizar la vista actual',exact:true})).toHaveCount(0);await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();expect(mutations.every(m=>!m.id?.startsWith('system:'))).toBe(true);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);expect(errors).toEqual([]);
});
