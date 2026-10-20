import {test,expect} from '@playwright/test';
import superjson from 'superjson';

test('Nuevo negocio warns about similar businesses, blocks No contactar duplicates and saves the person as Principal without a management',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/\/my-day$/);
 async function api(endpoint:string,body?:unknown){const r=await page.evaluate(async({endpoint,body})=>{const response=await fetch('/_api/'+endpoint,body?{method:'POST',body,headers:{'Content-Type':'application/json'}}:{});return {status:response.status,text:await response.text()};},{endpoint,body:body===undefined?undefined:superjson.stringify(body)});expect(r.status,r.text).toBe(200);return superjson.parse<any>(r.text);}
 const name='Cabañas Alta Rápida '+Date.now();
 const existing=(await api('commercial',{action:'account_save',nombre:name,ciudad:'Colón',assignedUserEmail:'admin@example.com'})).id as string;
 await page.goto('/accounts');await page.getByRole('button',{name:'Nuevo negocio',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Nuevo negocio'});const create=dialog.getByRole('button',{name:'Crear negocio',exact:true});
 await expect(dialog.getByText('No crea una gestión',{exact:false})).toBeVisible();
 // Live warning: same name and city as an existing business.
 await dialog.getByLabel('Nombre',{exact:true}).fill(name);await dialog.getByLabel('Ciudad',{exact:true}).fill('Colón');
 await expect(dialog.getByText('Puede que ya exista:',{exact:true})).toBeVisible();
 await expect(dialog.getByRole('link',{name:'Abrir '+name+' (en otra pestaña)',exact:true})).toHaveAttribute('href','/accounts/'+existing);
 await expect(dialog.getByText('Mismo nombre y ciudad · Responsable del negocio:',{exact:false})).toBeVisible();
 await expect(create).toBeDisabled();
 await dialog.getByLabel('Ninguno de estos es mi negocio, crear igual',{exact:true}).check();await expect(create).toBeEnabled();
 await page.screenshot({path:'test-results/business-quick-create-warning.png',fullPage:true});
 // A No contactar match is a hard block (the server enforces it too; here the check response is simulated).
 await page.route('**/_api/business/duplicate-check?**',route=>route.fulfill({status:200,contentType:'application/json',body:superjson.stringify({candidates:[{id:'999999',nombre:'Hostería que pidió no ser contactada',ciudad:'Colón',doNotContact:true,archived:true,deleted:false,reasons:['Teléfono compartido'],canOpen:false,blocking:true}]})}));
 await dialog.getByLabel('Teléfono / WhatsApp',{exact:true}).fill('3447 401234');
 await expect(dialog.getByRole('alert')).toHaveText('Ese negocio pidió no ser contactado. Consultá con un administrador.');
 await expect(dialog.getByText('No contactar',{exact:true})).toBeVisible();await expect(dialog.getByText('Archivado',{exact:true})).toBeVisible();
 await expect(dialog.getByRole('link',{name:/Abrir Hostería que pidió no ser contactada/})).toHaveCount(0);
 await expect(dialog.getByLabel('Ninguno de estos es mi negocio, crear igual')).toHaveCount(0);await expect(create).toBeDisabled();
 await page.screenshot({path:'test-results/business-quick-create-dnc.png',fullPage:true});
 await page.unroute('**/_api/business/duplicate-check?**');
 // A different name clears the warning; the person is saved as Principal.
 await dialog.getByLabel('Teléfono / WhatsApp',{exact:true}).fill('');await dialog.getByLabel('Nombre',{exact:true}).fill(name+' Norte');
 await expect(dialog.getByText('Puede que ya exista:',{exact:true})).toHaveCount(0);
 await dialog.getByLabel('Nombre de la persona',{exact:true}).fill('Ana del alta');await dialog.getByLabel('Teléfono de la persona',{exact:true}).fill('3447 400222');
 await create.click();
 await expect(page.locator('[data-sonner-toast]').getByText('Negocio creado',{exact:true})).toBeVisible();await expect(page.getByText('Negocio guardado',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Abrir negocio',exact:true})).toHaveCount(0);
 await expect(page).toHaveURL(/\/accounts\/\d+/);await expect(page.getByRole('heading',{name:name+' Norte',exact:true})).toBeVisible();
 const id=page.url().match(/\/accounts\/(\d+)/)![1];
 const detail=await api('commercial?accountId='+id);
 expect(detail.contacts.map((c:any)=>[c.name,c.phone,c.isPrimary])).toEqual([['Ana del alta','3447 400222',true]]);
 expect(detail.opportunities).toHaveLength(0);
});
