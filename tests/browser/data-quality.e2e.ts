import {test,expect} from '@playwright/test';
test('CSV review, safe update, provenance and explicit merge remain usable in dark/mobile',async({page})=>{
 test.setTimeout(120000);
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/\/my-day$/);await page.goto("/accounts");
 const stamp=Date.now(),name='Calidad E2E '+stamp,phone='+543442'+String(stamp).slice(-6),email='quality-'+stamp+'@example.com';
 await page.getByRole('button',{name:'Más opciones',exact:true}).click();await page.getByRole('menuitem',{name:'Importar CSV',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.locator('input[type=file]').setInputFiles({name:'quality.csv',mimeType:'text/csv',buffer:Buffer.from(`nombre,ciudad,telefono,email\n${name},Colón,${phone},${email}\n${name},Colón,${phone},${email}\nInválido,Colón,123,bad\n`)});
 await dialog.getByLabel('Fuente',{exact:true}).fill('CSV navegador');
 await dialog.getByRole('button',{name:'Revisar lote',exact:true}).click();
 await expect(dialog.getByText(/Coincidencia dentro del archivo/).first()).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Confirmar lote',exact:true})).toBeDisabled();
 for(const n of [1,2]){
  await dialog.getByRole('combobox',{name:'Acción fila '+n,exact:true}).selectOption('create');
  await dialog.locator('section').filter({has:page.getByText(`Fila ${n}: ${name}`,{exact:true})}).getByLabel('Revisé las coincidencias y los datos ambiguos de esta fila.').check();
 }
 await dialog.getByLabel(/Confirmo 2 altas/).check();await dialog.getByRole('button',{name:'Confirmar lote',exact:true}).click();await expect(dialog.getByText('2 creados · 0 actualizados · 1 omitidos · 0 errores')).toBeVisible();await dialog.getByRole('button',{name:'Cerrar',exact:true}).first().click();
 await page.getByRole('button',{name:'Más opciones',exact:true}).click();await page.getByRole('menuitem',{name:'Buscar duplicados',exact:true}).click();const duplicates=page.getByRole('dialog');
 const group=duplicates.locator('section').filter({has:page.getByText(name,{exact:true})}).first();await group.getByRole('button',{name:'Revisar fusión',exact:true}).first().click();
 const merge=page.getByRole('dialog');await expect(merge.getByRole('heading',{name:'Fusionar negocios',exact:true})).toBeVisible();await merge.getByLabel('Motivo',{exact:true}).fill('Duplicado confirmado E2E');await merge.getByLabel(/Verifiqué que son el mismo negocio/).check();await merge.getByRole('button',{name:'Fusionar definitivamente',exact:true}).click();await expect(page).toHaveURL(/\/accounts\/\d+$/);await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Historial',exact:true}).click();await page.getByText('Revisar calidad y procedencia de los datos',{exact:true}).click();await expect(page.getByRole('heading',{name:'Calidad y procedencia',exact:true})).toBeVisible();await expect(page.getByText(/Evidencia actual · CSV navegador/).first()).toBeVisible();
 await page.screenshot({path:'test-results/data-quality-light.png',fullPage:true});await page.getByRole('button',{name:'Admin Test',exact:true}).click();await page.getByRole('menuitem',{name:'Tema oscuro'}).click();await page.screenshot({path:'test-results/data-quality-dark.png',fullPage:true});await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:'test-results/data-quality-mobile.png',fullPage:true});
});
