import {test,expect} from '@playwright/test';
import {createHmac,randomUUID} from 'node:crypto';
import postgres from 'postgres';
import superjson from 'superjson';
import {encryptInstagramToken} from '../../src/helpers/instagram';
import {NO_SECRET_SNAPSHOT,assertLocalTestDatabase,cleanupThenRestore,restoreInstagramSecret,snapshotInstagramSecret,type SecretQuery} from '../../scripts/lib/instagram-secret';

/**
 * Spec 92: «Abrir Instagram» from the composer. The seller prepares the message, the CRM copies it and opens the
 * business profile on a computer (window.open is stubbed: nothing reaches Instagram), the bubble waits for the echo, and a signed echo
 * (as Meta would send it) confirms the same attempt. Needs the server and this process to share INSTAGRAM_APP_SECRET,
 * INSTAGRAM_ACCOUNT_ID and INTEGRATION_SECRETS_KEY (CI sets fake values on both steps).
 */
const secret=process.env.INSTAGRAM_APP_SECRET,igAccount=process.env.INSTAGRAM_ACCOUNT_ID,keyText=process.env.INTEGRATION_SECRETS_KEY;
const shots=process.env.CRM_E2E_SCREENSHOTS;// optional folder for review screenshots
let sql:ReturnType<typeof postgres>;let secretSnapshot=NO_SECRET_SNAPSHOT;const secretQuery:SecretQuery=async(text,params=[])=>await sql.unsafe(text,[...params] as never[]);let accountId:string|undefined;const igsid=String(17000000000000000n+BigInt(Date.now()%1000000000));
test.beforeAll(async()=>{
 test.skip(!secret||!igAccount||!keyText,'Instagram webhook env not configured for this server');
 // This test writes to the database (secret, fixtures): only a local disposable one.
 assertLocalTestDatabase({url:process.env.DATABASE_URL,optIn:process.env.CRM_TEST_DATABASE});
 sql=postgres(process.env.DATABASE_URL!,{max:1,...(process.env.CRM_TEST_DATABASE==='1'&&process.env.CRM_TEST_DATABASE_SOCKET?{path:process.env.CRM_TEST_DATABASE_SOCKET}:{})});
 secretSnapshot=await snapshotInstagramSecret({query:secretQuery});
 // A fresh token so the server neither renews it nor calls Meta; the chat profile is cached, so no lookup either.
 const e=encryptInstagramToken('e2e-token-'+randomUUID(),Buffer.from(keyText!,'base64'));
 await sql`INSERT INTO crm_integration_secrets(name,ciphertext,iv,tag,expires_at,refreshed_at,last_error) VALUES('instagram',${e.ciphertext},${e.iv},${e.tag},now()+interval '30 days',now(),NULL) ON CONFLICT(name) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,tag=excluded.tag,expires_at=excluded.expires_at,refreshed_at=excluded.refreshed_at,last_error=NULL`;
});
test.afterAll(async()=>{
 if(!sql)return;
 try{
  await cleanupThenRestore({onCleanupError:error=>console.error('Fixture cleanup failed',error),restore:()=>restoreInstagramSecret({query:secretQuery,snapshot:secretSnapshot}),cleanup:async()=>{
  if(accountId){
   const ids=[accountId];
   for(const table of ['crm_communication_journal','crm_communication_reads','crm_messages','crm_activities','crm_tasks','crm_inbound_messages','lead_journal','crm_pipeline_events','crm_objections','leads','crm_commercial_journal','crm_work_journal'])await sql.unsafe(`DELETE FROM ${table} WHERE account_id=ANY($1::bigint[])`,[ids]);
   await sql`DELETE FROM crm_accounts WHERE id=${accountId}::bigint`;
  }
  await sql`DELETE FROM crm_instagram_contacts WHERE igsid=${igsid}`;
  }});
 }finally{await sql.end();}
});

