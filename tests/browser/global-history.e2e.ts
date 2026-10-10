import {test,expect} from '@playwright/test';
import superjson from 'superjson';
for(const width of [1280,390])test(`global history includes business journals at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});const requests:string[]=[];const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('hospeda-live-mode','off');localStorage.setItem('hospeda-theme-mode','light');});
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url());let data:any={};
  if(url.pathname.endsWith('/auth/session'))data={user:{id:1,email:'admin@example.com',displayName:'Leo',role:'admin'}};
  else if(url.pathname.endsWith('/lead_journal')){requests.push(url.search);data={rows:[{id:'business:20',accountId:'1',accountName:'Café del puerto',leadId:null,leadName:'Café del puerto',leadCity:'Colón',leadType:'Gastronomía',actorName:'Morena',actorEmail:'morena@example.com',action:'account_updated',fieldName:null,oldValue:null,newValue:null,metadata:{before:{nombre:'Café antiguo'},after:{nombre:'Café del puerto'}},createdAt:'2026-10-10T14:00:00Z',source:'business'},{id:'lead:20',accountId:'1',accountName:'Café del puerto',leadId:null,leadName:'Café del puerto',leadCity:'Colón',leadType:'Gastronomía',actorName:'Morena',actorEmail:'morena@example.com',action:'soft_deleted',fieldName:null,metadata:null,createdAt:'2026-10-03T14:00:00Z',source:'lead'}],total:2,page:1,pageSize:50,filters:{accounts:[{id:'1',name:'Café del puerto'}],leads:[],actions:['account_updated','soft_deleted'],actors:['Morena'],cities:['Colón'],types:['Gastronomía']}};}
  await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/history');await expect(page.getByRole('heading',{name:'Historial global',exact:true})).toBeVisible();
 await expect(page.getByRole('table').getByText('Negocio editado',{exact:true})).toBeVisible();await expect(page.getByText('Negocio / contacto',{exact:true})).toBeVisible();
 await page.getByText('Ver cambios',{exact:true}).click();await expect(page.getByText('Nombre: Café antiguo → Café del puerto',{exact:true})).toBeVisible();
 const links=page.getByRole('link',{name:/Café del puerto.*Negocio #1/});await expect(links).toHaveCount(2);await expect(links.first()).toHaveAttribute('href','/accounts/1');
 await page.getByPlaceholder('Filtrar por negocio…').click();await page.getByRole('option',{name:'Café del puerto (#1)',exact:true}).click();
 await expect.poll(()=>requests.some(q=>q.includes('accountId=1'))).toBe(true);
 await page.screenshot({path:`test-results/global-history-${width}.png`,fullPage:true,animations:'disabled'});expect(errors).toEqual([]);
});
