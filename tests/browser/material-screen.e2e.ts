import {test,expect,type Page} from '@playwright/test';
import {createServer,type Server} from 'node:http';
import {randomUUID} from 'node:crypto';
import superjson from 'superjson';
import {twoPagePdf} from './fixtures/pdf';

// Spec 95: «Material de venta» screen. The server under test must run with R2_* variables and R2_ENDPOINT=http://127.0.0.1:<CRM_E2E_R2_PORT>
// (see the «Start server» step in ci.yml). This R2 stub stores PUTs and answers CORS like the real bucket policy (PUT, GET, HEAD from the CRM origin),
// so the browser can upload files and read them back to draw automatic covers.
const R2_PORT=Number(process.env.CRM_E2E_R2_PORT??3019);
const objects=new Map<string,{body:Buffer;type:string}>();
let r2:Server;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'PUT, GET, HEAD','Access-Control-Allow-Headers':'Content-Type, Range','Access-Control-Expose-Headers':'ETag'};
test.beforeAll(async()=>{
 r2=createServer((req,res)=>{
  const url=new URL(req.url!,'http://r2.test');const key=url.pathname.split('/').slice(2).map(decodeURIComponent).join('/');
  if(req.method==='OPTIONS'){res.writeHead(204,cors).end();return;}
  if(!url.searchParams.has('X-Amz-Signature')&&!String(req.headers.authorization??'').startsWith('AWS4-HMAC-SHA256')){res.writeHead(403,cors).end();return;}
  if(req.method==='PUT'){const chunks:Buffer[]=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{objects.set(key,{body:Buffer.concat(chunks),type:String(req.headers['content-type']??'')});res.writeHead(200,{...cors,ETag:'"e2e"'}).end();});return;}
  if(req.method==='DELETE'){objects.delete(key);res.writeHead(204,cors).end();return;}
  const o=objects.get(key);if(!o){res.writeHead(404,cors).end();return;}
  res.writeHead(200,{...cors,'Content-Type':url.searchParams.get('response-content-type')??o.type,'Content-Length':o.body.length,ETag:'"e2e"'}).end(req.method==='HEAD'?undefined:o.body);
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
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));await page.route('https://fonts.googleapis.com/**',route=>route.abort());
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
