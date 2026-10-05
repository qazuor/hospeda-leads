import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {db} from '../src/helpers/db';
import {get,post} from '../src/endpoints/businessImport';
import {mutateQuality} from '../src/helpers/dataQualityService';
import type {ImportReview,ImportResult} from '../src/endpoints/dataQuality.schema';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use disposable DB');
const stamp=Date.now(),token=randomBytes(32).toString('base64url');
const admin=await db.insertInto('users').values({email:`api-import-${stamp}@example.com`,displayName:'API test admin',role:'admin'}).returningAll().executeTakeFirstOrThrow();
const other={...admin,email:`other-api-${stamp}@example.com`,role:'user' as const};
await db.insertInto('users').values({email:other.email,displayName:'Other API test'}).execute();
const user={...admin,role:'user' as const};
async function call<T>(body:unknown,status=200,bearer=token){
 const response=await post(new Request('http://localhost/_api/business_import',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+bearer},body:JSON.stringify(body)}));
 const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result as T;
}
async function read<T>(query='',status=200){const response=await get(new Request('http://localhost/_api/business_import'+query,{headers:{Authorization:'Bearer '+token}}));const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value as T;}
const counts=()=>Promise.all((['leads','crmContacts','crmTasks','crmActivities'] as const).map(t=>db.selectFrom(t).select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow().then(r=>Number(r.n))));
try{
 delete process.env.BUSINESS_IMPORT_TOKEN_SHA256;delete process.env.BUSINESS_IMPORT_ACTOR_EMAIL;
 await call({},503);
 process.env.BUSINESS_IMPORT_TOKEN_SHA256=createHash('sha256').update(token).digest('hex');process.env.BUSINESS_IMPORT_ACTOR_EMAIL=admin.email;
 await call({},401,'wrong');await call({},401,randomBytes(32).toString('base64url'));
 process.env.BUSINESS_IMPORT_ACTOR_EMAIL=other.email;await call({},503);process.env.BUSINESS_IMPORT_ACTOR_EMAIL=admin.email;
 const tipo='Gastronomía API '+stamp,subtipo='Restaurante API '+stamp;
 await db.insertInto('crmVerticals').values({name:tipo,active:true}).execute();await db.insertInto('crmSubtypes').values({name:subtipo,typeName:tipo,active:true}).execute();
 delete process.env.BUSINESS_IMPORT_ACTOR_EMAIL;const previousAdminEmail=process.env.ADMIN_EMAIL;process.env.ADMIN_EMAIL=admin.email;await read();process.env.ADMIN_EMAIL=previousAdminEmail;process.env.BUSINESS_IMPORT_ACTOR_EMAIL=admin.email;
 const config=await read<{maxRows:number;subtypes:Array<{name:string}>}>();assert(config.maxRows<=30);assert(config.subtypes.some(s=>s.name===subtipo));
 const before=await counts(),rows=[{nombre:'API negocio '+stamp,ciudad:'Colón',tipo,subtipo,direccion:'Prueba 100',verificationUrls:'https://example.com/local',verifiedOn:'2026-01-01',discoverySource:'Sitio oficial'}];
 const previewBody={action:'import_preview',source:'Test API',rows};
 await call({...previewBody,mode:'opportunity'},400);
 await call({...previewBody,rows:Array.from({length:31},()=>rows[0])},400);
 await call({...previewBody,rows:[{...rows[0],asignadoA:admin.email}]},403);
 await call({action:'merge_preview',sourceId:'1',destinationId:'2'},400);
 const preview=await call<ImportReview>(previewBody);assert.equal(preview.mode,'business');assert.deepEqual(preview.rows[0].errors,[]);
 const confirm={action:'import_confirm',batchId:preview.batchId,confirm:true,decisions:[{index:0,action:'create'}]};
 await call({...confirm,decisions:[{index:0,action:'update',targetId:'1'}]},400);
 const result=await call<ImportResult>(confirm);assert.equal(result.imported,1);assert.equal(result.updated,0);assert.equal(result.details[0].entity,'business');
 assert.deepEqual(await call(confirm),result);assert.deepEqual(await counts(),before);
 const saved=await read<{accounts:Array<{id:string;tipo:string;subtipo:string;commercialStatus:string;assignedUserEmail:null}>;allCreatedAccountsPresent:boolean}>('?batchId='+preview.batchId);
 assert(saved.allCreatedAccountsPresent);assert.equal(saved.accounts[0].id,result.details[0].accountId);assert.equal(saved.accounts[0].tipo,tipo);assert.equal(saved.accounts[0].subtipo,subtipo);assert.equal(saved.accounts[0].commercialStatus,'prospect');assert.equal(saved.accounts[0].assignedUserEmail,null);
 assert.equal((await call<ImportReview>(previewBody)).batchId,preview.batchId);
 const duplicate=await call<ImportReview>({...previewBody,rows:[{...rows[0],businessNotes:'Distinto lote'}]});assert(duplicate.rows[0].matches.length);
 await call({...confirm,batchId:duplicate.batchId,decisions:[{index:0,action:'create',acknowledge:true}]},409);
 assert.equal((await call<ImportResult>({...confirm,batchId:duplicate.batchId,decisions:[{index:0,action:'skip'}]})).skipped,1);
 const simultaneousRows=[{nombre:'Race API '+stamp,ciudad:'Colón',direccion:'Race 101',tipo,subtipo}];
 const race=await call<ImportReview>({...previewBody,rows:simultaneousRows});
 await db.insertInto('crmAccounts').values(simultaneousRows[0]).execute();
 await call({...confirm,batchId:race.batchId,decisions:[{index:0,action:'create',acknowledge:true}]},409);
 const within=await call<ImportReview>({...previewBody,rows:[{...rows[0],nombre:'Within '+stamp,direccion:'Within 10'},{...rows[0],nombre:'Within '+stamp,direccion:'Within 10'}]});
 await call({...confirm,batchId:within.batchId,decisions:[{index:0,action:'create',acknowledge:true},{index:1,action:'skip'}]},409);
 const foreign=await mutateQuality(db,{action:'import_preview',mode:'business',source:'Other',rows:[{nombre:'Foreign '+stamp}]},other) as ImportReview;
 await call({...confirm,batchId:foreign.batchId},403);await read('?batchId='+foreign.batchId,404);
 const opportunity=await mutateQuality(db,{action:'import_preview',mode:'opportunity',source:'Legacy',rows:[{nombre:'Legacy API '+stamp}]},user) as ImportReview;
 await call({...confirm,batchId:opportunity.batchId},403);await read('?batchId='+opportunity.batchId,404);
 const bad=await call<ImportReview>({...previewBody,rows:[{nombre:'Invalid API '+stamp,tipo,subtipo:'inventado'}]});assert(bad.rows[0].errors.length);await call({...confirm,batchId:bad.batchId},400);
 const wrongType=await post(new Request('http://localhost',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'text/plain'},body:'{}'}));assert.equal(wrongType.status,415);
 const large=await post(new Request('http://localhost',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:' '.repeat(2097153)}));assert.equal(large.status,413);
 assert.deepEqual(await counts(),before);
 const dir=await mkdtemp(join(tmpdir(),'business-api-test-'));
 const server=createServer(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
  const request=new Request('http://localhost'+req.url,{method:req.method,headers:req.headers as Record<string,string>,body:req.method==='POST'?Buffer.concat(chunks):undefined});
  const response=await(req.method==='POST'?post(request):get(request));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
 });
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert(address&&typeof address==='object');
  await writeFile(join(dir,'token'),token,{mode:0o600});
  const env={...process.env,BUSINESS_IMPORT_URL:`http://127.0.0.1:${address.port}`,BUSINESS_IMPORT_TOKEN_FILE:join(dir,'token'),BUSINESS_IMPORT_TOKEN:''};
  const cli=(...args:string[])=>promisify(execFile)(process.execPath,['scripts/business-import.mjs',...args],{env});
  const configured=await cli('config');assert.equal(JSON.parse(configured.stdout).mode,'business');
  const input=join(dir,'input.json'),review=join(dir,'review.json'),decisions=join(dir,'decisions.json'),output=join(dir,'result.json'),persisted=join(dir,'persisted.json');
  await writeFile(input,JSON.stringify({source:'CLI test',rows:[{...rows[0],nombre:'CLI '+stamp,direccion:'CLI 110'}]}));
  await cli('preview',input,review);const cliReview=JSON.parse(await readFile(review,'utf8')) as ImportReview;
  await writeFile(decisions,JSON.stringify({batchId:cliReview.batchId,confirm:true,decisions:[{index:0,action:'create'}]}));
  await cli('confirm',decisions,output);const cliResult=JSON.parse(await readFile(output,'utf8')) as ImportResult;assert.equal(cliResult.imported,1);
  await cli('confirm',decisions,output);assert.deepEqual(JSON.parse(await readFile(output,'utf8')),cliResult);
  await cli('status',cliReview.batchId,persisted);const persistedResult=JSON.parse(await readFile(persisted,'utf8'));assert(persistedResult.allCreatedAccountsPresent);assert.equal(persistedResult.accounts[0].id,cliResult.details[0].accountId);
  assert.deepEqual(await counts(),before);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await rm(dir,{recursive:true,force:true});}
 console.log('Business API: scoped authentication, config, persisted businesses only, replay, duplicate races, create-only policy, ownership, input limits passed');
}finally{await db.destroy();}
