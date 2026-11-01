import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {localDay} from '../../src/helpers/workDates';
import {basePreferences} from '../../src/helpers/businessListPreferences';
test('contact and pending toasts open the saved record and navigation protects edits',async({page})=>{
 test.setTimeout(120000);await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 const text=await page.evaluate(async()=>await(await fetch('/_api/commercial',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({json:{action:'account_save',nombre:'Avisos claros '+Date.now(),assignedUserEmail:'admin@example.com'}})})).text());const accountId=superjson.parse<any>(text).id;
 await page.goto('/accounts/'+accountId);await page.getByRole('region',{name:'Próximo paso'}).getByRole('button',{name:'Agregar persona',exact:true}).click();await page.getByLabel('Nombre de la persona').fill('Ana de los avisos');await page.getByLabel('Email',{exact:true}).fill('ana@example.com');await page.getByRole('dialog').getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Ver persona',exact:true}).click();await expect(page).toHaveURL(/section=contacts&contactId=\d+/);await expect(page.locator('[data-contact-id]').filter({hasText:'Ana de los avisos'})).toBeFocused();
 await page.getByRole('region',{name:'Próximo paso'}).getByRole('button',{name:'Agendar tarea',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByLabel('Título',{exact:true}).fill('Revisar aviso de próximo paso');await dialog.getByLabel('Fecha de vencimiento').fill(localDay());await dialog.getByRole('button',{name:'Agendar tarea',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:'Ver en Hoy',exact:true}).click();await expect(page).toHaveURL(/my-day\?accountId=\d+&taskId=\d+/);const selected=page.getByRole('region',{name:'Pendiente seleccionado',exact:true});await expect(selected.getByText('Revisar aviso de próximo paso',{exact:true})).toBeVisible();await expect(selected.locator('[data-work-task]')).toBeFocused();
 await selected.getByRole('button',{name:'Más acciones de Revisar aviso de próximo paso',exact:true}).click();await page.getByRole('menuitem',{name:'Cambiar fecha o datos',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Título',{exact:true}).fill('No perder este cambio');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crm:navigate',{detail:'/accounts'})));await expect(page.getByRole('heading',{name:'Tenés cambios sin guardar',exact:true})).toBeVisible();const prompt=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Tenés cambios sin guardar',exact:true})});await prompt.getByRole('button',{name:'Descartar cambios y salir',exact:true}).focus();await page.keyboard.press('Tab');await expect.poll(()=>prompt.evaluate(element=>element.contains(document.activeElement))).toBe(true);await page.keyboard.press('Escape');await expect(prompt).toHaveCount(0);await expect(dialog.getByLabel('Título',{exact:true})).toHaveValue('No perder este cambio');await expect(page).toHaveURL(/my-day\?accountId=/);await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crm:navigate',{detail:'/accounts'})));await page.getByRole('button',{name:'Descartar cambios y salir',exact:true}).click();await expect(page).toHaveURL(/accounts$/);await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a read error offers a toast retry and keeps the business route',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 let fail=true,reads=0;
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/commercial')){reads++;await route.fulfill({status:fail?500:200,contentType:'application/json',body:superjson.stringify(fail?{error:'Lectura temporalmente no disponible'}:new URL(route.request().url()).searchParams.has('historyPage')?{events:[],total:0,page:1,pending:[],totalPending:0}:{account:{id:'1',nombre:'Negocio recuperado',assignedUserEmail:'admin@example.com'},contacts:[],opportunities:[],journal:[],leadJournal:[],users:[],verticals:[]})});return;}
  await route.fulfill({contentType:'application/json',body:superjson.stringify(path.endsWith('/auth/session')?{user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}}:path.endsWith('/communication')?{recentMessages:[],messages:[],resources:[],restrictions:[],responses:[],openManagements:[],recentContactHours:72}:path.endsWith('/work')?{tasks:[],activities:[],types:[],accounts:[],opportunities:[],contacts:[],users:[],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalTasks:0,totalActivities:0,page:1}:path.endsWith('/pipeline')?{stages:[]}:{})});
 });
 await page.goto('/accounts/1');await expect(page.getByRole('button',{name:'Reintentar negocio',exact:true})).toBeVisible();fail=false;const before=reads;await page.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(page.getByRole('heading',{name:'Negocio recuperado',exact:true})).toBeVisible();expect(reads).toBeGreaterThan(before);await expect(page).toHaveURL(/accounts\/1$/);
});

