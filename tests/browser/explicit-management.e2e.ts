import {test,expect} from '@playwright/test';
import superjson from 'superjson';

for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
 test(`business and explicit management preparation at ${viewport.width}px`,async({page})=>{
  await page.setViewportSize(viewport);
  await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
  await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
  const mutate=async(body:unknown)=>{
   const result=await page.evaluate(async body=>{const r=await fetch('/_api/commercial',{method:'POST',body});return {status:r.status,body:await r.text()};},superjson.stringify(body));
   expect(result.status).toBe(200);return superjson.parse<any>(result.body);
  };
  const detail=async(id:string)=>superjson.parse<any>(await page.evaluate(async id=>(await fetch('/_api/commercial?accountId='+id)).text(),id));
  const {id}=await mutate({action:'account_save',nombre:'Preparación explícita '+viewport.width+' '+Date.now(),email:'business@example.com'});
  expect((await detail(id)).opportunities).toHaveLength(0);
  await page.goto('/accounts/'+id);
  await page.getByRole('tab',{name:/^Gestiones comerciales/}).click();
  await expect(page.getByText(/Sin gestiones iniciadas/)).toBeVisible();
  await page.getByRole('button',{name:'Iniciar gestión',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Preparar gestión'});
  await expect(dialog.getByLabel('Nombre de la gestión')).toHaveValue('Presentación de Hospeda');
  await expect(dialog.getByRole('combobox',{name:'Estado / etapa',exact:true})).toHaveValue('');
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect((await detail(id)).opportunities).toHaveLength(0);
  await page.getByRole('button',{name:'Iniciar gestión',exact:true}).click();dialog=page.getByRole('dialog',{name:'Preparar gestión'});
  await dialog.getByLabel('Propuesta (opcional)',{exact:true}).fill('Revisar la presentación antes de contactar');
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);
  await page.route('**/_api/commercial',async route=>{if(route.request().method()==='POST')await gate;await route.continue();});
  try{
   await dialog.getByRole('button',{name:'Guardar',exact:true}).click();
   await expect(dialog.getByRole('button',{name:'Guardando gestión…',exact:true})).toBeDisabled();
   await expect(dialog.getByLabel('Propuesta (opcional)',{exact:true})).toBeDisabled();
   await expect(dialog.getByRole('button',{name:'Cancelar',exact:true})).toBeDisabled();
  }finally{release();}
  await expect(dialog).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:'Gestión iniciada. Ahora planificá cómo empezar.'}).getByRole('link',{name:'Abrir gestión',exact:true})).toBeVisible();
  const saved=await detail(id);expect(saved.opportunities).toHaveLength(1);expect(saved.opportunities[0].estado).toBeNull();expect(saved.opportunities[0].primaryContactId).toBeNull();expect(saved.opportunities[0].fechaUltimoContacto).toBeNull();expect(saved.opportunities[0].estimatedCloseDate).toBeNull();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  await page.screenshot({path:`test-results/explicit-management-${viewport.width}.png`,fullPage:true});
  await page.getByRole('link',{name:'Gestiones comerciales',exact:true}).click();
  await expect(page.locator('[aria-label="Pipeline comercial"]')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Gestiones comerciales',exact:true})).toBeVisible();
 });
}
