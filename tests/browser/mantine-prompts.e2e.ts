import {test,expect} from '@playwright/test';
import superjson from 'superjson';

const settings={users:[],cities:[],types:[],templates:[],subtypes:[],authorizedEmails:[],opportunityStages:[]};
for(const width of [1280,390])for(const channel of ['email','whatsapp'])test(`link dialog preserves selection, validation and focus at ${width}px ${channel}`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 const writes:string[]=[],errors:string[]=[],native:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async dialog=>{native.push(dialog.type());await dialog.dismiss()});
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(route.request().method()==='POST')writes.push(path);
  const data=path.endsWith('/auth/session')?{user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}}:
   path.endsWith('/settings')?settings:path.endsWith('/leads')?{rows:[],total:0,page:1,pageSize:100}:{};
  await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/settings?section=templates');
 await page.getByRole('combobox',{name:/^Canal/}).selectOption(channel);
 const editor=page.getByRole('textbox',{name:'Contenido del modelo',exact:true});
 await editor.fill('Visitar Hospeda hoy');
 await editor.evaluate(node=>{
  const text=node.querySelector('p')!.firstChild!;
  const range=document.createRange();range.setStart(text,8);range.setEnd(text,15);
  const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
 });
 await expect.poll(()=>page.evaluate(()=>window.getSelection()?.toString())).toBe('Hospeda');
 await page.getByRole('button',{name:'Agregar link',exact:true}).click();
 const dialog=page.getByRole('dialog');const url=dialog.getByRole('textbox',{name:'URL del enlace',exact:true});
 await expect(url).toBeFocused();await url.fill('https://');await url.press('Enter');
 await expect(dialog.getByRole('alert')).toContainText('URL válida');
 await url.fill('javascript:alert(1)');await url.press('Enter');await expect(dialog.getByRole('alert')).toContainText('no está permitido');
 await expect(editor.locator('a')).toHaveCount(0);
 await url.fill('hospeda.com.ar/reservas');await url.press('Enter');
 await expect(dialog).toHaveCount(0);await expect(editor).toBeFocused();
 await expect(editor.locator('a')).toHaveText('Hospeda');await expect(editor.locator('a')).toHaveAttribute('href','https://hospeda.com.ar/reservas');
 await page.getByRole('button',{name:'Agregar link',exact:true}).click();
 await expect(url).toHaveValue('https://hospeda.com.ar/reservas');await url.fill('https://example.com/cambio');await page.keyboard.press('Escape');
 await expect(editor).toBeFocused();await expect(editor.locator('a')).toHaveAttribute('href','https://hospeda.com.ar/reservas');
 await page.getByRole('button',{name:'Agregar link',exact:true}).click();await url.fill('https://example.com/nuevo');
 await page.screenshot({path:`test-results/link-dialog-${width}-${channel}.png`,fullPage:true});
 await page.evaluate(()=>document.body.classList.add('dark'));await page.screenshot({path:`test-results/link-dialog-${width}-${channel}-dark.png`,fullPage:true});await page.evaluate(()=>document.body.classList.remove('dark'));
 await dialog.getByRole('button',{name:'Guardar enlace',exact:true}).click();
 await expect(editor.locator('a')).toHaveAttribute('href','https://example.com/nuevo');
 await page.getByRole('button',{name:'Quitar link',exact:true}).click();await expect(editor.locator('a')).toHaveCount(0);
 await editor.fill('');await page.getByRole('button',{name:'Agregar link',exact:true}).click();
 await url.fill('https://example.com/cursor');await url.press('Enter');
 await expect(editor).toBeFocused();await editor.pressSequentially('Nueva visita');
 await expect(editor.locator('a')).toHaveText('Nueva visita');await expect(editor.locator('a')).toHaveAttribute('href','https://example.com/cursor');
 expect(writes).toEqual([]);expect(errors).toEqual([]);expect(native).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});