// Spec 104 §3.11: a success toast without an action leaves on its own in about 4 s, and with the business preview open the toasts move to the top
// centre instead of covering the preview footer (the panel registers its layer like a dialog).
test('a plain success toast leaves on its own and never covers the business preview footer',async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:1280,height:844});let city='Colón';
 await page.addInitScript(preferences=>{localStorage.setItem('hospeda-live-mode','off');localStorage.setItem('hospeda-business-list-v1-user-3',JSON.stringify({preferences,context:{page:1,scrollY:0,scrollX:0}}));},{...basePreferences(),presentation:'table',columns:['nombre','ciudad','actions'],pins:{actions:'right'}});
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'owner@example.com',displayName:'Owner',role:'admin'}};
  else if(url.pathname.endsWith('/business_list_defaults'))data={defaults:null};
  else if(url.pathname.endsWith('/saved_views'))data={views:[]};
  else if(url.pathname.endsWith('/settings'))data={users:[{id:3,email:'owner@example.com',displayName:'Owner',role:'admin'}],cities:[{id:'1',name:'Colón'},{id:'2',name:'Concordia'}],types:[],subtypes:[],templates:[],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/pipeline'))data={stages:[]};
  else if(url.pathname.endsWith('/communication'))data={recentMessages:[],messages:[],resources:[],restrictions:[],activeRestrictions:[],responses:[],openManagements:[],recentContactHours:72};
  else if(url.pathname.endsWith('/commercial')){const id=url.searchParams.get('accountId');data={account:{id,nombre:'Negocio '+id,ciudad:city,assignedUserEmail:'owner@example.com',archivedAt:null,email:null,telefono:null},contacts:[],opportunities:[],journal:[],leadJournal:[],managementJournal:[],stages:[]};}
  else if(url.pathname.endsWith('/leads_quick')){city=superjson.parse<any>(route.request().postData()!).value;data={ok:true};}
  else if(url.pathname.endsWith('/leads'))data={rows:[{id:'1',accountId:'1',nombre:'Negocio 1',ciudad:city,assignedUserEmail:'owner@example.com',canModify:true,opportunityCount:0,contactCount:0}],total:1,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 const changeCity=async(to:string)=>{await page.getByRole('button',{name:'Editar ciudad de Negocio 1',exact:true}).click();const popup=page.getByRole('dialog',{name:'Opciones de ciudad',exact:true});await popup.getByRole('button',{name:to,exact:true}).click();await expect(popup).toHaveCount(0);};
 await page.goto('/accounts');await page.getByRole('region',{name:'Resultados de negocios',exact:true}).waitFor();const more=page.getByRole('button',{name:'Ver más datos',exact:true});while(await more.count())await more.first().click();await expect(page.getByRole('button',{name:'Editar ciudad de Negocio 1',exact:true})).toBeVisible();
 // A toast shown before the preview opens moves to the top centre and stays clear of the preview footer.
 await changeCity('Concordia');const first=page.locator('[data-sonner-toast]').filter({hasText:'actualizado'});await expect(first).toBeVisible();
 await page.getByRole('group',{name:'Acciones de Negocio 1',exact:true}).getByRole('button',{name:'Vista previa',exact:true}).click();
 const preview=page.getByRole('dialog',{name:'Negocio 1',exact:true});const footer=preview.locator('footer');await expect(footer.getByRole('button',{name:'Abrir ficha',exact:true})).toBeVisible();
 await expect(page.locator('[data-sonner-toaster]')).toHaveAttribute('data-y-position','top');await expect(page.locator('[data-sonner-toaster]')).toHaveAttribute('data-x-position','center');
 const toastBox=await first.boundingBox(),footerBox=await footer.boundingBox();expect(toastBox&&footerBox).toBeTruthy();
 const overlaps=!!toastBox&&!!footerBox&&toastBox.x<footerBox.x+footerBox.width&&footerBox.x<toastBox.x+toastBox.width&&toastBox.y<footerBox.y+footerBox.height&&footerBox.y<toastBox.y+toastBox.height;expect(overlaps).toBe(false);
 await page.getByRole('button',{name:'Cerrar vista previa',exact:true}).click();await expect(preview).toHaveCount(0);await expect(page.locator('[data-sonner-toast]')).toHaveCount(0,{timeout:8000});
 // A success toast without an action leaves on its own in about 4 s (Sonner pauses while the pointer is over it, so the pointer moves away).
 await changeCity('Colón');const second=page.locator('[data-sonner-toast]').filter({hasText:'actualizado'});await expect(second).toBeVisible();const shown=Date.now();await page.mouse.move(4,4);
 await expect(second).toHaveCount(0,{timeout:6000});expect(Date.now()-shown).toBeLessThan(6000);
});
