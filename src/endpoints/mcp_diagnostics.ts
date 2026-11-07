import superjson from 'superjson';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {db} from '../helpers/db';
import {config} from '../server/mcp/config';
import {missingGrants,readerPing} from '../server/mcp/data';
import {logLine} from '../server/observability';
import {scope} from '../server/mcp/config';
import {sql} from 'kysely';
import {errorResponse} from '../helpers/errorResponse';
type DiagnosticDeps={session?:typeof getServerUserSession;getConfig?:typeof config;getMissingGrants?:typeof missingGrants;readerPing?:typeof readerPing;lastIssued?:()=>Promise<string|null>};
export async function handle(request:Request,deps:DiagnosticDeps={}){
 const getSession=deps.session??getServerUserSession,getCfg=deps.getConfig??config,getGrants=deps.getMissingGrants??missingGrants,ping=deps.readerPing??readerPing;
 try{
  const {user}=await getSession(request);if(user.role!=='admin')return new Response(superjson.stringify({error:'Solo administradores.'}),{status:403});
  let cfg:ReturnType<typeof config>=null,configProblem:string|undefined;try{cfg=getCfg();}catch{const e=process.env;const originValid=(()=>{try{const u=new URL(e.PUBLIC_APP_URL??'');return (u.protocol==='https:'||(e.CRM_TEST_DATABASE==='1'&&u.hostname==='127.0.0.1'))&&u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password;}catch{return false;}})();const databaseValid=(()=>{try{const u=new URL(e.CRM_MCP_DATABASE_URL??'');return ['postgres:','postgresql:'].includes(u.protocol)&&!!u.hostname&&!!u.pathname.slice(1);}catch{return false;}})();const redirectsValid=(()=>{try{return(e.CRM_MCP_REDIRECT_URIS??'https://chatgpt.com/connector_platform_oauth_redirect').split(',').every(r=>{const u=new URL(r);return u.protocol==='https:'&&!u.hash&&!u.username&&!u.password;});}catch{return false;}})();configProblem=e.CRM_MCP_ENABLED!=='1'?'CRM_MCP_ENABLED':!originValid?'PUBLIC_APP_URL':!databaseValid?'CRM_MCP_DATABASE_URL':!e.CRM_MCP_CLIENT_ID?'CRM_MCP_CLIENT_ID':!e.CRM_MCP_CLIENT_SECRET||e.CRM_MCP_CLIENT_SECRET.length<32?'CRM_MCP_CLIENT_SECRET':!e.CRM_MCP_TOKEN_SECRET||e.CRM_MCP_TOKEN_SECRET.length<32?'CRM_MCP_TOKEN_SECRET':!redirectsValid?'CRM_MCP_REDIRECT_URIS':'CRM_MCP_DATABASE_URL';}
  const enabled=process.env.CRM_MCP_ENABLED==='1';let missingTables:string[]=[],readerConnection:'ok'|'unreachable'|'unsafe_role'|'grants_incomplete'='unreachable';
  if(cfg){try{missingTables=await getGrants(cfg);if(missingTables.length)readerConnection='grants_incomplete';else{await ping(cfg);readerConnection='ok';}}catch(error){readerConnection=(error as {code?:string})?.code==='MCP_READER_UNSAFE'?'unsafe_role':'unreachable';logLine('error',{event:'mcp_diagnostic_reader_error',code:readerConnection==='unsafe_role'?'unsafe_role':'db_error'});}}
  let latest:string|null=null;try{latest=deps.lastIssued?await deps.lastIssued():(await sql<{value:string}>`SELECT value FROM app_settings WHERE key='crm_mcp_last_token_issued_at'`.execute(db)).rows[0]?.value??null;}catch{logLine('error',{event:'mcp_diagnostic_credentials_error',code:'db_error'});}
  const redirectUri=process.env.CRM_MCP_REDIRECT_URIS?.split(',')[0]??'https://chatgpt.com/connector_platform_oauth_redirect';
  return new Response(superjson.stringify({enabled,configOk:!!cfg,configProblem,grantsComplete:enabled&&readerConnection==='ok'&&!missingTables.length,missingTables,readerConnection,lastTokenIssuedAt:latest,url:(cfg?.origin??'http://localhost')+'/mcp',clientId:cfg?.clientId??null,redirectUri,scopes:[scope,'offline_access']}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }catch(error){return errorResponse(error);}
}
