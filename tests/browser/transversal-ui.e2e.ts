import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {basePreferences} from '../../src/helpers/businessListPreferences';
for(const width of [1280,390,320])test(`remaining screens fit both themes at ${width}px`,async({page})=>{
 test.setTimeout(180000);await page.setViewportSize({width,height:844});await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 for(const dark of [false,true]){
  await page.evaluate(dark=>localStorage.setItem('hospeda-theme-mode',dark?'dark':'light'),dark);
  for(const route of ['my-day','agenda','templates','library','settings','trash','guide']){
   await page.goto('/'+route);await expect(page.locator('main')).toBeVisible();await expect(page.locator('main h1')).toBeVisible();
   if(width<600)expect(await page.getByRole('banner').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(130);
   await expect.poll(()=>page.evaluate(()=>document.body.classList.contains('dark'))).toBe(dark);
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   await page.screenshot({path:`test-results/transversal-${route}-${width}-${dark?'dark':'light'}.png`,fullPage:true,animations:'disabled'});
  }
 }
 expect(errors).toEqual([]);
});

// WCAG contrast of badge text and field placeholders, measured from computed styles (no database needed).
// U-37: the rubros (verticals) are painted with fixed colours, so they are measured too at desktop and phone width.
const rubros=['Alojamientos','Gastronomía','Experiencias','Turismo rural','Partner','Rubro nuevo'];
for(const width of [1280,390])for(const dark of [false,true])test(`badges and placeholders reach 4.5:1 in ${dark?'dark':'light'} theme at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const statuses=['new','reviewed','in_management','no_follow_up_scheduled','recontact','archived'];
 await page.addInitScript(({preferences,dark})=>{localStorage.setItem('hospeda-live-mode','off');localStorage.setItem('hospeda-theme-mode',dark?'dark':'light');localStorage.setItem('hospeda-business-list-v1-user-3',JSON.stringify({preferences,context:{page:1,scrollY:0,scrollX:0}}));},{dark,preferences:{...basePreferences(width<600),columns:['nombre','ciudad','tipo','businessStatus']}});
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'owner@example.com',displayName:'Owner',role:'user'}};
  else if(url.pathname.endsWith('/business_list_defaults'))data={defaults:null};
  else if(url.pathname.endsWith('/saved_views'))data={views:[]};
  else if(url.pathname.endsWith('/settings'))data={users:[{id:3,email:'owner@example.com',displayName:'Owner',role:'user'}],cities:[{id:'1',name:'Colón'}],types:['Alojamientos'],subtypes:[],contactChannels:[],templates:[],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/pipeline'))data={historicalReview:[],configJournal:[],stages:[],managementReasons:[],lossReasons:[],objectionTypes:[],rules:[],insights:[],events:[],objections:[],reactivations:[],total:0,page:1,users:[],verticals:[]};
  else if(url.pathname.endsWith('/leads_stats'))data={total:6,pendientes:0,suscriptos:0,vencidos:0,paraHoy:0,misPendientesHoy:0};
  else if(url.pathname.endsWith('/leads'))data={rows:statuses.map((businessStatus,index)=>({id:String(index+1),accountId:String(index+1),nombre:'Negocio '+(index+1),ciudad:index%2?'Colón':'Gualeguaychú',tipo:['Alojamientos','Gastronomía','Experiencias','Turismo rural','Partner','Rubro nuevo'][index],businessStatus,assignedUserEmail:'owner@example.com',canModify:true,opportunityCount:0,contactCount:0,managementType:'main',estado:['main:contact','main:lost','main:won'][index%3]})),total:statuses.length,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
 });


 await page.goto('/accounts');await expect(page.locator('.mantine-Badge-root').first()).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.body.classList.contains('dark'))).toBe(dark);
 const measure=()=>page.evaluate(()=>{
  const canvas=document.createElement('canvas').getContext('2d',{willReadFrequently:true})!;
  const rgba=(css:string)=>{canvas.clearRect(0,0,1,1);canvas.fillStyle='#ff00ff';canvas.fillStyle=css;canvas.fillRect(0,0,1,1);const [r,g,b,a]=canvas.getImageData(0,0,1,1).data;if(a!==255||(r===255&&g===0&&b===255))return null;return [r,g,b];};
  const rgb=(css:string)=>{const parsed=rgba(css);if(!parsed)throw new Error('Unparseable or translucent colour: '+css);return parsed;};
  const opaqueBackground=(el:Element)=>{for(let node:Element|null=el;node;node=node.parentElement){const color=getComputedStyle(node).backgroundColor;if(rgba(color))return color;}return 'rgb(255, 255, 255)';};
  const lum=([r,g,b]:number[])=>{const f=(v:number)=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
  const ratio=(a:number[],b:number[])=>{const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+0.05)/(y+0.05);};
  const badges=[...document.querySelectorAll('.mantine-Badge-root')].map(el=>{const s=getComputedStyle(el);return {text:el.textContent,ratio:ratio(rgb(s.color),rgb(opaqueBackground(el))),size:s.fontSize};});
  const input=document.querySelector('input[placeholder]') as HTMLInputElement;const placeholder=getComputedStyle(input,'::placeholder');
  const pageBackground=opaqueBackground(input);
  const rubroHues=[...document.querySelectorAll<HTMLElement>('.mantine-Badge-root')].filter(el=>['Alojamientos','Gastronomía','Experiencias','Turismo rural','Partner'].includes(el.textContent??'')).sort((a,b)=>(a.textContent??'').localeCompare(b.textContent??'','es')).map(el=>el.style.getPropertyValue('--badge-h'));
  return {rubroHues,badges,placeholder:{ratio:ratio(rgb(placeholder.color),rgb(pageBackground)),color:placeholder.color,opacity:placeholder.opacity},tableFont:document.querySelector('table td')?getComputedStyle(document.querySelector('table td')!).fontSize:null};
 });
 const result=await measure();
 if(width>=600){await page.goto('/opportunities');await page.getByRole('button',{name:'Tabla',exact:true}).click();await expect(page.locator('td .mantine-Badge-root',{hasText:'Cerrada perdida'}).first()).toBeVisible();
 const stages=await measure();result.badges.push(...stages.badges);}
 console.log(JSON.stringify(result));
 expect(result.badges.length).toBeGreaterThan(5);
 if(width>=600)for(const label of ['Por contactar','Cerrada perdida','Cerrada ganada'])expect(result.badges.map(badge=>badge.text),'stage badges are measured').toContain(label);
 for(const label of rubros)expect(result.badges.map(badge=>badge.text),'rubro badges are measured').toContain(label);
 const hues=result.rubroHues;expect(new Set(hues.slice(0,5)).size,'known rubros have distinct fixed colours').toBe(5);
 for(const badge of result.badges)expect(badge.ratio,`badge "${badge.text}"`).toBeGreaterThanOrEqual(4.5);
 expect(result.placeholder.ratio).toBeGreaterThanOrEqual(4.5);
 if(width>=600)expect(result.tableFont).toBe('14px');
});

// U-30: phones get full-screen editors, 44px targets in Negocios, and inline errors that stay out of the field name.
test('phones: Negocios controls are 44px and editors are bottom sheets with the error outside the field name',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
 await page.goto('/accounts');await expect(page.locator('article[data-business-id]').first()).toBeVisible();
 const small=()=>page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('main a[href],main button,header a[href],header button')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[data-sonner-toast]')&&(r.height<43.5||r.width<43.5)}).map(el=>`${el.tagName} ${el.getAttribute('aria-label')||el.textContent?.trim().slice(0,30)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`));
 expect(await small(),'every visible button and link in Negocios is a 44px target').toEqual([]);
 const checkbox=page.locator('article[data-business-id]').first().getByRole('checkbox');const box=(await checkbox.locator('xpath=ancestor::label[1]').boundingBox())!;
 expect(box.width,'the checkbox hit area').toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
 await page.getByRole('button',{name:/Nuevo negocio/}).first().click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 const frame=(await dialog.boundingBox())!;expect(frame).toMatchObject({x:0,width:390});expect(frame.y+frame.height).toBeCloseTo(844,0);expect(frame.height).toBeLessThanOrEqual(844);
 const name=dialog.getByRole('textbox',{name:'Nombre',exact:true});await expect(name).toBeVisible();
 await dialog.locator('form').evaluate(form=>(form as HTMLFormElement).requestSubmit());
 const message=dialog.getByText('Completá este dato.');await expect(message).toBeVisible();
 await expect(name).toHaveAttribute('aria-describedby',await message.getAttribute('id')??'');
 await expect(dialog.getByRole('textbox',{name:'Nombre',exact:true}),'the error text is not part of the accessible name').toHaveCount(1);
 expect(await name.evaluate(el=>el.getAttribute('aria-label'))).toBe('Nombre');
});
