import {test,expect} from '@playwright/test';
for(const width of [1280,390,320])test(`remaining screens fit both themes at ${width}px`,async({page})=>{
 test.setTimeout(180000);await page.setViewportSize({width,height:844});await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 for(const dark of [false,true]){
  await page.evaluate(dark=>localStorage.setItem('hospeda-theme-mode',dark?'dark':'light'),dark);
  for(const route of ['my-day','agenda','templates','library','settings','trash','guide']){
   await page.goto('/'+route);await expect(page.locator('main')).toBeVisible();await expect(page.locator('main h1')).toBeVisible();
   if(width<600)expect(await page.getByRole('banner').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(130);
   await expect.poll(()=>page.evaluate(()=>document.body.classList.contains('dark'))).toBe(dark);
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   await page.screenshot({path:`test-results/transversal-${route}-${width}-${dark?'dark':'light'}.png`,fullPage:true,animations:'disabled'});
  }
 }
 expect(errors).toEqual([]);
});
