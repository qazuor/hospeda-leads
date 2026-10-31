import {test,expect,type Page} from '@playwright/test';
import {createServer,type Server} from 'node:http';
import {randomUUID} from 'node:crypto';
import superjson from 'superjson';
import {brokenPdf,cmykImagePdf,tinyPng,twoPagePdf} from './fixtures/pdf';

// Spec 95: «Material de venta» screen. The server under test must run with R2_* variables and R2_ENDPOINT=http://127.0.0.1:<CRM_E2E_R2_PORT>
// (see the «Start server» step in ci.yml). This R2 stub stores PUTs and answers CORS as the bucket policy in docs/COOLIFY_DEPLOY.md does: only for
// the CRM origin (the Playwright baseURL), only the allowed request headers, and the same exposed headers, so the browser can upload files and read
// them back (also with Range requests, as pdf.js does) to draw automatic covers. A request the real policy would refuse gets no CORS headers here either.
const R2_PORT=Number(process.env.CRM_E2E_R2_PORT??3019);
const objects=new Map<string,{body:Buffer;type:string}>();
let r2:Server;
const ALLOWED_HEADERS=['content-type','range'];
const policy={'Access-Control-Allow-Methods':'PUT, GET, HEAD','Access-Control-Allow-Headers':'Content-Type, Range','Access-Control-Expose-Headers':'ETag, Accept-Ranges, Content-Range, Content-Length','Access-Control-Max-Age':'3600'};
test.beforeAll(async({},testInfo)=>{
 const crmOrigin=new URL(String(testInfo.project.use.baseURL)).origin;
 r2=createServer((req,res)=>{
  const url=new URL(req.url!,'http://r2.test');const key=url.pathname.split('/').slice(2).map(decodeURIComponent).join('/');
  const origin=req.headers.origin;const cors:Record<string,string>=origin===crmOrigin?{...policy,'Access-Control-Allow-Origin':crmOrigin,Vary:'Origin'}:{Vary:'Origin'};
  if(req.method==='OPTIONS'){
   const asked=String(req.headers['access-control-request-headers']??'').split(',').map(h=>h.trim().toLowerCase()).filter(Boolean);
   const method=String(req.headers['access-control-request-method']??'');
   res.writeHead(origin===crmOrigin&&['PUT','GET','HEAD'].includes(method)&&asked.every(h=>ALLOWED_HEADERS.includes(h))?204:403,origin===crmOrigin?cors:{}).end();return;
  }
  if(!url.searchParams.has('X-Amz-Signature')&&!String(req.headers.authorization??'').startsWith('AWS4-HMAC-SHA256')){res.writeHead(403,cors).end();return;}
  if(req.method==='PUT'){const chunks:Buffer[]=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{objects.set(key,{body:Buffer.concat(chunks),type:String(req.headers['content-type']??'')});res.writeHead(200,{...cors,ETag:'"e2e"'}).end();});return;}
  if(req.method==='DELETE'){objects.delete(key);res.writeHead(204,cors).end();return;}
  const o=objects.get(key);if(!o){res.writeHead(404,cors).end();return;}
  const range=/^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range??''));
  const from=range?Number(range[1]):0,to=range&&range[2]?Math.min(Number(range[2]),o.body.length-1):o.body.length-1;const body=o.body.subarray(from,to+1);
  res.writeHead(range?206:200,{...cors,'Content-Type':url.searchParams.get('response-content-type')??o.type,'Content-Length':body.length,'Accept-Ranges':'bytes',ETag:'"e2e"',...(range?{'Content-Range':`bytes ${from}-${to}/${o.body.length}`}:{})}).end(req.method==='HEAD'?undefined:body);
 });
 await new Promise<void>(resolve=>r2.listen(R2_PORT,'127.0.0.1',resolve));
});
test.afterAll(async()=>{await new Promise<void>(resolve=>r2?r2.close(()=>resolve()):resolve());});

