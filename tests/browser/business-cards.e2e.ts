import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {basePreferences} from '../../src/helpers/businessListPreferences';

for(const width of [1280,390])test(`business cards preserve fields, actions and narrow-container layout at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});const role=width===1280?'admin':'user';
 const columns=['nombre','email','ciudad','assignedUserEmail','tipo','subtipo','fechaProximaAccion','fuenteReferencia','telefono','actions'];
 const email='contacto-muy-largo-para-verificar-el-truncado@establecimiento.example.com';
 const rows=[1,2,3].map(id=>({id:String(-id),accountId:String(id),nombre:id===1?'Hostería del Río':id===2?'Un establecimiento con un nombre extenso que debe poder leerse completo':'Negocio sin información',ciudad:id===3?null:'Concepción del Uruguay',assignedUserEmail:id===2?'other@example.com':'owner@example.com',tipo:'Alojamientos',subtipo:'Hotel',email:id===3?null:email,telefono:id===3?null:'+54 3442 123456',fuenteReferencia:id===1?'Una descripción larga que usa el espacio disponible sin esconder información importante. '.repeat(3):null,canModify:id!==2||role==='admin',opportunityCount:id===1?2:0,contactCount:id===1?3:0,commercialStatus:id===1?'client':'prospect',fechaProximaAccion:id===1?new Date('2026-11-01T00:00:00Z'):null,nextActionTitle:'Llamar al responsable para revisar la propuesta'}));
 let gate:Promise<void>|null=null;const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({columns,dark})=>{localStorage.setItem('hospeda-live-mode','off');if(dark)localStorage.setItem('hospeda-theme-mode','dark');if(!localStorage.getItem('hospeda-business-list-v1-user-3'))localStorage.setItem('hospeda-business-list-v1-user-3',JSON.stringify({preferences:{...columns},context:{page:1,scrollY:0,scrollX:0}}));},{columns:{...basePreferences(),presentation:'grid',columns},dark:width===390});
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'owner@example.com',displayName:'Owner',role}};
  else if(url.pathname.endsWith('/business_list_defaults'))data={defaults:null};
  else if(url.pathname.endsWith('/saved_views'))data={views:[]};
  else if(url.pathname.endsWith('/settings'))data={users:[{id:3,email:'owner@example.com',displayName:'Owner',role:'user'},{id:4,email:'other@example.com',displayName:'Other',role:'user'}],cities:[{id:'1',name:'Concepción del Uruguay'}],types:['Alojamientos'],subtypes:[{id:'1',tipo:'Alojamientos',name:'Hotel'}],templates:[],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/leads')){if(gate)await gate;data={rows,total:3,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};}
  else if(url.pathname.endsWith('/commercial'))data={account:{id:url.searchParams.get('accountId'),nombre:'Hostería del Río',assignedUserEmail:'owner@example.com',archivedAt:null,mergedIntoId:null},contacts:[],opportunities:[],journal:[],leadJournal:[],stages:[]};
  else if(url.pathname.endsWith('/work'))data={tasks:[],activities:[],attention:[],accounts:[],opportunities:[],types:[],users:[],followup:{stages:[],newAssignmentDays:7}};
  else if(url.pathname.endsWith('/pipeline'))data={stages:[],insights:[],events:[],objections:[],lossReasons:[],objectionTypes:[],rules:[],users:[],verticals:[]};
  else if(url.pathname.endsWith('/resources'))data={documents:[],categories:[],maxDocumentBytes:2097152};
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts');let card=page.locator('[data-business-id="1"]');await expect(card).toBeVisible();
 await expect(card.getByText('2 gestiones · 3 contactos · Cliente',{exact:true})).toBeVisible();
 expect(await card.locator('[data-card-field]').evaluateAll(fields=>fields.map(field=>field.getAttribute('data-card-field')))).toEqual(columns.filter(key=>!['nombre','actions'].includes(key)));
 await expect(card.getByRole('group',{name:'Acciones de Hostería del Río',exact:true}).getByRole('button')).toHaveCount(role==='admin'?3:2);
 if(role==='user'){await expect(page.locator('[data-business-id="2"]').getByRole('button',{name:'Contactar',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Archivar negocio',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:/Editar responsable de/})).toHaveCount(0);}
 const emptyCard=page.locator('[data-business-id="3"]');
 for(const key of ['ciudad','email','telefono','fuenteReferencia','fechaProximaAccion'])await expect(emptyCard.locator(`[data-card-field="${key}"]`)).toHaveCount(0);
 await expect(emptyCard.getByText('Potencial cliente',{exact:true})).toBeVisible();
 const contact=card.getByLabel('Email: '+email,{exact:true});await contact.focus();await expect(page.getByRole('tooltip')).toContainText(email);await page.keyboard.press('Tab');
 const description=card.locator('[data-card-field="fuenteReferencia"]');expect(await description.evaluate(element=>element.scrollHeight<=element.clientHeight)).toBe(true);
 await page.getByRole('button',{name:'Grilla',exact:true}).focus();await page.mouse.move(0,0);await expect(page.getByRole('tooltip')).toHaveCount(0);await card.scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/business-cards-${width}.png`,animations:'disabled'});
 if(width===1280){
  // A narrow desktop container must use the same compact composition as mobile.
  await page.addStyleTag({content:'.mantine-SimpleGrid-root{max-width:280px}'});
  const city=card.locator('[data-card-field="ciudad"]'),owner=card.locator('[data-card-field="assignedUserEmail"]');await expect.poll(async()=>Math.abs((await city.boundingBox())!.x-(await owner.boundingBox())!.x)).toBeLessThan(1);
 }
 await card.scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/business-cards-narrow-${width}.png`,animations:'disabled'});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 // Column visibility and ordering still use the shared preferences editor.
 await page.getByRole('button',{name:'Columnas',exact:true}).click();let options=page.getByRole('dialog',{name:'Columnas del listado',exact:true});await options.getByRole('checkbox',{name:'Email',exact:true}).uncheck();await options.getByRole('button',{name:'Subir Responsable',exact:true}).click();await options.getByRole('checkbox',{name:'Acciones',exact:true}).uncheck();await options.getByRole('button',{name:'Cerrar columnas',exact:true}).click();
 await expect(card.locator('[data-card-field="email"]')).toHaveCount(0);await expect(card.getByRole('group',{name:/Acciones de/})).toHaveCount(0);await expect(card.locator('[data-card-field]').first()).toHaveAttribute('data-card-field','assignedUserEmail');
 await page.getByRole('button',{name:'Columnas',exact:true}).click();options=page.getByRole('dialog',{name:'Columnas del listado',exact:true});for(const label of ['Responsable','Vertical','Subtipo','Próximo paso','Fuente de referencia','Teléfono'])await options.getByRole('checkbox',{name:label,exact:true}).uncheck();await options.getByRole('button',{name:'Cerrar columnas',exact:true}).click();await expect(card.locator('[data-card-field]')).toHaveCount(1);await expect(card.locator('[data-card-field]')).toHaveAttribute('data-card-field','ciudad');
 await card.getByRole('button',{name:'Abrir negocio Hostería del Río',exact:true}).focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/accounts\/1$/);await page.getByRole('link',{name:'← Volver al listado de negocios',exact:true}).click();card=page.locator('[data-business-id="1"]');await expect(card.getByRole('button',{name:'Abrir negocio Hostería del Río',exact:true})).toBeFocused();await expect(card.locator('[data-card-field="email"]')).toHaveCount(0);
 let release!:()=>void;gate=new Promise<void>(resolve=>{release=resolve;});await page.getByRole('textbox',{name:'Buscar negocios',exact:true}).fill('Nueva consulta');await expect(page.getByRole('region',{name:'Resultados de negocios',exact:true})).toHaveAttribute('aria-busy','true');await expect(page.locator('[data-business-id]')).toHaveCount(0);await expect(page.locator('article[aria-hidden="true"]').first()).toBeVisible();release();gate=null;await expect(card).toBeVisible();
 await page.getByRole('button',{name:'Pantalla completa',exact:true}).click();await expect(page.getByRole('dialog',{name:'Resultados de negocios en pantalla completa',exact:true})).toBeVisible();await expect(card).toBeVisible();await page.getByRole('button',{name:'Salir de pantalla completa',exact:true}).click();await expect(page.getByRole('button',{name:'Pantalla completa',exact:true})).toBeFocused();expect(errors).toEqual([]);
});
