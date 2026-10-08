import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {basePreferences} from '../../src/helpers/businessListPreferences';
test.use({hasTouch:true});
for(const width of [1280,390])test(`view badges preserve selection during inline actions and overflow at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});const initial=basePreferences();
 let views=Array.from({length:12},(_,i)=>({id:'view-'+i,name:i===11?'Una vista con un nombre largo para verificar el espacio y la accesibilidad':'Personal '+i,config:{entity:'business',preferences:{...initial,query:'Consulta '+i}}}));
 const requests:any[]=[];let failRename=true;
 await page.addInitScript(prefs=>{localStorage.setItem('hospeda-live-mode','off');if(!localStorage.getItem('hospeda-business-list-v1-user-3'))localStorage.setItem('hospeda-business-list-v1-user-3',JSON.stringify({preferences:prefs,context:{page:1,scrollY:0,scrollX:0}}));},initial);
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;let data:unknown={},status=200;
  if(path.endsWith('/auth/session'))data={user:{id:3,email:'viewer@example.com',displayName:'Viewer',role:'user'}};
  else if(path.endsWith('/business_list_defaults'))data={defaults:null};
  else if(path.endsWith('/settings'))data={users:[],cities:[],types:[],templates:[],subtypes:[],authorizedEmails:[],opportunityStages:[]};
  else if(path.endsWith('/saved_views')){
   if(route.request().method()==='POST'){const input=superjson.parse<any>(route.request().postData()!);requests.push(input);
    if(input.action==='update'&&failRename){failRename=false;status=400;data={error:'No pude guardar el nombre.'};}
    else if(input.action==='update'){const view={...input.view,id:input.id};views=views.map(v=>v.id===input.id?view:v);data={ok:true,view};}
    else{views=views.filter(v=>v.id!==input.id);data={ok:true};}
   }else data={views};
  }else if(path.endsWith('/leads'))data={rows:[],total:0,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  await route.fulfill({status,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts');const row=page.getByRole('region',{name:'Vistas guardadas',exact:true});const search=page.getByRole('textbox',{name:'Buscar negocios',exact:true});
 await expect(row.getByRole('group',{name:'Tus vistas',exact:true}).locator('[data-view-id]')).toHaveCount(12);
 await expect(row.getByRole('button',{name:'Más vistas',exact:true})).toBeEnabled();const scroller=row.locator('.mantine-ScrollArea-viewport');await row.getByRole('button',{name:'Más vistas',exact:true}).click();await expect.poll(()=>scroller.evaluate(el=>el.scrollLeft)).toBeGreaterThan(100);await row.getByRole('button',{name:'Vistas anteriores',exact:true}).click();await expect.poll(()=>scroller.evaluate(el=>el.scrollLeft)).toBeLessThanOrEqual(1);
 await expect(row.getByRole('group',{name:'Vistas del sistema',exact:true}).getByRole('button',{name:/Editar|Eliminar/})).toHaveCount(0);
 const last=row.locator('[data-view-id="personal:view-11"]');await last.focus();await page.keyboard.press('Enter');await expect(last).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Tab');await expect(row.getByRole('button',{name:'Editar vista '+views[11].name,exact:true})).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(last).toBeFocused();await expect(search).toHaveValue('Consulta 11');await expect(page.getByRole('status').filter({hasText:'Vista activa:'})).toContainText(views[11].name);
 await page.reload();await expect(last).toHaveAttribute('aria-pressed','true');const viewport=row.locator('.mantine-ScrollArea-viewport');await expect.poll(()=>viewport.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);await expect.poll(()=>last.evaluate(button=>{const badge=button.closest('[data-view-badge]')!.getBoundingClientRect(),viewport=button.closest('.mantine-ScrollArea-viewport')!.getBoundingClientRect();return badge.left>=viewport.left-1&&badge.right<=viewport.right+1;})).toBe(true);await page.screenshot({path:`test-results/view-badges-active-${width}.png`,animations:'disabled'});
 // Editing an inactive view through its badge never applies its stored query.
 const edit=row.getByRole('button',{name:'Editar vista Personal 0',exact:true});await edit.focus();await expect(edit.locator('..')).toHaveCSS('opacity','1');await page.keyboard.press('Enter');let dialog=page.getByRole('dialog',{name:'Editar vista',exact:true});
 await expect(search).toHaveValue('Consulta 11');await expect(last).toHaveAttribute('aria-pressed','true');await dialog.getByRole('textbox').fill('Renombrada');await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('No pude guardar');await expect(dialog.getByRole('textbox')).toHaveValue('Renombrada');await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(row.getByRole('button',{name:'Editar vista Renombrada',exact:true})).toBeFocused();await expect(search).toHaveValue('Consulta 11');expect(views[0].config.preferences.query).toBe('Consulta 0');
 const remove=row.getByRole('button',{name:'Eliminar vista '+views[11].name,exact:true});if(width===390)await remove.tap();else await remove.click();dialog=page.getByRole('dialog',{name:'Eliminar vista',exact:true});await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(remove).toBeFocused();expect(requests.filter(r=>r.action==='delete')).toHaveLength(0);
 await remove.click();await dialog.getByRole('button',{name:'Eliminar vista',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(row.locator('[aria-pressed="true"]')).toHaveCount(0);await expect(search).toHaveValue('Consulta 11');await expect(page.getByRole('button',{name:'Administrar tus vistas',exact:true})).toBeFocused();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await page.screenshot({path:`test-results/view-badges-${width}.png`,animations:'disabled'});
});
