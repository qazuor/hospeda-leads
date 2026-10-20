import {test,expect} from '@playwright/test';
import superjson from 'superjson';
test('business list with several loaded pages offers a manual refresh on live changes',async({page})=>{
 await page.setViewportSize({width:1280,height:844});await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','on'));
 let business=Date.now()/1000,leadRequests=0,liveRequests=0;
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'viewer@example.com',displayName:'Viewer',role:'user'}};
  else if(url.pathname.endsWith('/live_version')){liveRequests++;data={version:String(business),domains:{business:String(business),work:'1',communication:'1',catalog:'1',journal:'1'},now:String(Date.now()/1000)};}
  else if(url.pathname.endsWith('/business_list_defaults'))data={defaults:null};
  else if(url.pathname.endsWith('/settings'))data={users:[],cities:[],types:[],templates:[],subtypes:[],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/saved_views'))data={views:[]};
  else if(url.pathname.endsWith('/leads')){
   leadRequests++;const pageNumber=Number(url.searchParams.get('page')??1),pageSize=Number(url.searchParams.get('pageSize')??25);
   const rows=Array.from({length:pageSize},(_,index)=>{const id=(pageNumber-1)*pageSize+index+1;return {id:String(-id),accountId:String(id),nombre:'Negocio '+id,ciudad:'Colón',canModify:false,opportunityCount:0,contactCount:0};});
   data={rows,total:pageSize*2,page:pageNumber,pageSize,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  }
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts');const results=page.getByRole('region',{name:'Resultados de negocios',exact:true});
 await expect(results).toHaveAttribute('aria-busy','false');await expect(page.locator('[data-business-id="1"]')).toBeVisible();
 await page.locator('[data-business-id]').last().scrollIntoViewIfNeeded();await page.mouse.wheel(0,20000);
 await expect(page.getByText('No hay más resultados')).toBeVisible();
 const loaded=leadRequests,chip=page.getByRole('button',{name:'Hay cambios · Actualizar',exact:true});
 // A business change while two pages are loaded only flags the list.
 const checks=liveRequests;business=Date.now()/1000;await expect.poll(()=>liveRequests,{timeout:15000}).toBeGreaterThan(checks);
 await expect(chip).toBeVisible();expect(leadRequests).toBe(loaded);
 // The chip refetches every loaded page once and disappears.
 await chip.click();await expect(chip).toBeHidden();await expect.poll(()=>leadRequests).toBe(loaded+2);
 await expect(page.getByText('No hay más resultados')).toBeVisible();
});
