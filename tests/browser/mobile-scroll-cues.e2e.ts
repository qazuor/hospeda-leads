import {test,expect} from '@playwright/test';
import {basePreferences} from '../../src/helpers/businessListPreferences';
import superjson from 'superjson';

test('mobile guide, quick filters and daily actions are easy to discover',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(preferences=>{localStorage.setItem('hospeda-live-mode','off');localStorage.setItem('hospeda-business-list-v1-user-3',JSON.stringify({preferences,context:{page:1,scrollY:0,scrollX:0}}));},{...basePreferences(true),columns:['nombre','assignedUserEmail','ciudad','actions']});
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  const row={id:'-1',accountId:'1',nombre:'Posada de prueba',ciudad:'Colón',assignedUserEmail:'admin@example.com',telefono:'123',email:'prueba@example.com',canModify:true,opportunityCount:0,contactCount:0,fechaProximaAccion:null,nextActionTitle:null};
  const work={tasks:[],activities:[],types:[],accounts:[],opportunities:[],contacts:[],users:[],attention:[],journal:[],followupStages:[],newAssignmentDays:7,bucketCounts:{overdue:0,today:0,upcoming:0},cities:[],verticals:[],totalTasks:0,totalActivities:0,page:1};
  await page.route('**/_api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data:unknown={};
    if(path.endsWith('/auth/session'))data={user:{id:3,email:'admin@example.com',displayName:'Admin Test',role:'admin'}};
    else if(path.endsWith('/business_list_defaults'))data={defaults:null};
    else if(path.endsWith('/settings'))data={users:[],cities:[],types:[],templates:[],subtypes:[],authorizedEmails:[],opportunityStages:[]};
    else if(path.endsWith('/leads'))data={rows:[row],total:1,page:1,pageSize:50,filters:{ciudades:['Colón'],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
    else if(path.endsWith('/saved_views'))data={views:[]};
    else if(path.endsWith('/work'))data=work;
    else if(path.endsWith('/pipeline'))data={stages:[],insights:[],events:[],objections:[],lossReasons:[],objectionTypes:[],rules:[],users:[],verticals:[]};
    await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
  });

  await page.goto('/guide');
  await expect(page.getByText('Deslizá para ver los otros recorridos',{exact:true})).toBeVisible();
  await expect.poll(()=>page.locator('div[class*="shortcuts"]').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);

  await page.goto('/my-day');
  await expect(page.getByRole('button',{name:'Agendar tarea',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Anotar lo que pasó',exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/my-day-actions-mobile.png',fullPage:true,animations:'disabled'});
  await page.goto('/agenda');
  await expect(page.getByRole('button',{name:'Agendar encuentro',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Anotar encuentro realizado',exact:true})).toBeVisible();

  await page.goto('/accounts');
  await expect(page.getByText('Deslizá para ver más vistas',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Más vistas',exact:true})).toBeVisible();
  const businessCard=page.locator('[data-business-id="1"]'),ownerField=businessCard.locator('[data-card-field="assignedUserEmail"]'),ownerLabel=ownerField.locator('.mantine-Badge-label');
  await businessCard.getByRole('button',{name:'Ver más datos',exact:true}).click();await expect(ownerField).toBeVisible();await expect(ownerLabel).toHaveCSS('white-space','nowrap');
  expect((await ownerField.boundingBox())!.width).toBeGreaterThan((await businessCard.boundingBox())!.width*.8);
  expect(await page.getByLabel('Búsqueda y presentación de negocios').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(280);
  await page.screenshot({path:'test-results/business-view-scroll-cue-mobile.png',fullPage:true,animations:'disabled'});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
