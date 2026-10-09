import {test,expect} from '@playwright/test';
import superjson from 'superjson';

for(const width of [320,390,1280])test(`compact navigation and guide remain usable at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.route('**/_api/**',route=>route.fulfill({status:200,contentType:'application/json',body:superjson.stringify({user:{id:3,email:'admin@example.com',displayName:'Admin Test',role:'admin'}})}));
  for(const dark of [false,true]){
    await page.goto('/guide');await page.evaluate(dark=>localStorage.setItem('hospeda-theme-mode',dark?'dark':'light'),dark);await page.reload();
    await expect(page.getByRole('heading',{name:'Usar Hospeda, paso a paso',exact:true})).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if(width<768){
      const burger=page.getByRole('button',{name:'Abrir menú de navegación',exact:true});
      expect(await page.getByRole('banner').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(70);
      await expect(burger).toBeInViewport({ratio:1});await burger.click();
      const menu=page.getByRole('dialog',{name:'Menú de navegación',exact:true});
      await expect(menu.getByRole('link',{name:'Gestiones comerciales',exact:true})).toBeInViewport({ratio:1});
      await expect(menu.getByRole('link',{name:'Agenda',exact:true})).toBeVisible();
      await expect(menu.getByRole('link',{name:'Configuración',exact:true})).toBeVisible();
      await page.screenshot({path:`test-results/mobile-menu-${width}-${dark?'dark':'light'}.png`,animations:'disabled'});
      await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(burger).toBeFocused();
      await burger.click();await page.getByRole('dialog').getByRole('link',{name:'Guía de uso paso a paso',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
    }else{
      await expect(page.getByRole('link',{name:'Agenda',exact:true})).toBeInViewport({ratio:1});
      await page.getByRole('button',{name:'Más opciones',exact:true}).click();await expect(page.getByRole('menuitem',{name:'Configuración',exact:true})).toBeVisible();await page.keyboard.press('Escape');
    }
    await page.screenshot({path:`test-results/visual-navigation-${width}-${dark?'dark':'light'}.png`,fullPage:true,animations:'disabled'});
  }
});

test('mobile navigation keeps administrative destinations hidden for sellers',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('**/_api/**',route=>route.fulfill({status:200,contentType:'application/json',body:superjson.stringify({user:{id:3,email:'seller@example.com',displayName:'Vendedor',role:'user'}})}));
 await page.goto('/guide');await expect(page.getByRole('heading',{name:'Usar Hospeda, paso a paso',exact:true})).toBeVisible();await page.getByRole('button',{name:'Abrir menú de navegación',exact:true}).click();const menu=page.getByRole('dialog');
 for(const name of ['Configuración','Papelera','Importar CSV','Buscar duplicados','Estadísticas'])await expect(menu.getByRole('link',{name,exact:true})).toHaveCount(0);
 await expect(menu.getByRole('link',{name:'Agenda',exact:true})).toBeVisible();await menu.getByRole('button',{name:'Cerrar menú de navegación',exact:true}).click();await expect(menu).toHaveCount(0);
});
