import {test,expect} from '@playwright/test';
import type {Locator,Page} from '@playwright/test';
import superjson from 'superjson';
import {waitForTransitions} from './support/transitions';

/** True when a tap 20px to the sides or 21px above/below the control's centre still lands on it (about a 44px target; the page edge may clip a pixel or two). */
async function hasTouchArea(target:Locator):Promise<boolean>{
 return target.evaluate(element=>{
  // Centre it so the sticky header cannot cover the probe points.
  element.scrollIntoView({block:'center'});
  const box=element.getBoundingClientRect(),cx=box.left+box.width/2,cy=box.top+box.height/2;
  const hits=(x:number,y:number)=>{const hit=document.elementFromPoint(x,y);return !!hit&&(hit===element||element.contains(hit));};
  return hits(cx,cy-21)&&hits(cx,cy+21)&&hits(cx-20,cy)&&hits(cx+20,cy);
 });
}

async function login(page:Page){
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/\/my-day$/);
}
async function mutate(page:Page,body:unknown){
 const r=await page.evaluate(async body=>{const response=await fetch('/_api/commercial',{method:'POST',body,headers:{'Content-Type':'application/json'}});return {status:response.status,text:await response.text()};},superjson.stringify(body));
 expect(r.status,r.text).toBe(200);return superjson.parse<{id:string}>(r.text).id;
}

test.describe('mobile dialogs and touch targets',()=>{
 test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});

 test('declares viewport-fit=cover so safe-area insets can apply',async({page})=>{
  await page.goto('/login');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content',/viewport-fit=cover/);
 });

 test('a short editor is a bottom sheet and Guardar stays above the on-screen keyboard',async({page})=>{
  test.setTimeout(120000);
  // A controllable visual viewport stands in for the keyboard: real keyboards shrink it but not 100dvh.
  await page.addInitScript(()=>{
   const viewport=Object.assign(new EventTarget(),{height:window.innerHeight,offsetTop:0,width:window.innerWidth,offsetLeft:0,scale:1});
   Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
   (window as unknown as {__setKeyboard:(height:number)=>void}).__setKeyboard=height=>{viewport.height=window.innerHeight-height;viewport.dispatchEvent(new Event('resize'));};
  });
  await login(page);
  const name='Dialogo movil '+Date.now();
  const accountId=await mutate(page,{action:'account_save',nombre:name,ciudad:'Colón',assignedUserEmail:'admin@example.com'});
  const leadId=await mutate(page,{action:'opportunity_save',accountId,confirmReviewed:true,managementType:'main',opportunityName:'Gestión móvil',assignedUserEmail:'admin@example.com'});
  await page.goto('/opportunities?leadId='+leadId);
  await page.getByRole('button',{name:/^Etapa:/}).click();
  const dialog=page.getByRole('dialog').last(),save=dialog.getByRole('button',{name:'Guardar',exact:true});
  await expect(save).toBeVisible();await waitForTransitions(page);
  const box=await dialog.boundingBox(),saveBox=await save.boundingBox();
  // Short form: not full screen, and its buttons sit at the bottom of the screen instead of mid-screen.
  expect(box!.height).toBeLessThan(844*0.7);
  expect(saveBox!.y+saveBox!.height).toBeGreaterThan(844-40);
  // Keyboard open: the sheet follows the visual viewport, so Guardar remains reachable.
  await page.evaluate(()=>(window as unknown as {__setKeyboard:(height:number)=>void}).__setKeyboard(380));
  await expect.poll(async()=>{const b=await save.boundingBox();return b?b.y+b.height:9999;}).toBeLessThanOrEqual(844-380);
  await expect(save).toBeInViewport();
  await page.evaluate(()=>(window as unknown as {__setKeyboard:(height:number)=>void}).__setKeyboard(0));
  await expect.poll(async()=>{const b=await save.boundingBox();return b?b.y+b.height:0;}).toBeGreaterThan(844-40);
 });

 test('table checkboxes, help hints and row controls have a 44px touch area',async({page})=>{
  test.setTimeout(120000);
  await login(page);
  const name='Toque movil '+Date.now();
  const accountId=await mutate(page,{action:'account_save',nombre:name,ciudad:'Colón',assignedUserEmail:'admin@example.com'});
  await mutate(page,{action:'opportunity_save',accountId,confirmReviewed:true,managementType:'main',opportunityName:'Gestión toque',assignedUserEmail:'admin@example.com'});
  await page.goto('/opportunities');
  await page.getByRole('button',{name:'Tabla',exact:true}).click();
  const row=page.getByRole('row').filter({hasText:name});
  await expect(row).toBeVisible();
  expect(await hasTouchArea(row.getByRole('checkbox'))).toBe(true);
  expect(await hasTouchArea(page.getByRole('button',{name:'¿Qué es esto? Gestión'}))).toBe(true);
  const open=row.getByRole('button',{name:'Abrir',exact:true});
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for(const control of await row.locator('button').all()){const box=await control.boundingBox();if(box)expect(box.height,await control.innerHTML()).toBeGreaterThanOrEqual(44);}
  await page.getByRole('button',{name:'Tablero comercial',exact:true}).click();
  expect(await hasTouchArea(page.getByRole('button',{name:'¿Qué es esto? Tipo de gestión'}))).toBe(true);
  // The business list in table view shares the same checkbox.
  await page.goto('/accounts');
  await page.getByRole('button',{name:'Tabla',exact:true}).click();
  await page.getByPlaceholder(/Buscar/).first().fill(name);
  const businessRow=page.getByRole('row').filter({hasText:name});
  await expect(businessRow).toBeVisible();
  expect(await hasTouchArea(businessRow.getByRole('checkbox'))).toBe(true);
  expect(await hasTouchArea(page.getByRole('columnheader').first().getByRole('checkbox'))).toBe(true);
 });

 test('Hoy empty state keeps "Revisar negocios" at 44px',async({page})=>{
  await login(page);
  const work={tasks:[],activities:[],types:[],accounts:[],opportunities:[],contacts:[],users:[],attention:[],journal:[],followupStages:[],newAssignmentDays:7,bucketCounts:{overdue:0,today:0,upcoming:0},cities:[],verticals:[],totalTasks:0,totalActivities:0,page:1};
  await page.route('**/_api/work*',route=>route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(work)}));
  await page.goto('/my-day');
  const link=page.getByRole('link',{name:'Revisar negocios',exact:true});
  await expect(link).toBeVisible();
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 });
});
