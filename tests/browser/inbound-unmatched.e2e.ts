import {test,expect,type Page,type Route} from '@playwright/test';
import superjson from 'superjson';

// «Mensajes sin asociar» (spec 103 D1–D5). The test seed has no unmatched messages and the app cannot create one without the inbound webhook
// token, so the inbox endpoints are served through route mocks; the assertions check what the screen sends, the server side is covered by
// scripts/test-inbound-unmatched.ts. Nothing here writes to the database.
async function login(page:Page){
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
}
const send=(route:Route,data:unknown)=>route.fulfill({status:200,contentType:'application/json',body:superjson.stringify(data)});
const at=new Date('2026-10-30T17:05:00.000Z');
const igCard={key:'instagram:9001',channel:'instagram',address:'@huesped.e2e',name:'Huésped',igsid:'9001',instagramUsername:'huesped.e2e',verified:false,messages:[{id:'00000000-0000-4000-8000-000000000001',isOutgoing:false,subject:'',excerpt:'Hola, ¿tienen lugar?',receivedAt:at},{id:'00000000-0000-4000-8000-000000000002',isOutgoing:true,subject:'',excerpt:'Sí, te paso info',receivedAt:at}],lastAt:at,suggestions:[{accountId:'990001',nombre:'Cabañas E2E',ciudad:'Colón',archived:false,reason:'domain',contactId:null,contactName:null,exact:false,instagramEmpty:true,emailEmpty:true,openLeadId:null}],dismissal:null};
const mailCard={key:'email:promo@spam.e2e',channel:'email',address:'promo@spam.e2e',name:'Promo',igsid:null,instagramUsername:null,verified:false,messages:[{id:'00000000-0000-4000-8000-000000000003',isOutgoing:false,subject:'Oferta',excerpt:'Compre ya',receivedAt:at},{id:'00000000-0000-4000-8000-000000000004',isOutgoing:false,subject:'Oferta 2',excerpt:'Última chance',receivedAt:at}],lastAt:at,suggestions:[],dismissal:null};

test('an admin associates a conversation with one click, stores the Instagram user, dismisses spam with a reason and searches again',async({page})=>{
 test.setTimeout(120000);
 await login(page);
 const posted:{path:string;body:unknown}[]=[];
 await page.route('**/_api/inbound/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()==='GET'&&path==='/_api/inbound/unmatched')return send(route,{groups:[igCard,mailCard],total:2,truncated:false});
  if(request.method()!=='POST')return route.continue();
  const body=superjson.parse<unknown>(request.postData()??'');posted.push({path,body});
  if(path==='/_api/inbound/assign')return send(route,{ok:true,accountName:'Cabañas E2E',accountCode:'H990001',associatedChat:true,movedCount:2,savedAddress:'instagram'});
  if(path==='/_api/inbound/unmatched/dismiss')return send(route,{ok:true,dismissed:1,skipped:0});
  if(path==='/_api/inbound/unmatched/rescan')return send(route,{associated:1,remaining:1,lookups:3,lookupsPending:0});
  return route.continue();
 });
 await page.goto('/inbound');
 await expect(page.getByText('2 conversaciones sin asociar')).toBeVisible();
 const ig=page.getByRole('article').filter({hasText:'@huesped.e2e'}),mail=page.getByRole('article').filter({hasText:'promo@spam.e2e'});
 await expect(ig.getByText('H990001 · Cabañas E2E · Colón')).toBeVisible();
 await expect(ig.getByLabel('Guardar @huesped.e2e en el negocio')).toBeChecked();
 await ig.getByRole('button',{name:'Asociar a H990001'}).click();
 await expect.poll(()=>posted.find(p=>p.path==='/_api/inbound/assign')?.body).toEqual({ids:igCard.messages.map(m=>m.id),accountId:'990001',leadId:null,contactId:null,saveAddress:true});
 await expect(ig.getByRole('button',{name:'Asociar a H990001'})).toBeDisabled();
 // D2 + D3: untick one email, then dismiss only the ticked one with «Otro» and a text.
 await mail.getByRole('checkbox').first().uncheck();
 await mail.getByRole('button',{name:'Descartar'}).click();
 await mail.getByLabel('Motivo').selectOption('other');
 await expect(mail.getByRole('button',{name:'Confirmar descarte'})).toBeDisabled();
 await mail.getByLabel('Contá el motivo').fill('Publicidad de un proveedor');
 await mail.getByRole('button',{name:'Confirmar descarte'}).click();
 await expect.poll(()=>posted.find(p=>p.path==='/_api/inbound/unmatched/dismiss')?.body).toEqual({ids:[mailCard.messages[1].id],reason:'other',detail:'Publicidad de un proveedor'});
 // D5
 await page.getByRole('button',{name:'Volver a buscar negocios'}).click();
 await expect(page.getByText('Se asoció 1; queda 1 sin asociar.',{exact:true}).first()).toBeVisible();
 expect(posted.filter(p=>p.path==='/_api/inbound/unmatched/rescan').length).toBe(1);
});
