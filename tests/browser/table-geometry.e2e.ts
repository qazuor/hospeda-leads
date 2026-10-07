import {test,expect} from '@playwright/test';
test('tables fill their container and compact controls retain their own height across navigation',async({page})=>{
 test.setTimeout(120000);await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));await page.setViewportSize({width:1800,height:1000});
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 for(const path of ['/accounts','/opportunities','/accounts']){
  await page.goto(path);if(path==="/opportunities")await page.getByRole("button",{name:"Tabla",exact:true}).click();await expect(page.locator('[aria-busy]')).toHaveAttribute('aria-busy','false');await expect(page.locator('tbody tr').first().getByRole('button',{name:'Abrir',exact:true})).toBeVisible();
  const geometry=await page.locator('table').evaluate(table=>{const row=table.querySelector('tbody tr')!;const checkbox=row.querySelector('input[type=checkbox]')!;const button=Array.from(row.querySelectorAll('button')).find(b=>b.textContent==='Abrir')!;return {width:table.getBoundingClientRect().width,container:table.parentElement!.clientWidth,checkbox:checkbox.getBoundingClientRect().height,button:button.getBoundingClientRect().height,row:row.getBoundingClientRect().height}});
  expect(geometry.width).toBeGreaterThanOrEqual(geometry.container-1);expect(geometry.checkbox).toBeLessThanOrEqual(22);expect(geometry.button).toBeLessThanOrEqual(38);expect(geometry.button).toBeLessThan(geometry.row);
 }
 await page.screenshot({path:'test-results/table-polish-light.png',fullPage:true});await page.getByRole('button',{name:'Admin Test',exact:true}).click();await page.getByRole('menuitem',{name:'Tema oscuro'}).click();await page.screenshot({path:'test-results/table-polish-dark.png',fullPage:true});
 await page.getByRole('button',{name:'Pantalla completa',exact:true}).click();await expect.poll(()=>page.locator('table').evaluate(t=>t.getBoundingClientRect().width>=t.parentElement!.clientWidth-1)).toBe(true);
});
