import {test,expect} from '@playwright/test';
import superjson from 'superjson';

test('personal view creation and contextual update persist through the real API',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/\/my-day$/);
 const name='Vista API '+Date.now();let id:string|undefined;
 try{
  await page.goto('/accounts');const search=page.getByRole('textbox',{name:'Buscar negocios',exact:true});await search.fill(name);
  await page.getByRole('button',{name:'Guardar como vista',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Guardar como vista',exact:true});await dialog.getByRole('textbox',{name:'Nombre de la vista',exact:true}).fill(name);
  const created=page.waitForResponse(response=>response.url().endsWith('/_api/saved_views')&&response.request().method()==='POST');await dialog.getByRole('button',{name:'Guardar vista',exact:true}).click();const creationResponse=await created;expect(creationResponse.ok()).toBe(true);const result=superjson.parse<any>(await creationResponse.text());id=result.view.id;expect(id).toBeTruthy();
  const selector=page.getByRole('region',{name:'Vistas guardadas',exact:true});await expect(selector.locator('[data-view-id="personal:'+id+'"]')).toHaveAttribute('aria-pressed','true');const save=page.getByRole('button',{name:'Guardar vista',exact:true});await expect(save).toBeDisabled();
  await search.fill(name+' modificada');await save.click();await page.getByRole('dialog',{name:'Guardar vista',exact:true}).getByRole('button',{name:'Actualizar la vista actual',exact:true}).click();
  const updated=page.waitForResponse(response=>response.url().endsWith('/_api/saved_views')&&response.request().method()==='POST');await page.getByRole('dialog',{name:'Actualizar vista',exact:true}).getByRole('button',{name:'Actualizar vista',exact:true}).click();const updateResponse=await updated;expect(updateResponse.ok()).toBe(true);expect(superjson.parse<any>(await updateResponse.text()).view.id).toBe(id);await expect(save).toBeDisabled();
  // Use the same browser transport as the app. Playwright 1.58's request
  // cookie filter excludes Secure cookies on HTTP 127.0.0.1 (Chromium accepts loopback).
  const response=await page.evaluate(async()=>{const response=await fetch('/_api/saved_views');return {status:response.status,body:await response.text()};});expect(response.status,response.body).toBe(200);const stored=superjson.parse<any>(response.body).views.find((view:any)=>view.id===id);expect(stored.name).toBe(name);expect(stored.config.preferences.query).toBe(name+' modificada');
  await page.reload();await expect(selector.locator('[data-view-id="personal:'+id+'"]')).toHaveAttribute('aria-pressed','true');await expect(search).toHaveValue(name+' modificada');await expect(save).toBeDisabled();
 }finally{
  if(id){const removed=await page.evaluate(async body=>{const response=await fetch('/_api/saved_views',{method:'POST',headers:{'Content-Type':'application/json'},body});return {status:response.status,body:await response.text()};},superjson.stringify({action:'delete',id,name}));expect(removed.status,removed.body).toBe(200);}
 }
});
