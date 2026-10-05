import {readFile,writeFile} from 'node:fs/promises';
const [action,input,output]=process.argv.slice(2);
const base=new URL(process.env.BUSINESS_IMPORT_URL??'https://crm.hospeda.com.ar');
if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw new Error('Usá HTTPS.');
if(base.username||base.password)throw new Error('No pongas credenciales en la URL.');
const token=process.env.BUSINESS_IMPORT_TOKEN||(process.env.BUSINESS_IMPORT_TOKEN_FILE?(await readFile(process.env.BUSINESS_IMPORT_TOKEN_FILE,'utf8')).trim():'');
if(!/^[A-Za-z0-9_-]{43,200}$/.test(token))throw new Error('Configurá BUSINESS_IMPORT_TOKEN_FILE o BUSINESS_IMPORT_TOKEN.');
if(!['config','preview','confirm','status'].includes(action))throw new Error('Uso: node scripts/business-import.mjs config|preview|confirm|status [archivo JSON o batchId] [salida JSON]');
const url=new URL('/_api/business_import',base);
let body;
if(action==='status'){if(!input)throw new Error('Falta batchId.');url.searchParams.set('batchId',input);}
if(action==='preview'||action==='confirm'){
 if(!input||!output)throw new Error('Indicá archivo de entrada y salida para recuperar el lote.');
 body={...JSON.parse(await readFile(input,'utf8')),action:action==='preview'?'import_preview':'import_confirm'};
}
const response=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(60000)});
const result=await response.json();
if(!response.ok)throw new Error(`HTTP ${response.status}: ${result.error??'Importación fallida'}`);
if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});
else console.log(JSON.stringify(result,null,2));
if(output)console.log(`Resultado guardado: ${output}`);