test('opens the Instagram chat, waits for the echo and resolves the same attempt',async({page,context,baseURL})=>{
 test.setTimeout(180000);
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:baseURL});
 await page.setViewportSize({width:1280,height:900});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('hospeda-live-mode','off');(window as unknown as {__opened:string[]}).__opened=[];window.open=((url?:string|URL)=>{const opened=(window as unknown as {__opened:string[]}).__opened;opened.push(String(url));const tab={closed:false,opener:{},close(){},location:{set href(v:string){opened.push(v)},get href(){return opened[opened.length-1]}}};return tab as unknown as Window;}) as typeof window.open;});
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 async function api(endpoint:string,body?:unknown){const result=await page.evaluate(async({endpoint,body})=>{const r=await fetch('/_api/'+endpoint,body?{method:'POST',headers:{'Content-Type':'application/json'},body}:{});return {status:r.status,text:await r.text()}},{endpoint,body:body?superjson.stringify(body):undefined});expect(result.status,result.text).toBe(200);return superjson.parse<any>(result.text);}
 const username='zz_e2e_'+Date.now().toString(36);
 accountId=String((await api('commercial',{action:'account_save',nombre:'Zz Instagram e2e '+Date.now(),perfilInstagram:'https://www.instagram.com/'+username+'/',assignedUserEmail:'admin@example.com'})).id);
 await api('commercial',{action:'business_status',accountId,status:'reviewed',recontactAt:null});
 await api('commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:'Presentación Instagram',estado:'Cargado'});
 await sql`INSERT INTO crm_instagram_contacts(igsid,username,name,fetched_at) VALUES(${igsid},${username},'Zz e2e',now()) ON CONFLICT(igsid) DO UPDATE SET username=excluded.username,fetched_at=now()`;

 await page.goto('/accounts/'+accountId);await page.getByRole('button',{name:'Contactar',exact:true}).first().click();let dialog=page.getByRole('dialog');
 await dialog.getByRole('combobox',{name:'¿Sobre qué?',exact:true}).click();await dialog.getByRole('listbox',{name:'¿Sobre qué?',exact:true}).getByRole('option',{name:/^Una gestión: Presentación Instagram/}).click();
 const channel=dialog.getByRole('combobox',{name:'Canal',exact:true});await expect(channel.locator('option')).toHaveText(['WhatsApp','Email · Brevo','Instagram','Llamada','Red social','Otro canal']);
 await channel.selectOption('instagram');await expect(dialog.getByText('@'+username,{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Continuar con el mensaje',exact:true}).click();dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Escribir un mensaje nuevo',exact:true}).click();
 const text='Hola, soy de Hospeda. Te escribo para contarte cómo difundimos alojamientos de Colón en la plataforma. ¿Te interesa?';
 await dialog.getByRole('textbox',{name:'Mensaje final',exact:true}).fill(text);
 await dialog.getByRole('button',{name:'Guardar y ver contenido final'}).click();
 await expect(dialog.getByRole('group',{name:'Antes de abrir Instagram'})).toContainText('en la computadora, el perfil de @'+username+', donde tocás «Enviar mensaje».');
 await dialog.getByLabel('Revisé destinatario y contenido final').check();
 if(shots){for(const close of await page.locator('[data-sonner-toast] [data-close-button]').all())await close.click().catch(()=>{});await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);await dialog.getByRole('button',{name:'Abrir Instagram',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:shots+'/1-composer-instagram.png'});}
 await dialog.getByRole('button',{name:'Abrir Instagram',exact:true}).click();
 await expect(dialog.getByText('Esperando que Instagram confirme el envío…').first()).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {__opened:string[]}).__opened)).toEqual(['about:blank','https://www.instagram.com/'+username+'/']);// desktop: ig.me does not work on Instagram Web
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(text);
 await expect(page.getByText(/^Mensaje copiado\. En el perfil tocá «Enviar mensaje» y pegalo/)).toBeVisible();
 if(shots)await page.screenshot({path:shots+'/2-copied-and-opened.png'});
 const attempt=(await api('communication?accountId='+accountId)).messages.find((m:any)=>m.channel==='social'&&m.status==='instagram_opened');expect(attempt.recipient).toBe('@'+username);

 // The conversation shows the dashed bubble while waiting.
 await page.goto('/accounts/'+accountId+'?tab=comunicacion');
 const bubble=page.locator('article').filter({hasText:text.slice(0,40)}).first();
 await expect(bubble).toContainText('Esperando que Instagram confirme el envío…');
 if(shots)await bubble.screenshot({path:shots+'/3-waiting-bubble.png'});

 // Meta sends the echo of what the seller pasted: the same attempt becomes «confirmado por Instagram».
 const raw=JSON.stringify({object:'instagram',entry:[{id:igAccount,messaging:[{sender:{id:igAccount},recipient:{id:igsid},timestamp:Date.now(),message:{mid:'e2e-'+randomUUID(),text:text+' Saludos!',is_echo:true}}]}]});
 const hook=await page.request.post('/_api/inbound/instagram',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+createHmac('sha256',secret!).update(raw).digest('hex')},data:raw});expect(hook.status()).toBe(200);
 await expect.poll(async()=>(await api('communication?accountId='+accountId)).messages.filter((m:any)=>m.channel==='social').map((m:any)=>[m.id,m.status])).toEqual([[attempt.id,'manual_sent']]);
 await page.reload();
 const resolved=page.locator('article').filter({hasText:'Enviado · confirmado por Instagram'}).first();
 await expect(resolved).toContainText(text.slice(0,40));await expect(resolved).not.toContainText('Esperando que Instagram confirme');
 if(shots)await resolved.screenshot({path:shots+'/4-resolved-bubble.png'});
 expect(errors).toEqual([]);
 await page.evaluate(()=>fetch('/_api/auth/logout',{method:'POST'}));
});
