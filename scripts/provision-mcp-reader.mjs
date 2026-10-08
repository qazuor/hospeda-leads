import postgres from 'postgres';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,writeFileSync} from 'node:fs';
if(!process.env.DATABASE_URL)throw new Error('Falta DATABASE_URL.');
if(process.argv.slice(2).some(a=>a!=='--apply')||!process.argv.includes('--apply'))throw new Error('Creación explícita: node scripts/provision-mcp-reader.mjs --apply');
const url=new URL(process.env.DATABASE_URL),role='crm_mcp_reader',password=randomBytes(32).toString('hex');
const db=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
const directory=mkdtempSync('/tmp/crm-mcp-setup-'),file=directory+'/coolify.env';
try{
 const reader=new URL(url);reader.username=role;reader.password=password;
 const values={CRM_MCP_ENABLED:'1',CRM_MCP_DATABASE_URL:reader.toString(),CRM_MCP_CLIENT_ID:'hospeda-chatgpt',CRM_MCP_CLIENT_SECRET:randomBytes(32).toString('hex'),CRM_MCP_TOKEN_SECRET:randomBytes(32).toString('hex'),CRM_MCP_REDIRECT_URIS:'https://chatgpt.com/connector_platform_oauth_redirect'};
 // Save the credentials before committing role creation. Never print them to logs.
 writeFileSync(file,Object.entries(values).map(([key,value])=>`${key}=${value}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
 await db.begin(async tx=>{
  if((await tx`SELECT 1 FROM pg_roles WHERE rolname=${role}`).length)throw new Error('El rol crm_mcp_reader ya existe; no se reemplazan sus credenciales.');
  await tx.unsafe(`CREATE ROLE crm_mcp_reader LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
  const database=decodeURIComponent(url.pathname.slice(1));
  await tx`GRANT CONNECT ON DATABASE ${tx(database)} TO crm_mcp_reader`;
  await tx.unsafe('GRANT USAGE ON SCHEMA public TO crm_mcp_reader; GRANT SELECT ON public.crm_accounts,public.crm_contacts,public.leads,public.crm_verticals,public.crm_subtypes,public.crm_commercial_journal TO crm_mcp_reader');
 });
 console.log(JSON.stringify({created:true,role,configurationFile:file,secretsPrinted:false}));
}catch(error){
 // Keep the private credentials on an uncertain commit; do not lose recovery material.
 console.error(JSON.stringify({error:error.code??error.message,configurationFile:file,created:null}));process.exitCode=1;
}finally{await db.end();}
