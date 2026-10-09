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
    await expect(page.getByRole('button',{name:'Más opciones',exact:true})).toBeInViewport({ratio:1});
    if(width>=1280)await expect(page.getByRole('link',{name:'Agenda',exact:true})).toBeInViewport({ratio:1});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if(width<600)expect(await page.getByRole('banner').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(130);
    await page.getByRole('button',{name:'Más opciones',exact:true}).click();await expect(page.getByRole('menuitem',{name:'Configuración',exact:true})).toBeVisible();await page.keyboard.press('Escape');
    await page.screenshot({path:`test-results/visual-navigation-${width}-${dark?'dark':'light'}.png`,fullPage:true,animations:'disabled'});
  }
});