for(const width of [1280,390])for(const role of ['admin','user'])test(`restriction dialog respects permissions and preserves retries at ${width}px ${role}`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 const writes:any[]=[],errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const lead={id:'201',accountId:'101',nombre:'Negocio de prueba',opportunityName:'Gestión de prueba',email:'fixture@example.com',assignedUserEmail:'owner@example.com',estado:'Cargado',deletedAt:null};
 const restriction={id:'301',leadId:'201',contactId:'401',channel:'email',reason:'Solicitud original',actorEmail:'admin@example.com',createdAt:new Date(),liftedAt:null as Date|null,liftReason:null as string|null};
 let calls=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve});
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;let data:unknown={};
  if(path.endsWith('/auth/session'))data={user:{id:3,email:'owner@example.com',displayName:'Owner',role}};
  else if(path.endsWith('/settings'))data=settings;
  else if(path.endsWith('/leads'))data={rows:[lead],total:1,page:1,pageSize:10};
  else if(path.endsWith('/lead_notes'))data={notes:[]};else if(path.endsWith('/lead_journal'))data={rows:[],total:0,page:1,pageSize:50,filters:{actions:[],actors:[],cities:[],types:[],leads:[]}};
  else if(path.endsWith('/commercial'))data={account:{id:'101',nombre:'Negocio de prueba',assignedUserEmail:'owner@example.com',commercialStatus:'prospect',archivedAt:null,mergedIntoId:null},opportunities:[lead],contacts:[{id:'401',name:'Ana Contacto',email:'ana@example.com',deletedAt:null}],journal:[],leadJournal:[],stages:[],users:[]};
  else if(path.endsWith('/work'))data={activities:[],tasks:[],types:[],users:[],attention:[],contacts:[]};
  else if(path.endsWith('/pipeline'))data={stages:[],insights:[],events:[],objections:[],lossReasons:[],objectionTypes:[],rules:[],users:[],verticals:[]};
  else if(path.endsWith('/communication')){
   if(route.request().method()==='POST'){
    const input=superjson.parse<any>(route.request().postData()!);writes.push(input);
    if(input.action==='prepare'){
     await route.fulfill({contentType:'application/json',body:superjson.stringify({id:input.id,accountId:'101',leadId:'201',contactId:'401',channel:'email',recipient:'ana@example.com',recipientName:'Ana Contacto',subject:'Prueba de enlace',body:'<p>Mensaje inicial</p>',status:'draft',revision:1,ownerEmail:'owner@example.com',createdAt:new Date(),updatedAt:new Date(),textBody:null,htmlBody:null,templateSnapshot:null})});return;
    }
    calls++;
    if(calls===1){await gate;await route.fulfill({status:500,contentType:'application/json',body:superjson.stringify({error:'No se pudo levantar'})});return;}
    restriction.liftedAt=new Date();restriction.liftReason=writes[1].reason;data={ok:true};
   }else data={restrictions:[restriction],messages:[],recentMessages:[],sequences:[],runs:[],recentContactHours:24};
  }
  await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/sales/201');await page.getByRole('tab',{name:'Mensajes',exact:true}).click();
 await page.getByRole('button',{name:'Restricciones de contacto',exact:true}).click();
 // Wait for the accordion's clipping animation before scrolling/clicking its last action.
 await expect.poll(()=>page.getByRole('region',{name:'Restricciones de contacto',exact:true}).evaluate(el=>getComputedStyle(el).overflow)).toBe('visible');
 const open=page.getByRole('button',{name:'Levantar restricción',exact:true});
 if(role==='user'){await expect(open).toHaveCount(0);expect(writes).toEqual([]);expect(errors).toEqual([]);return;}
 await open.click();const dialog=page.getByRole('dialog');
 await expect(dialog).toContainText('Email · Ana Contacto');await expect(dialog).toContainText('Solicitud original');
 const reason=dialog.getByRole('textbox',{name:'Motivo para levantar la restricción',exact:true});await expect(reason).toBeFocused();
 await expect(dialog.getByRole('button',{name:'Confirmar levantamiento',exact:true})).toBeDisabled();
 await reason.fill('Pedido confirmado por Ana');await dialog.getByRole('button',{name:'Confirmar levantamiento',exact:true}).dblclick();
 await expect(dialog.getByRole('button',{name:'Levantando restricción…',exact:true})).toBeDisabled();await expect(reason).toBeDisabled();
 await page.keyboard.press('Escape');await expect(dialog).toBeVisible();expect(writes).toHaveLength(1);release();
 await expect(dialog.getByRole('alert')).toContainText('El motivo se conserva');await expect(reason).toHaveValue('Pedido confirmado por Ana');
 await page.screenshot({path:`test-results/restriction-dialog-${width}.png`,fullPage:true});
 await page.evaluate(()=>document.body.classList.add('dark'));await page.screenshot({path:`test-results/restriction-dialog-${width}-dark.png`,fullPage:true});await page.evaluate(()=>document.body.classList.remove('dark'));
 await dialog.getByRole('button',{name:'Confirmar levantamiento',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('status')).toContainText('Restricción levantada. No se enviaron mensajes ni se reanudaron seguimientos.');
 await expect(page.locator('[data-lifted-restriction="301"]')).toBeFocused();
 await expect(page.getByRole('article')).toContainText('Pedido confirmado por Ana');
 expect(writes).toEqual(Array(2).fill({action:'lift',id:'301',reason:'Pedido confirmado por Ana'}));expect(errors).toEqual([]);
 // Exercise the actual message dialog locally, including parent focus after closing its child.
 await page.goto('/sales/201?contact=email');
 const parent=page.getByRole('dialog').last();await parent.getByRole('button',{name:'Escribir un mensaje nuevo',exact:true}).click();
 const editor=parent.getByRole('textbox',{name:'Mensaje final',exact:true});await editor.fill('Mensaje con enlace');await editor.press('ControlOrMeta+a');
 await parent.getByRole('button',{name:'Agregar link',exact:true}).click();const child=page.getByRole('dialog').last();
 await child.getByLabel('URL del enlace',{exact:true}).fill('https://example.com/cancelar');await page.keyboard.press('Escape');
 await expect(editor).toBeFocused();await expect(editor.locator('a')).toHaveCount(0);
 await parent.getByRole('button',{name:'Agregar link',exact:true}).click();await child.getByLabel('URL del enlace',{exact:true}).fill('https://example.com/anidado');
 await child.getByRole('button',{name:'Guardar enlace',exact:true}).click();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(editor).toBeFocused();await expect(editor.locator('a')).toHaveAttribute('href','https://example.com/anidado');
 expect(writes.filter(input=>input.action==='prepare')).toHaveLength(1);expect(errors).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});
