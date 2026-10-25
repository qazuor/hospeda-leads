import {expect,test,type Locator,type Page} from '@playwright/test';

async function login(page:Page){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);}
/** Each test starts from the team bar: a failed run must not leak pins into later specs. Runs in the page because the session cookie is Secure and Playwright's API client drops it over http. */
async function resetPins(page:Page){const statuses=await page.evaluate(async()=>Promise.all(['business','opportunity'].map(async entity=>(await fetch('/_api/view_pins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({json:{entity,config:null}})})).status)));expect(statuses).toEqual([200,200]);}
async function openPanel(page:Page){await page.getByRole('button',{name:/^Abrir más vistas/}).click();await page.getByRole('menuitem',{name:'Elegir vistas de la barra…'}).click();const panel=page.getByRole('dialog',{name:'Elegir vistas de la barra'});await expect(panel).toBeVisible();return panel;}
const row=(panel:Locator,name:string)=>panel.getByRole('button',{name:`Reordenar ${name}`}).locator('..');
async function barNames(page:Page){return page.getByRole('region',{name:'Vistas guardadas'}).getByRole('button').allTextContents();}

test.beforeEach(async({page})=>{await login(page);await resetPins(page);});
test.afterEach(async({page})=>{await resetPins(page);});

test('business pins, keyboard order and reset persist per user',async({page})=>{
 await page.goto('/accounts');const today=page.getByRole('button',{name:'Aplicar vista del sistema Para hoy'});await expect(today).toBeVisible();
 let panel=await openPanel(page);await row(panel,'Para hoy').getByRole('button',{name:'Desfijar'}).click();await panel.getByRole('button',{name:'Guardar',exact:true}).click();await expect(panel).toBeHidden();
 await expect(today).toHaveCount(0);await page.getByRole('button',{name:/^Abrir más vistas/}).click();await expect(page.getByRole('menuitem',{name:'Para hoy',exact:true})).toBeVisible();await page.getByRole('button',{name:'Fijar Para hoy en la barra'}).click();await expect(today).toBeVisible();
 panel=await openPanel(page);await panel.getByRole('button',{name:'Reordenar Vencidos'}).focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowUp');await page.keyboard.press('Space');await panel.getByRole('button',{name:'Guardar',exact:true}).click();await expect(panel).toBeHidden();
 await page.reload();await expect(page.getByRole('button',{name:'Aplicar vista del sistema Vencidos'})).toBeVisible();let names=await barNames(page);expect(names.findIndex(name=>name.includes('Vencidos'))).toBeLessThan(names.findIndex(name=>name.includes('Para hoy')));
 panel=await openPanel(page);await panel.getByRole('button',{name:'Volver a la barra del equipo'}).click();await expect(panel).toBeHidden();await page.reload();
 await expect(today).toBeVisible();names=await barNames(page);expect(names.findIndex(name=>name.includes('Para hoy'))).toBeLessThan(names.findIndex(name=>name.includes('Vencidos')));
});

test('management unpinned view stays in «Más vistas» after reload',async({page})=>{
 await page.goto('/opportunities');const tabs=page.getByRole('group',{name:'Vistas de gestiones'});await expect(tabs.getByRole('button',{name:'Para hoy',exact:true})).toBeVisible();
 const panel=await openPanel(page);await row(panel,'Para hoy').getByRole('button',{name:'Desfijar'}).click();await panel.getByRole('button',{name:'Guardar',exact:true}).click();await expect(panel).toBeHidden();await page.reload();
 await expect(tabs.getByRole('button',{name:'Todos',exact:true})).toBeVisible();await expect(tabs.getByRole('button',{name:'Para hoy',exact:true})).toHaveCount(0);await page.getByRole('button',{name:/^Abrir más vistas/}).click();await expect(page.getByRole('menuitem',{name:'Para hoy',exact:true})).toBeVisible();
});

test('business views reorder with a mouse drag from the handle and show the drop line',async({page})=>{
 await page.goto('/accounts');await expect(page.getByRole('button',{name:'Aplicar vista del sistema Para hoy'})).toBeVisible();const panel=await openPanel(page);
 const from=await panel.getByRole('button',{name:'Reordenar Para hoy'}).boundingBox(),to=await panel.getByRole('button',{name:'Reordenar Vencidos'}).boundingBox();expect(from).not.toBeNull();expect(to).not.toBeNull();if(!from||!to)return;
 const x=from.x+from.width/2,startY=from.y+from.height/2,endY=to.y+to.height*0.9;await page.mouse.move(x,startY);await page.mouse.down();
 let indicatorSeen=false;for(let step=1;step<=10;step++){await page.mouse.move(x,startY+(endY-startY)*step/10,{steps:3});if(await panel.getByTestId('pin-drop-indicator').isVisible().catch(()=>false))indicatorSeen=true;}
 expect(indicatorSeen).toBe(true);await page.mouse.up();await expect(panel.getByTestId('pin-drop-indicator')).toHaveCount(0);await panel.getByRole('button',{name:'Guardar',exact:true}).click();await expect(panel).toBeHidden();
 await page.reload();await expect(page.getByRole('button',{name:'Aplicar vista del sistema Vencidos'})).toBeVisible();const names=await barNames(page);expect(names.findIndex(name=>name.includes('Para hoy'))).toBeGreaterThan(names.findIndex(name=>name.includes('Vencidos')));
});
