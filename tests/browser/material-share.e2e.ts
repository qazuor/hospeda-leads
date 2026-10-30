import {test,expect} from '@playwright/test';
import {createServer,type Server} from 'node:http';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import postgres from 'postgres';

// Spec 89 F2: public page /m/<token>. The server under test must run with R2_* variables and R2_ENDPOINT=http://127.0.0.1:<CRM_E2E_R2_PORT>
// (see the «Start server» step in ci.yml); this spec serves that R2 stub and creates the shares with SQL on the disposable database.
const R2_PORT=Number(process.env.CRM_E2E_R2_PORT??3019);
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
const objects=new Map<string,{body:Buffer;type:string}>();
let r2:Server;let sql:ReturnType<typeof postgres>;
const tokens:{image:string;pdf:string;revoked:string;imageShareId:string}={image:'',pdf:'',revoked:'',imageShareId:''};
async function share(materialId:string,accountId:string,revoked=false){
 const token=randomBytes(32).toString('base64url'),id=randomUUID();
 await sql`INSERT INTO crm_sales_material_shares(id,token_hash,material_id,account_id,original_account_id,channel,prepared_version,created_by_email,revoked_at,revoked_by_email,revoke_reason)
  VALUES(${id},${createHash('sha256').update(token).digest('hex')},${materialId},${accountId},${accountId},'whatsapp',1,'admin@example.com',${revoked?new Date():null},${revoked?'admin@example.com':null},${revoked?'Prueba e2e':null})`;
 return {token,id};
}
async function material(title:string,file:{name:string;mime:string;body:Buffer}){
 const id=randomUUID(),key=`materials/${id}/v1-${randomUUID()}.${file.name.split('.').pop()}`;objects.set(key,{body:file.body,type:file.mime});
 await sql`INSERT INTO crm_sales_materials(id,title,description,kind,source,created_by_email) VALUES(${id},${title},'Tarifas, beneficios y fotos del alojamiento para mostrar a tus huéspedes.','deliverable','file','admin@example.com')`;
 await sql`INSERT INTO crm_sales_material_versions(id,material_id,version,object_key,file_name,mime_type,byte_size,actor_email) VALUES(${randomUUID()},${id},1,${key},${file.name},${file.mime},${file.body.length},'admin@example.com')`;
 await sql`UPDATE crm_sales_materials SET current_version=1 WHERE id=${id}`;return id;
}
test.beforeAll(async()=>{
 r2=createServer((req,res)=>{
  const url=new URL(req.url!,'http://r2.test');const key=url.pathname.split('/').slice(2).map(decodeURIComponent).join('/');const o=objects.get(key);
  if(!url.searchParams.has('X-Amz-Signature')&&!String(req.headers.authorization??'').startsWith('AWS4-HMAC-SHA256')){res.writeHead(403).end();return;}
  if(!o){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':url.searchParams.get('response-content-type')??o.type,'Content-Length':o.body.length,...(url.searchParams.get('response-content-disposition')?{'Content-Disposition':url.searchParams.get('response-content-disposition')!}:{})}).end(req.method==='HEAD'?undefined:o.body);
 });
 await new Promise<void>(resolve=>r2.listen(R2_PORT,'127.0.0.1',resolve));
 sql=postgres(process.env.DATABASE_URL!,{max:1,...(process.env.CRM_TEST_DATABASE==='1'&&process.env.CRM_TEST_DATABASE_SOCKET?{path:process.env.CRM_TEST_DATABASE_SOCKET}:{})});
 const [account]=await sql<{id:string}[]>`INSERT INTO crm_accounts(nombre,status,assigned_user_email) VALUES(${'Material e2e '+randomUUID().slice(0,8)},'reviewed','admin@example.com') RETURNING id`;
 const photo=await material('Foto de la cabaña «Río» & más',{name:'cabana.png',mime:'image/png',body:PNG});
 const brochure=await material('Folleto de tarifas 2027',{name:'folleto.pdf',mime:'application/pdf',body:Buffer.from('%PDF-1.4\n%%EOF')});
 const img=await share(photo,account.id);tokens.image=img.token;tokens.imageShareId=img.id;
 tokens.pdf=(await share(brochure,account.id)).token;tokens.revoked=(await share(photo,account.id,true)).token;
});
test.afterAll(async()=>{await sql?.end();await new Promise<void>(resolve=>r2?r2.close(()=>resolve()):resolve());});

for(const width of [1280,390])test(`public material page renders the material, Open Graph and states at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:844});
 const csp:string[]=[];page.on('console',m=>{if(/Content.Security.Policy/i.test(m.text()))csp.push(m.text())});
 const response=await page.goto('/m/'+tokens.image);
 expect(response!.status()).toBe(200);
 expect(response!.headers()['content-security-policy']).toContain(`default-src 'none'`);expect(response!.headers()['x-robots-tag']).toBe('noindex, nofollow, noarchive');expect(response!.headers()['cache-control']).toBe('no-store');
 await expect(page.getByRole('heading',{level:1})).toHaveText('Foto de la cabaña «Río» & más');
 await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content','Foto de la cabaña «Río» & más');
 await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content',new RegExp(`/m/${tokens.image}/cover$`));
 await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex, nofollow, noarchive');
 // The image arrives through /m/<token>/file → presigned R2 URL; the address bar stays on our domain.
 const image=page.getByRole('img',{name:'Foto de la cabaña «Río» & más'});
 await expect.poll(()=>image.evaluate((node:HTMLImageElement)=>node.complete&&node.naturalWidth)).toBe(1);
 expect(new URL(page.url()).pathname).toBe('/m/'+tokens.image);
 const download=page.getByRole('link',{name:'Descargar'});
 expect(await download.evaluate(node=>node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
 const [file]=await Promise.all([page.waitForEvent('download'),download.click()]);expect(file.suggestedFilename()).toBe('cabana.png');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 expect(csp).toEqual([]);
 // A preview bot gets the same Open Graph HTML; the cover is served by our server, cacheable.
 const bot=await request.get('/m/'+tokens.image,{headers:{'user-agent':'WhatsApp/2.23.20.0'}});expect(bot.status()).toBe(200);expect(await bot.text()).toContain('<meta property="og:title" content="Foto de la cabaña «Río» &#38; más">');
 const cover=await request.get(`/m/${tokens.image}/cover`);expect(cover.status()).toBe(200);expect(cover.headers()['content-type']).toBe('image/png');expect(cover.headers()['cache-control']).toBe('public, max-age=3600');
 const [row]=await sql<{technicalAccessCount:number}[]>`SELECT technical_access_count AS "technicalAccessCount" FROM crm_sales_material_shares WHERE id=${tokens.imageShareId}`;expect(row.technicalAccessCount).toBe(0);// Headless Chrome and WhatsApp are not counted.
 // PDF: inline viewer on desktop and mobile Chrome (not Android), plus «Abrir PDF».
 await page.goto('/m/'+tokens.pdf);
 await expect(page.locator('iframe[title="PDF: Folleto de tarifas 2027"]')).toHaveAttribute('src',`/m/${tokens.pdf}/file`);
 await expect(page.getByRole('link',{name:'Abrir PDF'})).toHaveAttribute('rel','noopener noreferrer');
 // States: revoked 410, unknown 404, never the SPA.
 const revoked=await page.goto('/m/'+tokens.revoked);expect(revoked!.status()).toBe(410);await expect(page.getByRole('heading',{level:1})).toHaveText('Este enlace ya no está disponible');
 const unknown=await page.goto('/m/'+randomBytes(32).toString('base64url'));expect(unknown!.status()).toBe(404);await expect(page.getByRole('heading',{level:1})).toHaveText('Este enlace no es válido');
 await expect(page.locator('#root')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
