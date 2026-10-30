import {test,expect,type Locator,type Page} from '@playwright/test';

async function login(page:Page){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);}
/** Left edge of a visible table header, found by its accessible name (business headers append «Cambiar ancho de …»). */
async function headerX(page:Page,label:string){const box=await page.getByRole('columnheader',{name:new RegExp('^'+label+'( Cambiar ancho|$)')}).first().boundingBox();expect(box,`header ${label}`).not.toBeNull();return box!.x;}
async function headerNames(page:Page){return page.getByRole('columnheader').evaluateAll(nodes=>nodes.map(node=>node.textContent?.trim()??''));}
/** dnd-kit activates the keyboard drag asynchronously: wait for the grabbed state before moving, and let the move settle before dropping. */
async function keyboardMove(page:Page,handle:Locator,key:'ArrowUp'|'ArrowDown'){await handle.focus();await page.keyboard.press('Space');await expect(handle).toHaveAttribute('aria-pressed','true');await page.keyboard.press(key);await page.waitForTimeout(150);await page.keyboard.press('Space');await expect(handle).not.toHaveAttribute('aria-pressed','true');}
test.beforeEach(async({page})=>{await login(page);await page.evaluate(()=>localStorage.clear());});

test('management columns reorder by mouse and persist; a hidden column appends last',async({page})=>{
 await page.goto('/opportunities');const toggle=page.getByRole('button',{name:'Columnas',exact:true});await toggle.click();
 const a=await page.getByRole('button',{name:'Reordenar Estado'}).boundingBox(),b=await page.getByRole('button',{name:'Reordenar Persona de contacto'}).boundingBox();expect(a).toBeTruthy();expect(b).toBeTruthy();if(!a||!b)return;
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();let seen=false;for(let step=1;step<=10;step++){await page.mouse.move(a.x+a.width/2,a.y+a.height/2+(b.y+b.height*.1-a.y-a.height/2)*step/10,{steps:3});if(await page.getByTestId('column-drop-indicator').isVisible().catch(()=>false))seen=true;}
 expect(seen).toBe(true);await page.mouse.up();await expect(page.getByTestId('column-drop-indicator')).toHaveCount(0);await page.keyboard.press('Escape');
 expect(await headerX(page,'Estado')).toBeLessThan(await headerX(page,'Persona de contacto'));
 await page.reload();expect(await headerX(page,'Estado')).toBeLessThan(await headerX(page,'Persona de contacto'));
 await toggle.click();await page.getByRole('checkbox',{name:'Ciudad',exact:true}).check();await page.keyboard.press('Escape');
 expect(await headerX(page,'Ciudad')).toBeGreaterThan(await headerX(page,'Próximo paso'));
});

test('business columns reorder within a zone, never across zones, and persist',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await page.goto('/accounts');await page.getByRole('button',{name:'Tabla',exact:true}).click();const toggle=page.getByRole('button',{name:'Columnas',exact:true}),options=page.getByRole('dialog',{name:'Columnas del listado'});
 await toggle.click();await keyboardMove(page,options.getByRole('button',{name:'Reordenar Ciudad'}),'ArrowDown');await options.getByRole('button',{name:'Cerrar columnas'}).click();
 expect(await headerX(page,'Ciudad')).toBeGreaterThan(await headerX(page,'Teléfono'));
 // Pin Ciudad and Teléfono left: the left zone is [Teléfono, Ciudad] in column order.
 await toggle.click();await options.getByRole('combobox',{name:'Fijar Ciudad'}).selectOption('left');await options.getByRole('combobox',{name:'Fijar Teléfono'}).selectOption('left');
 await keyboardMove(page,options.getByRole('button',{name:'Reordenar Ciudad'}),'ArrowUp');await options.getByRole('button',{name:'Cerrar columnas'}).click();
 expect(await headerX(page,'Ciudad')).toBeLessThan(await headerX(page,'Teléfono'));expect(await headerX(page,'Teléfono')).toBeLessThan(await headerX(page,'Estado del negocio'));
 // Teléfono is now the last column of the left zone: moving it down must not leak it into the unpinned zone.
 const before=await headerNames(page);await toggle.click();await keyboardMove(page,options.getByRole('button',{name:'Reordenar Teléfono'}),'ArrowDown');await options.getByRole('button',{name:'Cerrar columnas'}).click();
 expect(await headerNames(page)).toEqual(before);
 await page.reload();await expect.poll(()=>headerNames(page)).toEqual(before);
});
