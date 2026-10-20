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
for(const dark of [false,true])test(`badges and placeholders reach 4.5:1 in ${dark?'dark':'light'} theme`,async({page})=>{
 await page.setViewportSize({width:1280,height:900});
 const statuses=['new','reviewed','in_management','no_follow_up_scheduled','recontact','archived'];
 await page.addInitScript(({preferences,dark})=>{localStorage.setItem('hospeda-live-mode','off');localStorage.setItem('hospeda-theme-mode',dark?'dark':'light');localStorage.setItem('hospeda-business-list-v1-user-3',JSON.stringify({preferences,context:{page:1,scrollY:0,scrollX:0}}));},{dark,preferences:{...basePreferences(),columns:['nombre','ciudad','tipo','businessStatus']}});
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'owner@example.com',displayName:'Owner',role:'user'}};
  else if(url.pathname.endsWith('/business_list_defaults'))data={defaults:null};
  else if(url.pathname.endsWith('/saved_views'))data={views:[]};
  else if(url.pathname.endsWith('/settings'))data={users:[{id:3,email:'owner@example.com',displayName:'Owner',role:'user'}],cities:[{id:'1',name:'Colón'}],types:['Alojamientos'],subtypes:[],contactChannels:[],templates:[],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/leads'))data={rows:statuses.map((businessStatus,index)=>({id:String(index+1),accountId:String(index+1),nombre:'Negocio '+(index+1),ciudad:index%2?'Colón':'Gualeguaychú',tipo:'Alojamientos',businessStatus,assignedUserEmail:'owner@example.com',canModify:true,opportunityCount:0,contactCount:0})),total:statuses.length,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts');await expect(page.locator('.mantine-Badge-root').first()).toBeVisible();
 const result=await page.evaluate(()=>{
  const canvas=document.createElement('canvas').getContext('2d',{willReadFrequently:true})!;
  const rgb=(css:string)=>{canvas.clearRect(0,0,1,1);canvas.fillStyle='#000';canvas.fillStyle=css;canvas.fillRect(0,0,1,1);const [r,g,b]=canvas.getImageData(0,0,1,1).data;return [r,g,b];};
  const lum=([r,g,b]:number[])=>{const f=(v:number)=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
  const ratio=(a:number[],b:number[])=>{const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+0.05)/(y+0.05);};
  const badges=[...document.querySelectorAll('.mantine-Badge-root')].map(el=>{const s=getComputedStyle(el);return {text:el.textContent,ratio:ratio(rgb(s.color),rgb(s.backgroundColor)),size:s.fontSize};});
  const input=document.querySelector('input[placeholder]') as HTMLInputElement;const placeholder=getComputedStyle(input,'::placeholder');
  const pageBackground=getComputedStyle(input).backgroundColor;
  return {badges,placeholder:{ratio:ratio(rgb(placeholder.color),rgb(pageBackground)),color:placeholder.color,opacity:placeholder.opacity},tableFont:getComputedStyle(document.querySelector('table td')!).fontSize};
 });
 console.log(JSON.stringify(result));
 expect(result.badges.length).toBeGreaterThan(5);
 for(const badge of result.badges)expect(badge.ratio,`badge "${badge.text}"`).toBeGreaterThanOrEqual(4.5);
 expect(result.placeholder.ratio).toBeGreaterThanOrEqual(4.5);
 expect(result.tableFont).toBe('14px');
});
