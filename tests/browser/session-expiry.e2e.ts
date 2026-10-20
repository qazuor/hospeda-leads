import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {localDay} from '../../src/helpers/workDates';

test('an expired session re-logs in from a dialog and keeps the unsaved draft',async({page})=>{
 test.setTimeout(120000);
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/\/my-day$/);
 const name='Sesión E2E '+Date.now();const title='Llamar después del vencimiento '+Date.now();
 const r=await page.evaluate(async body=>{const response=await fetch('/_api/commercial',{method:'POST',body,headers:{'Content-Type':'application/json'}});return {status:response.status,text:await response.text()};},superjson.stringify({action:'account_save',nombre:name,ciudad:'Colón',assignedUserEmail:'admin@example.com'}));
 expect(r.status,r.text).toBe(200);const accountId=superjson.parse<{id:string}>(r.text).id;
 await page.getByRole('button',{name:'Planificar una tarea',exact:true}).click();const editor=page.getByRole('dialog');
 await editor.getByLabel('Buscar negocio',{exact:true}).fill(name);await editor.getByRole('combobox',{name:'Negocio',exact:true}).selectOption(accountId);await editor.getByLabel('Título',{exact:true}).fill(title);await editor.getByLabel('Fecha de vencimiento').fill(localDay());
 await editor.getByText('Participantes y notas (opcional)',{exact:true}).click();await editor.getByLabel('Descripción / notas').fill('Borrador que no se tiene que perder');
 // The session ends while the seller is typing: the save answers 401 (once; later saves reach the server).
 let saves=0;await page.route(url=>url.pathname==='/_api/work',async route=>{if(route.request().method()!=='POST')return route.fallback();saves++;if(saves===1)return route.fulfill({status:401,contentType:'application/json',body:superjson.stringify({error:'Tu sesión venció. Volvé a ingresar.'})});return route.fallback();});
 await editor.getByRole('button',{name:'Agendar tarea',exact:true}).click();
 const relogin=page.getByRole('dialog').filter({hasText:'Tu sesión venció. Ingresá de nuevo para seguir; lo que escribiste se conserva.'});
 await expect(relogin).toHaveCount(1);await expect(page).toHaveURL(/\/my-day$/);expect(saves).toBe(1);
 await expect(relogin.getByLabel('Email',{exact:true})).toHaveValue('admin@example.com');
 await page.keyboard.press('Escape');await expect(relogin).toHaveCount(1);
 await relogin.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await relogin.getByRole('button',{name:'Ingresar',exact:true}).click();
 await expect(relogin).toHaveCount(0);await expect(page).toHaveURL(/\/my-day$/);
 // Same page, same editor, nothing lost; the seller saves again on purpose (no automatic repeat).
 expect(saves).toBe(1);await expect(editor).toHaveCount(1);
 await expect(editor.getByLabel('Título',{exact:true})).toHaveValue(title);await expect(editor.getByLabel('Descripción / notas')).toHaveValue('Borrador que no se tiene que perder');
 await editor.getByRole('button',{name:'Agendar tarea',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText(title,{exact:true})).toBeVisible();
});

test('re-login with another account discards the draft with a full reload',async({page})=>{
 test.setTimeout(120000);
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/\/my-day$/);
 await page.getByRole('button',{name:'Planificar una tarea',exact:true}).click();const editor=page.getByRole('dialog');
 const draft='Borrador de la cuenta anterior '+Date.now();await editor.getByLabel('Título',{exact:true}).fill(draft);
 await page.evaluate(()=>{(window as unknown as {previousPage:boolean}).previousPage=true;});
 // Same signal apiClient emits on any 401.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crm:session-expired')));
 const relogin=page.getByRole('dialog').filter({hasText:'Si ingresás con otra cuenta, lo que escribiste se descarta.'});await expect(relogin).toHaveCount(1);
 // The server answers for a different account (mocked): this browser now belongs to someone else.
 await page.route(url=>url.pathname==='/_api/auth/login_with_password',route=>route.fulfill({status:200,contentType:'application/json',body:superjson.stringify({user:{id:987654,email:'otra@example.com',displayName:'Otra',fullName:null,avatarUrl:null,role:'user'}})}));
 await relogin.getByLabel('Email',{exact:true}).fill('otra@example.com');await relogin.getByLabel('Contraseña',{exact:true}).fill('otra-password');
 const prompts:string[]=[];page.on('dialog',dialog=>{prompts.push(dialog.type());void dialog.accept();});
 const reloaded=page.waitForEvent('load');await relogin.getByRole('button',{name:'Ingresar',exact:true}).click();await reloaded;
 // Full reload (the dirty editor's beforeunload prompt must not block it): no JS state and no draft from the previous account.
 expect(prompts).toEqual([]);expect(await page.evaluate(()=>(window as unknown as {previousPage?:boolean}).previousPage??false)).toBe(false);
 await expect(page.getByText(draft)).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a first visit without a session goes to the login page, with Spanish copy',async({page})=>{
 await page.goto('/my-day');await expect(page).toHaveURL(/\/login$/);await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByLabel('Email',{exact:true})).toHaveAttribute('placeholder','tu@email.com');
 await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page.getByText('Ingresá tu contraseña.',{exact:true})).toBeVisible();
});
