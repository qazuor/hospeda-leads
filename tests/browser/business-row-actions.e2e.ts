import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {basePreferences} from '../../src/helpers/businessListPreferences';
for(const role of ['user','admin'])for(const width of [1280,390])test(`business row actions respect ${role} permissions at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});const mutations:any[]=[];let releaseDetail!:()=>void;const detailGate=new Promise<void>(resolve=>{releaseDetail=resolve;});
 await page.addInitScript(preferences=>{localStorage.setItem('hospeda-live-mode','off');localStorage.setItem('hospeda-business-list-v1-user-3',JSON.stringify({preferences,context:{page:1,scrollY:0,scrollX:0}}));},{...basePreferences(),columns:['nombre','ciudad','actions'],pins:{actions:'right'}});
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'owner@example.com',displayName:'Owner',role}};
  else if(url.pathname.endsWith('/business_list_defaults'))data={defaults:null};
  else if(url.pathname.endsWith('/settings'))data={users:[],cities:[],types:[],templates:[],subtypes:[],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/saved_views'))data={views:[]};
  else if(url.pathname.endsWith('/pipeline'))data={stages:[]};
  else if(url.pathname.endsWith('/communication'))data={recentMessages:[],resources:[]};
  else if(url.pathname.endsWith('/commercial')){
   if(route.request().method()==='POST'){const mutation=superjson.parse<any>(route.request().postData()!);mutations.push(mutation);data={id:mutation.accountId};}
   else {await detailGate;const id=url.searchParams.get('accountId');data={account:{id,nombre:'Negocio '+id,assignedUserEmail:id==='2'?'other@example.com':'owner@example.com',archivedAt:null,email:null,telefono:null},contacts:[],opportunities:[],journal:[],leadJournal:[],stages:[]};}
  }
  else if(url.pathname.endsWith('/leads'))data={rows:[1,2].map(id=>({id:String(-id),accountId:String(id),nombre:'Negocio '+id,ciudad:'Colón',canModify:id===1||role==='admin',opportunityCount:0,contactCount:0})),total:2,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts');const first=page.getByRole('group',{name:'Acciones de Negocio 1',exact:true});await expect(first).toBeVisible();
 await expect(first.getByRole('button')).toHaveCount(3);
 const sizes=await first.getByRole('button').evaluateAll(buttons=>buttons.map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height})));expect(sizes.every(s=>s.width===(width<768?44:32)&&s.height===(width<768?44:32))).toBe(true);
 if(role==='user'){await expect(page.getByRole('group',{name:'Acciones de Negocio 2',exact:true}).getByRole('button',{name:'Contactar',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Archivar negocio',exact:true})).toHaveCount(0);}
 await first.getByRole('button',{name:'Contactar',exact:true}).click();await expect(page.getByRole('dialog',{name:'Preparar contacto',exact:true}).getByRole('status')).toContainText('Cargando datos para contactar');releaseDetail();await expect(page.getByRole('dialog',{name:'Contactar',exact:true})).toBeVisible();await expect(page.getByText('Sin gestiones abiertas.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Cancelar',exact:true}).click();expect(mutations).toEqual([]);
 await page.screenshot({path:`test-results/business-row-actions-${role}-${width}.png`,animations:'disabled'});
 if(role==='admin'){
  await first.getByRole('button',{name:'Más acciones de Negocio 1',exact:true}).click();await page.getByRole('menuitem',{name:'Archivar negocio',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Archivar negocio',exact:true});await expect(dialog).toBeVisible();await expect(dialog).toContainText('Sus personas, gestiones, tareas e historial se conservan');
  await dialog.getByRole('textbox',{name:'Motivo (al menos 3 caracteres)',exact:true}).fill('Registro revisado por admin');await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await expect(dialog).toHaveCount(0);expect(mutations).toEqual([{action:'account_archive',accountId:'1',archived:true,reason:'Registro revisado por admin'}]);await expect(page.getByText('Negocio archivado. Datos e historial conservados.',{exact:true})).toBeVisible();
 }
});