async function login(page:Page){
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
}
async function api(page:Page,endpoint:string,body?:unknown){
 const result=await page.evaluate(async({endpoint,body})=>{const r=await fetch('/_api/'+endpoint,body?{method:'POST',headers:{'Content-Type':'application/json'},body}:{});return {status:r.status,text:await r.text()}},{endpoint,body:body?superjson.stringify(body):undefined});
 expect(result.status,result.text).toBe(200);return superjson.parse<any>(result.text);
}

for(const width of [1280,390])test(`sales material screen: groups, card menu, filters and automatic covers at ${width}px`,async({page})=>{
 test.setTimeout(180000);await page.setViewportSize({width,height:900});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 // No page.route() here (other suites use one to block web fonts): any route turns on request interception, and Chromium then drops the Origin
 // header of the redirected GET to R2, which the CORS policy of the stub (like the real bucket) needs.
 await login(page);
 const stamp=width+'x'+randomUUID().slice(0,6);
 const folletos=(await api(page,'sales_materials',{action:'category_create',name:'Folletos '+stamp})).id,videos=(await api(page,'sales_materials',{action:'category_create',name:'Videos '+stamp})).id;
 // A stored PDF without cover (for «Generar portadas faltantes»), a link in both categories and a link without category.
 const storedId=randomUUID();const pdf=twoPagePdf();
 const upload=await api(page,'sales_materials/upload_url',{purpose:'file',fileName:'guardado.pdf',mimeType:'application/pdf',byteSize:pdf.length,materialId:storedId});
 expect((await fetch(upload.putUrl,{method:'PUT',headers:{'Content-Type':'application/pdf'},body:new Uint8Array(pdf)})).status).toBe(200);
 await api(page,'sales_materials',{action:'create',id:storedId,title:'Tarifario guardado '+stamp,description:'',kind:'deliverable',source:'file',categoryIds:[folletos],version:{uploadId:upload.uploadId}});
 await api(page,'sales_materials',{action:'create',id:randomUUID(),title:'Video promo '+stamp,description:'',kind:'deliverable',source:'url',categoryIds:[folletos,videos],version:{url:'https://example.com/promo'}});
 await api(page,'sales_materials',{action:'create',id:randomUUID(),title:'Guía suelta '+stamp,description:'',kind:'internal',source:'url',categoryIds:[],version:{url:'https://example.com/guia'}});

 await page.goto('/sales-material');const main=page.locator('main');
 await main.getByLabel('Buscar material',{exact:true}).fill(stamp);
 const headings=main.getByRole('heading',{level:2});
 await expect(headings).toHaveText([`Folletos ${stamp}2`,`Videos ${stamp}1`,'Sin categoría1']);
 await expect(main.getByRole('article',{name:'Video promo '+stamp})).toHaveCount(2);
 // Collapsible sections.
 const videosToggle=main.getByRole('button',{name:new RegExp(`^Videos ${stamp}`)});await videosToggle.click();await expect(videosToggle).toHaveAttribute('aria-expanded','false');await expect(main.getByRole('article',{name:'Video promo '+stamp})).toHaveCount(1);await videosToggle.click();

 // «Generar portadas faltantes»: the browser reads the stored PDF (302 to R2 over CORS), renders its first page and uploads the cover.
 const stored=main.getByRole('article',{name:'Tarifario guardado '+stamp});
 await expect(stored.getByTestId('cover-placeholder')).toBeVisible();
 await main.getByRole('button',{name:'Generar portadas faltantes (1)',exact:true}).click();
 await expect(page.getByText('Se generó 1 portada.',{exact:true})).toBeVisible({timeout:30000}); // A Sonner toast, like other saves.
 await expect.poll(()=>stored.locator('img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0),{timeout:15000}).toBe(true);
 await expect(main.getByRole('button',{name:/Generar portadas faltantes/})).toHaveCount(0);

 // A new PDF without manual cover gets its automatic cover at creation.
 await main.getByRole('button',{name:'Nuevo material',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Archivo',{exact:true}).setInputFiles({name:'nuevo.pdf',mimeType:'application/pdf',buffer:pdf});
 await dialog.getByLabel('Título',{exact:true}).fill('Tarifario nuevo '+stamp);
 await dialog.getByRole('button',{name:'Guardar material',exact:true}).click();
 await expect(page.getByText('Material guardado.',{exact:true})).toBeVisible({timeout:30000});
 const created=main.getByRole('article',{name:'Tarifario nuevo '+stamp});
 await expect.poll(()=>created.locator('img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0),{timeout:15000}).toBe(true);
 const list=await api(page,'sales_materials?search='+encodeURIComponent(stamp));
 expect(list.materials.filter((m:any)=>m.source==='file').map((m:any)=>m.coverSource)).toEqual(['auto','auto']);
 const coverKeys=[...objects.entries()].filter(([key,o])=>key.startsWith('covers/')&&o.type==='image/jpeg');expect(coverKeys.length).toBeGreaterThanOrEqual(2);

 // Card: the title opens the preview, «Abrir» is visible, the rest lives in «⋯».
 await created.getByRole('button',{name:`Vista previa de «Tarifario nuevo ${stamp}»`,exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Tarifario nuevo '+stamp})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(created.getByRole('link',{name:'Abrir',exact:true})).toBeVisible();
 await created.getByRole('button',{name:`Más acciones de «Tarifario nuevo ${stamp}»`,exact:true}).click();
 await expect(page.getByRole('menuitem')).toHaveText(['Descargar','Editar','Nueva versión','Portada','Archivar']);
 await page.screenshot({path:`test-results/material-screen-menu-${width}.png`,fullPage:true});
 await page.keyboard.press('Escape');await expect(page.getByRole('menuitem')).toHaveCount(0);

 // Filters: format narrows the list, «Limpiar filtros» appears only while filtering and resets everything.
 await main.getByRole('combobox',{name:'Formato',exact:true}).selectOption('link');
 await expect(headings).toHaveText([`Folletos ${stamp}1`,`Videos ${stamp}1`,'Sin categoría1']);
 await main.getByRole('button',{name:'Limpiar filtros',exact:true}).click();
 await expect(main.getByLabel('Buscar material',{exact:true})).toHaveValue('');await expect(main.getByRole('button',{name:'Limpiar filtros',exact:true})).toHaveCount(0);
 await main.getByLabel('Buscar material',{exact:true}).fill(stamp);await main.getByText('Internos',{exact:true}).click();
 await expect(headings).toHaveText(['Sin categoría1']);
 await page.screenshot({path:`test-results/material-screen-${width}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 expect(errors).toEqual([]);
});

// Spec 102 blocks 1 and 2: a print-style PDF gets its cover with pdf.js fully configured; an unreadable PDF is saved with the reason and
// «Elegir portada», whose «Generar desde el archivo» retries from the stored file; an external link takes a manual cover.
test('sales material covers: reasons, «Elegir portada», «Generar desde el archivo» and link covers',async({page})=>{
 test.setTimeout(180000);await page.setViewportSize({width:1280,height:900});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const assets:{url:string;status:number}[]=[];page.on('response',r=>{if(r.url().includes('/assets/pdfjs-'))assets.push({url:r.url(),status:r.status()});});
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await login(page);const stamp='c'+randomUUID().slice(0,6);
 await page.goto('/sales-material');const main=page.locator('main');const dialog=page.getByRole('dialog');
 const imageReady=(article:ReturnType<typeof main.getByRole>)=>expect.poll(()=>article.locator('img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0),{timeout:15000}).toBe(true);
 const create=async({title,file,name}:{title:string;file:Buffer;name:string})=>{
  await main.getByRole('button',{name:'Nuevo material',exact:true}).click();
  await dialog.getByLabel('Archivo',{exact:true}).setInputFiles({name,mimeType:'application/pdf',buffer:file});await dialog.getByLabel('Título',{exact:true}).fill(title);
  await dialog.getByRole('button',{name:'Guardar material',exact:true}).click();
 };
 await main.getByLabel('Buscar material',{exact:true}).fill(stamp);

 // A CMYK image with non-embedded standard fonts gets its automatic cover; every pdf.js resource it asked for was served. The Symbol font is
 // always read from pdf.js' own files, so at least one asset request must have happened (otherwise "none failed" would prove nothing).
 await create({title:'Folleto CMYK '+stamp,file:cmykImagePdf(),name:'cmyk.pdf'});
 await expect(page.getByText('Material guardado.',{exact:true})).toBeVisible({timeout:30000});
 await imageReady(main.getByRole('article',{name:'Folleto CMYK '+stamp}));
 expect(assets.filter(a=>a.status>=400)).toEqual([]);
 expect(assets.some(a=>a.url.includes('/standard_fonts/FoxitSymbol.pfb')&&a.status===200),JSON.stringify(assets)).toBe(true);

 // An unreadable PDF is saved; the notice says why and offers «Elegir portada», which opens «Portada» with «Generar desde el archivo».
 await create({title:'Folleto roto '+stamp,file:brokenPdf(),name:'roto.pdf'});
 const notice=page.locator('[data-sonner-toast]').filter({hasText:'No se pudo leer el PDF.'});
 await expect(notice).toBeVisible({timeout:30000});await expect(notice).toContainText('Material guardado.');
 await notice.getByRole('button',{name:'Elegir portada',exact:true}).click();
 await expect(dialog).toBeVisible();await expect(dialog).toContainText('«Folleto roto '+stamp+'»');
 await dialog.getByRole('button',{name:'Generar desde el archivo',exact:true}).click();
 await expect(dialog.getByRole('alert')).toHaveText('No se pudo leer el PDF. Podés reintentar o subir una imagen.',{timeout:30000});
 await expect(dialog.getByRole('button',{name:'Generar desde el archivo',exact:true})).toBeEnabled();
 // The image field is right there: a manual cover fixes it.
 await dialog.getByLabel('Imagen de portada',{exact:true}).setInputFiles({name:'tapa.png',mimeType:'image/png',buffer:tinyPng()});
 await dialog.getByRole('button',{name:'Guardar portada',exact:true}).click();
 await expect(page.getByText('Portada actualizada.',{exact:true})).toBeVisible({timeout:30000});
 await imageReady(main.getByRole('article',{name:'Folleto roto '+stamp}));

 // An external link takes a manual cover when created, and «Portada» is in its menu.
 await main.getByRole('button',{name:'Nuevo material',exact:true}).click();
 await dialog.getByLabel('Origen',{exact:true}).selectOption('url');await dialog.getByLabel('Enlace (https)',{exact:true}).fill('https://example.com/tour-'+stamp);
 await dialog.getByLabel('Título',{exact:true}).fill('Recorrido '+stamp);
 await dialog.getByLabel('Portada (opcional)',{exact:true}).setInputFiles({name:'tapa.png',mimeType:'image/png',buffer:tinyPng()});
 await dialog.getByRole('button',{name:'Guardar material',exact:true}).click();
 await expect(page.getByText('Material guardado.',{exact:true}).first()).toBeVisible({timeout:30000});
 const link=main.getByRole('article',{name:'Recorrido '+stamp});await imageReady(link);
 await link.getByRole('button',{name:`Más acciones de «Recorrido ${stamp}»`,exact:true}).click();
 await expect(page.getByRole('menuitem')).toHaveText(['Editar','Nueva versión','Portada','Archivar']);await page.keyboard.press('Escape');
 const list=await api(page,'sales_materials?search='+encodeURIComponent(stamp));
 expect(Object.fromEntries(list.materials.map((m:any)=>[m.title.replace(' '+stamp,''),m.coverSource]))).toEqual({'Folleto CMYK':'auto','Folleto roto':'manual','Recorrido':'manual'});
 expect(errors).toEqual([]);
});
