import {test,expect} from '@playwright/test';
import superjson from 'superjson';

test('seller can read a colleague business without editing or administrative controls',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const data=path.endsWith('/auth/session')?{user:{id:3,email:'viewer@example.com',displayName:'Viewer',fullName:null,avatarUrl:null,role:'user'}}:
   path.endsWith('/commercial')?{account:{id:'101',nombre:'Negocio compartido',assignedUserEmail:'owner@example.com',archivedAt:null,mergedIntoId:null,commercialStatus:'prospect',email:'business@example.com'},contacts:[],opportunities:[],journal:[],leadJournal:[],stages:[],users:[{email:'owner@example.com',displayName:'Responsable'}]}:
   path.endsWith('/work')?{tasks:[],activities:[],attention:[],accounts:[],opportunities:[],types:[],users:[],followup:{stages:[],newAssignmentDays:7}}:
   path.endsWith('/pipeline')?{stages:[],insights:[],events:[],objections:[],lossReasons:[],objectionTypes:[],rules:[],users:[],verticals:[]}:
   path.endsWith('/resources')?{documents:[],categories:[],maxDocumentBytes:2097152}:{};
  await route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts/101');
 await expect(page.getByRole('heading',{name:'Negocio compartido',exact:true})).toBeVisible();
 await expect(page.getByText('Podés consultar este negocio. Solo su responsable o un administrador puede modificarlo.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Editar negocio',exact:true})).toHaveCount(0);
 await page.getByRole('tab',{name:'Contactos (0)',exact:true}).click();
 await expect(page.getByRole('button',{name:'Agregar contacto',exact:true})).toHaveCount(0);
 await page.getByRole('tab',{name:'Documentos',exact:true}).click();
 await expect(page.getByRole('button',{name:'Vincular documento al negocio',exact:true})).toHaveCount(0);
 await expect(page.getByText('Agregar documento o recurso',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Más opciones',exact:true}).click();
 for(const name of ['Configuración','Papelera','Negocios archivados','Materiales para ofrecer'])await expect(page.getByRole('menuitem',{name,exact:true})).toHaveCount(0);
 await page.keyboard.press('Escape');
 for(const path of ['/archived','/library','/settings','/history','/trash','/analytics']){
  await page.goto(path);
  await expect(page.getByRole('heading',{name:'Acceso denegado',exact:true})).toBeVisible();
 }
});
