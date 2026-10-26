import {test,expect} from '@playwright/test';
import superjson from 'superjson';

for(const width of [320,390,1024,1280])test(`app shell navigation and guide remain usable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 await page.route('**/_api/**',route=>route.fulfill({status:200,contentType:'application/json',body:superjson.stringify({user:{id:3,email:'admin@example.com',displayName:'Admin Test',role:'admin'}})}));
 for(const dark of [false,true]){
  await page.goto('/guide');await page.evaluate(dark=>localStorage.setItem('hospeda-theme-mode',dark?'dark':'light'),dark);await page.reload();
  await expect(page.getByRole('heading',{name:'Usar Hospeda, paso a paso',exact:true})).toBeVisible();await expect(page).toHaveTitle('Ayuda · Hospeda CRM');await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  if(width<768){
   expect(await page.getByRole('banner').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(70);await expect(page.getByRole('banner')).toContainText('Ayuda');
   const bottom=page.getByRole('navigation',{name:'Navegación inferior'});await expect(bottom).toBeVisible();
   for(const name of ['Hoy','Negocios','Gestiones','Ayuda'])await expect(bottom.getByRole('link',{name,exact:true})).toBeInViewport({ratio:1});
   await page.screenshot({path:`test-results/mobile-shell-${width}-${dark?'dark':'light'}.png`,animations:'disabled'});
   const more=page.getByRole('button',{name:'Más',exact:true});await expect(more).toBeInViewport({ratio:1});await more.click();const sheet=page.getByRole('dialog',{name:'Otras secciones'});await expect(sheet).toBeVisible();
   await expect(sheet.getByText('Administración',{exact:true})).toBeVisible();for(const name of ['Negocios archivados','Importar CSV','Buscar duplicados','Estadísticas','Configuración','Historial del equipo','Papelera','Emails sin asociar'])await expect(sheet.getByRole('link',{name,exact:true})).toBeVisible();
   await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);await expect(more).toBeFocused();
   await more.click();await sheet.getByRole('button',{name:'Cerrar otras secciones'}).click();await expect(sheet).toHaveCount(0);
  }else{
   const banner=page.getByRole('banner');expect(await banner.evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(76);
   const nav=page.getByRole('navigation',{name:'Navegación principal'});for(const name of ['Hoy','Negocios','Gestiones','Ayuda'])await expect(nav.getByRole('link',{name,exact:true})).toBeVisible();
   const admin=nav.getByRole('button',{name:'Administración'});if(await admin.getAttribute('aria-expanded')==='false')await admin.click();await expect(admin).toHaveAttribute('aria-expanded','true');
   for(const name of ['Configuración','Negocios archivados','Emails sin asociar'])await expect(nav.getByRole('link',{name,exact:true})).toBeVisible();
   await page.screenshot({path:`test-results/visual-navigation-${width}-${dark?'dark':'light'}.png`,fullPage:true});
  }
 }
});

test('mobile Más keeps administrative destinations hidden for sellers',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('**/_api/**',route=>route.fulfill({status:200,contentType:'application/json',body:superjson.stringify({user:{id:3,email:'seller@example.com',displayName:'Vendedor',role:'user'}})}));
 await page.goto('/guide');await expect(page.getByRole('heading',{name:'Usar Hospeda, paso a paso',exact:true})).toBeVisible();await expect(page.getByRole('navigation',{name:'Navegación inferior'}).getByRole('link',{name:'Gestiones',exact:true})).toBeVisible();await page.getByRole('button',{name:'Más',exact:true}).click();const sheet=page.getByRole('dialog',{name:'Otras secciones'});
 for(const name of ['Configuración','Papelera','Importar CSV','Buscar duplicados','Estadísticas','Negocios archivados'])await expect(sheet.getByRole('link',{name,exact:true})).toHaveCount(0);
 await expect(sheet.getByText('Administración',{exact:true})).toHaveCount(0);await expect(sheet.getByRole('link',{name:'User script de WhatsApp',exact:true})).toHaveCount(0);await sheet.getByRole('button',{name:'Cerrar otras secciones'}).click();await expect(sheet).toHaveCount(0);await page.getByRole('button',{name:'Vendedor',exact:true}).click();await expect(page.getByRole('menuitem',{name:'User script de WhatsApp'})).toBeVisible();
});
