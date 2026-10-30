import {test,expect,type Page,type Route} from '@playwright/test';
import superjson from 'superjson';

// Bandeja (B2). The test seed has no inbound messages and the app cannot create one without the inbound webhook token, so
// scenario (a) serves the inbound row through route mocks on top of a real business; (b) and (c) use only real data
// created through the app API. Every business created here is sent to the Papelera at the end, which removes it from the Bandeja.
type Api=(endpoint:string,body?:unknown)=>Promise<any>;
async function login(page:Page):Promise<Api>{
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 // The session cookie is Secure, so page.request would drop it over http: call the API from the page itself.
 return async(endpoint,body)=>{const result=await page.evaluate(async({endpoint,body})=>{const r=await fetch('/_api/'+endpoint,body?{method:'POST',headers:{'Content-Type':'application/json'},body}:{});return {status:r.status,text:await r.text()}},{endpoint,body:body?superjson.stringify(body):undefined});expect(result.status,result.text).toBe(200);return superjson.parse<any>(result.text)};
}
async function createConversation(api:Api,label:string,body:string){
 const stamp=Date.now();
 const accountId=String((await api('commercial',{action:'account_save',nombre:`${label} ${stamp}`,assignedUserEmail:'admin@example.com'})).id);
 const leadId=String((await api('commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:`Gestión ${label} ${stamp}`,estado:'Cargado'})).id);
 await api('communication',{action:'manual_start',id:crypto.randomUUID(),accountId,leadId,contactId:null,channel:'call',purpose:null,otherPurpose:null,recipient:'Recepción',recipientName:'Recepción',destination:null,body,result:'manual_sent',templateId:null});
 return {accountId,leadId,name:`${label} ${stamp}`,management:`Gestión ${label} ${stamp}`,stamp};
}
const trash=(api:Api,accountId:string)=>api('commercial',{action:'account_trash',accountIds:[accountId],deleted:true,reason:'Limpieza de la prueba de Bandeja'});
const noHorizontalScroll=async(page:Page)=>expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

test('(a) an admin opens the Bandeja, dismisses a pending inbound and the pending count goes down; reload keeps the selection',async({page})=>{
 test.setTimeout(120000);
 const api=await login(page);const stamp=Date.now();
 const accountId=String((await api('commercial',{action:'account_save',nombre:`Bandeja pendiente ${stamp}`,assignedUserEmail:'admin@example.com'})).id),name=`Bandeja pendiente ${stamp}`;
 const inboundId=crypto.randomUUID(),at='2026-10-26T13:00:00.000Z',text=`Hola, ¿tienen lugar para enero? ${stamp}`;
 let pending=true;const dismissed:unknown[]=[];
 const send=(route:Route,data:unknown)=>route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 await page.route('**/_api/inbox/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  const business={accountId,accountName:name,lastActivityAt:at,lastChannel:'email',lastDirection:'in',lastPreview:text,pendingCount:pending?1:0};
  if(path.endsWith('/inbox/businesses'))return send(route,{rows:url.searchParams.get('filter')==='all'||pending?[business]:[],nextCursor:null});
  if(path.endsWith('/inbox/threads'))return send(route,{rows:[{leadId:null,leadTitle:'General',channel:'email',lastActivityAt:at,messageCount:1,pendingCount:pending?1:0}]});
  if(path.endsWith('/inbox/thread'))return send(route,{rows:[{kind:'in',id:inboundId,at,channel:'email',status:pending?'pending_review':'dismissed',text,summary:null,authorEmail:null,fromName:'Ana',fromAddress:'ana@example.com',pending,dismissed:!pending,isManualLog:false,replyAvailable:false,replyRestricted:false}],nextCursor:null});
  return route.continue();
 });
 await page.route('**/_api/communication**',async route=>{
  const request=route.request();
  if(request.method()==='POST'){const input=superjson.parse<any>(request.postData()??'');if(input.action==='inbound_dismiss'&&input.inboundId===inboundId){dismissed.push(input);pending=false;return send(route,{ok:true})}return route.continue();}
  const response=await route.fetch(),data=superjson.parse<any>(await response.text());
  if(new URL(request.url()).searchParams.get('accountId')===accountId)data.inbound=[{id:inboundId,channel:'email',receivedAt:new Date(at),fromAddress:'ana@example.com',fromName:'Ana',subject:'Consulta',textBody:text,status:pending?'pending_review':'dismissed',isAutomatic:false,matchMethod:'address',leadId:null,contextName:'General',linkedMessageId:null,responseId:null,attachments:[],canReply:false,replyAvailable:false,replyRestricted:false}];
  return send(route,data);
 });
 try{
  await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('link',{name:'Bandeja',exact:true}).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByRole('button',{name:'A revisar · 1',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:new RegExp(name)}).click();
  await expect(page).toHaveURL(new RegExp(`account=${accountId}&lead=none&channel=email`));
  await expect(page.getByRole('heading',{name:'General · Email',exact:true})).toBeVisible();
  const bubble=page.locator('article').filter({hasText:text});
  await expect(bubble).toContainText('Recibido · a revisar');
  await bubble.getByRole('button',{name:'No es una respuesta',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Descartar email'});
  await dialog.getByLabel('Motivo').fill('Es una consulta de otro negocio');
  await dialog.getByRole('button',{name:'Descartar email',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  expect(dismissed).toEqual([expect.objectContaining({action:'inbound_dismiss',inboundId,reason:'Es una consulta de otro negocio'})]);
  await expect(page.getByRole('button',{name:'A revisar · 0',exact:true})).toBeVisible();
  await expect(page.getByText('No tenés conversaciones a revisar.')).toBeVisible();
  await expect(bubble).toContainText('Descartado');
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`account=${accountId}&lead=none&channel=email`));
  await expect(page.getByRole('heading',{name:'General · Email',exact:true})).toBeVisible();
  await expect(page.locator('article').filter({hasText:text})).toContainText('Descartado');
 }finally{await page.unrouteAll({behavior:'ignoreErrors'});await trash(api,accountId);}
});

test('(b) search ignores accents, keeps ñ distinct, marks the match and opens the conversation at that message',async({page})=>{
 test.setTimeout(120000);
 const api=await login(page);const stamp=Date.now();
 const fixture=await createConversation(api,'Bandeja búsqueda',`Charlamos sobre la ampliación del quincho; queda la señal${stamp} para el lunes`);
 try{
  await page.goto('/inbox');
  const search=page.getByLabel('Buscar en todas las conversaciones');
  await search.fill('am');await expect(page.getByText('Escribí al menos 3 letras',{exact:true})).toBeVisible();
  const results=page.getByRole('region',{name:'Resultados de la búsqueda'});
  const row=results.getByRole('button').filter({hasText:fixture.name});
  await search.fill('ampliacion del quincho');
  await expect(row).toBeVisible();
  await expect(row.locator('mark')).toHaveText('ampliación del quincho');
  await expect(row).toContainText(`${fixture.name} · ${fixture.management}`);
  await expect(row).toContainText('Enviado');
  await search.fill('ampliación del quincho');
  await expect(row.locator('mark')).toHaveText('ampliación del quincho');
  await search.fill(`senal${stamp}`);
  await expect(results.getByText(`No encontramos mensajes con «senal${stamp}».`)).toBeVisible();
  await search.fill(`señal${stamp}`);
  await expect(results.getByText('1 resultado',{exact:true})).toBeVisible();
  await expect(row.locator('mark')).toHaveText(`señal${stamp}`);
  await row.click();
  await expect(page).toHaveURL(new RegExp(`account=${fixture.accountId}&lead=${fixture.leadId}&channel=call&message=out%3A`));
  await expect(page.getByText(`Búsqueda activa: “señal${stamp}”`)).toBeVisible();
  await expect(results).toHaveCount(0);
  const bubble=page.locator('article').filter({hasText:`señal${stamp}`});
  await expect(bubble).toBeVisible();await expect(bubble).toBeInViewport();
  await expect(bubble).toHaveAttribute('data-highlighted','true');
  await page.getByRole('button',{name:'← Volver a los resultados'}).click();
  await expect.poll(()=>page.evaluate(()=>new URLSearchParams(location.search).get('q'))).toBe(`señal${stamp}`);
  await expect(results).toBeVisible();await expect(row).toBeVisible();
  await row.click();await page.goBack();
  await expect(results).toBeVisible();await expect(row).toBeVisible();
 }finally{await trash(api,fixture.accountId);}
});

test('(c) at 390px the Bandeja stacks list, conversations and detail with back navigation and no horizontal scroll',async({page})=>{
 test.setTimeout(120000);
 await page.setViewportSize({width:390,height:844});
 const api=await login(page);
 const fixture=await createConversation(api,'Bandeja móvil','Llamé y quedamos en hablar la semana que viene');
 try{
  await page.goto('/inbox');
  await page.getByRole('button',{name:'Todas',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Negocios',exact:true})).toBeVisible();await noHorizontalScroll(page);
  await page.getByRole('button',{name:new RegExp(fixture.name)}).click();
  await expect(page.getByRole('heading',{name:'Conversaciones del negocio',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Negocios',exact:true})).toBeHidden();await noHorizontalScroll(page);
  await page.getByRole('button',{name:new RegExp(fixture.management)}).click();
  await expect(page.getByRole('heading',{name:`${fixture.management} · Llamada`,exact:true})).toBeVisible();
  await expect(page.getByText('Llamé y quedamos en hablar la semana que viene')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Conversaciones del negocio',exact:true})).toBeHidden();await noHorizontalScroll(page);
  await page.getByRole('button',{name:'Volver',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Conversaciones del negocio',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Volver',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Negocios',exact:true})).toBeVisible();await noHorizontalScroll(page);
 }finally{await trash(api,fixture.accountId);}
});

test('(d) a seller sees only their businesses',async()=>{
 // scripts/seed-test.mjs creates only admin@example.com, and a seller cannot get a password without the recovery email.
 // The seller visibility rule is covered against the database by `npm run test:inbox` (scripts/test-inbox.ts).
 test.skip(true,'The test seed has no seller account to log in with.');
});
