import {test,expect} from '@playwright/test';
import superjson from 'superjson';
for(const width of [1280,390])test(`business background refresh preserves populated and empty results at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','on'));
 let version=1,gate:Promise<void>|null=null,started:(()=>void)|null=null;
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'viewer@example.com',displayName:'Viewer',role:'user'}};
  else if(url.pathname.endsWith('/live_version'))data={version:String(version)};
  else if(url.pathname.endsWith('/business_list_defaults'))data={defaults:null};
  else if(url.pathname.endsWith('/settings'))data={users:[],cities:[],types:[],templates:[],subtypes:[],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/saved_views'))data={views:[]};
  else if(url.pathname.endsWith('/leads')){
   started?.();if(gate)await gate;const empty=Boolean(url.searchParams.get('q'));
   data={rows:empty?[]:[{id:'-1',accountId:'1',nombre:'Negocio visible',ciudad:'Colón',canModify:false,opportunityCount:0,contactCount:0}],total:empty?0:1,page:1,pageSize:Number(url.searchParams.get('pageSize')??25),filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  }
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts');const results=page.getByRole('region',{name:'Resultados de negocios',exact:true});
 await expect(results).toHaveAttribute('aria-busy','false');await expect(page.locator('[data-business-id="1"]')).toBeVisible();await expect(page.getByRole('button',{name:'Actualizar',exact:true})).toHaveAttribute('title',/Último chequeo/);
 function block(){let release!:()=>void;gate=new Promise<void>(r=>release=r);const requested=new Promise<void>(r=>started=r);return {requested,release:()=>{gate=null;started=null;release();}};}
 // A real Live version change triggers invalidation; hold the response to inspect the pending UI.
 let pending=block();version++;try{await pending.requested;await expect(results).toHaveAttribute('aria-busy','false');await expect(page.locator('[data-business-id="1"]')).toBeVisible();await expect(results.locator('.mantine-Skeleton-root')).toHaveCount(0);}finally{pending.release();}
 // An explicit search must still replace results with skeletons.
 pending=block();try{await page.getByRole('textbox',{name:'Buscar negocios',exact:true}).fill('Sin coincidencias');await pending.requested;await expect(results).toHaveAttribute('aria-busy','true');await expect(page.locator('[data-business-id="1"]')).toHaveCount(0);await expect(results.locator('.mantine-Skeleton-root').first()).toBeVisible();}finally{pending.release();}
 await expect(page.getByRole('heading',{name:'Sin resultados por los filtros actuales',exact:true})).toBeVisible();await expect(results).toHaveAttribute('aria-busy','false');
 pending=block();version++;try{await pending.requested;await expect(results).toHaveAttribute('aria-busy','false');await expect(page.getByRole('heading',{name:'Sin resultados por los filtros actuales',exact:true})).toBeVisible();await expect(results.locator('.mantine-Skeleton-root')).toHaveCount(0);await page.screenshot({path:`test-results/business-empty-background-${width}.png`,animations:'disabled'});}finally{pending.release();}
 // The manual Update action remains visible and prevents another click while pending.
 pending=block();try{await page.getByRole('button',{name:'Actualizar',exact:true}).click();await pending.requested;await expect(results).toHaveAttribute('aria-busy','true');await expect(page.getByRole('button',{name:'Actualizar',exact:true})).toBeDisabled();await expect(results.locator('.mantine-Skeleton-root').first()).toBeVisible();}finally{pending.release();}
 await expect(results).toHaveAttribute('aria-busy','false');await expect(page.getByRole('heading',{name:'Sin resultados por los filtros actuales',exact:true})).toBeVisible();
});
