import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {SignJWT,jwtVerify} from 'jose';
import {sql} from 'kysely';
import {db} from '../../helpers/db';
import {getServerUserSession} from '../../helpers/getServerUserSession';
import {type Config,scope} from './config';
export const hash=(s:string)=>createHash('sha256').update(s).digest('base64url');
const random=()=>randomBytes(32).toString('base64url');
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const html=(body:string,status=200)=>new Response('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Acceso de lectura al CRM</title><body><main>'+body+'</main></body></html>',{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export function authMetadata(c:Config){return {issuer:c.origin,authorization_endpoint:c.origin+'/mcp/oauth/authorize',token_endpoint:c.origin+'/mcp/oauth/token',revocation_endpoint:c.origin+'/mcp/oauth/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],token_endpoint_auth_methods_supported:['client_secret_basic','client_secret_post'],code_challenge_methods_supported:['S256'],scopes_supported:[scope,'offline_access'],authorization_response_iss_parameter_supported:true};}
export function resourceMetadata(c:Config){return {resource:c.resource,authorization_servers:[c.origin],scopes_supported:[scope],bearer_methods_supported:['header']};}
async function sign(c:Config,data:Record<string,unknown>,seconds:number){return new SignJWT(data).setProtectedHeader({alg:'HS256'}).setIssuer(c.origin).setAudience(c.resource).setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000)+seconds).sign(new TextEncoder().encode(c.tokenSecret));}
async function verify(c:Config,token:string){return (await jwtVerify(token,new TextEncoder().encode(c.tokenSecret),{issuer:c.origin,audience:c.resource,algorithms:['HS256']})).payload;}
async function admin(id:number){
 const user=await db.selectFrom('users').innerJoin('authorizedEmails','users.email','authorizedEmails.email').select('users.id').where('users.id','=',id).where('users.role','=','admin').where('authorizedEmails.active','=',true).executeTakeFirst();
 if(!user)throw new Error('Admin authorization revoked');
}
export async function access(c:Config,token:string){const p=await verify(c,token);if(p.kind!=='access'||p.scope!==scope||!Number.isSafeInteger(p.userId))throw new Error('Invalid token');await admin(p.userId as number);return p.userId as number;}
function authorizeParams(c:Config,url:URL){
 const p=url.searchParams;
 if(p.get('client_id')!==c.clientId||!c.redirects.includes(p.get('redirect_uri')??'')||p.get('response_type')!=='code'||p.get('resource')!==c.resource||p.get('code_challenge_method')!=='S256'||!/^[-_a-zA-Z0-9]{43}$/.test(p.get('code_challenge')??''))throw new Error('Invalid authorization request');
 const scopes=(p.get('scope')??scope).split(' ');
 if(!scopes.includes(scope)||scopes.some(s=>![scope,'offline_access'].includes(s))||(p.get('state')??'').length>2048)throw new Error('Invalid scope/state');
 return {redirect:p.get('redirect_uri')!,challenge:p.get('code_challenge')!,scope:scopes.join(' '),state:p.get('state')??''};
}
function redirect(c:Config,p:{redirect:string;state:string},code?:string){const u=new URL(p.redirect);u.searchParams.set(code?'code':'error',code??'access_denied');u.searchParams.set('state',p.state);u.searchParams.set('iss',c.origin);return Response.redirect(u.toString(),303);}
export async function authorize(c:Config,request:Request){
 try{
  let user;
  try{user=(await getServerUserSession(request)).user;}catch{return html('<h1>Conectar el CRM</h1><p>Abrí el CRM en otra pestaña e iniciá sesión. Después volvé y recargá esta página.</p><a href="/login" target="_blank" rel="noopener">Abrir CRM</a>',401);}
  await admin(user.id);
  if(request.method==='GET'){
   const p=authorizeParams(c,new URL(request.url));
   const consent=await sign(c,{kind:'consent',userId:user.id,...p},300);
   return html(`<h1>Autorizar lectura del CRM</h1><p>ChatGPT podrá consultar negocios, clasificaciones, datos de contacto y el historial comercial. No podrá editar, fusionar, borrar ni enviar mensajes.</p><form method="post"><input type="hidden" name="consent" value="${escape(consent)}"><button name="decision" value="allow">Autorizar lectura</button> <button name="decision" value="deny">Cancelar</button></form>`);
  }
  if(request.headers.get('origin')!==c.origin)return json({error:'invalid_request'},400);
  const form=await request.formData(),p=await verify(c,String(form.get('consent')??''));
  if(p.kind!=='consent'||p.userId!==user.id||!c.redirects.includes(String(p.redirect)))throw new Error('Invalid consent');
  const target={redirect:String(p.redirect),state:String(p.state)};
  if(form.get('decision')!=='allow')return redirect(c,target);
  const code=random();
  await sql`INSERT INTO crm_mcp_credentials(hash,kind,user_id,client_id,redirect_uri,challenge,scopes,expires_at) VALUES(${hash(code)},'code',${user.id},${c.clientId},${target.redirect},${String(p.challenge)},${String(p.scope)},now()+interval '5 minutes')`.execute(db);
  return redirect(c,target,code);
 }catch{return json({error:'invalid_request'},400);}
}
function client(c:Config,request:Request,p:URLSearchParams){
 let id=p.get('client_id'),secret=p.get('client_secret');
 const auth=request.headers.get('authorization');
 if(auth?.startsWith('Basic ')){const raw=Buffer.from(auth.slice(6),'base64').toString();const index=raw.indexOf(':');id=decodeURIComponent(raw.slice(0,index));secret=decodeURIComponent(raw.slice(index+1));}
 const a=Buffer.from(secret??''),b=Buffer.from(c.clientSecret);
 if(id!==c.clientId||a.length!==b.length||!timingSafeEqual(a,b))throw new Error('Invalid client');
}
export async function token(c:Config,request:Request){
 try{
  const p=new URLSearchParams(await request.text());client(c,request,p);
  if(p.get('resource')!==c.resource)return json({error:'invalid_target'},400);
  const kind=p.get('grant_type')==='authorization_code'?'code':p.get('grant_type')==='refresh_token'?'refresh':null;
  if(!kind)return json({error:'unsupported_grant_type'},400);
  const credential=p.get(kind==='code'?'code':'refresh_token')??'';
  return await db.transaction().execute(async tx=>{
   const row=(await sql<{user_id:number;redirect_uri:string;challenge:string;scopes:string}>`SELECT user_id,redirect_uri,challenge,scopes FROM crm_mcp_credentials WHERE hash=${hash(credential)} AND kind=${kind} AND client_id=${c.clientId} AND expires_at>now() FOR UPDATE`.execute(tx)).rows[0];
   if(!row)return json({error:'invalid_grant'},400);
   if(kind==='code'&&(p.get('redirect_uri')!==row.redirect_uri||!/^[-._~a-zA-Z0-9]{43,128}$/.test(p.get('code_verifier')??'')||hash(p.get('code_verifier')!)!==row.challenge))return json({error:'invalid_grant'},400);
   // Recheck live role and allowlist during every exchange and every MCP request.
   const allowed=await tx.selectFrom('users').innerJoin('authorizedEmails','users.email','authorizedEmails.email').select('users.id').where('users.id','=',row.user_id).where('users.role','=','admin').where('authorizedEmails.active','=',true).executeTakeFirst();
   if(!allowed)return json({error:'invalid_grant'},400);
   await sql`DELETE FROM crm_mcp_credentials WHERE hash=${hash(credential)}`.execute(tx);
   const accessToken=await sign(c,{kind:'access',userId:row.user_id,scope},3600);
   let refresh:string|undefined;
   if(row.scopes.split(' ').includes('offline_access')){refresh=random();await sql`INSERT INTO crm_mcp_credentials(hash,kind,user_id,client_id,scopes,expires_at) VALUES(${hash(refresh)},'refresh',${row.user_id},${c.clientId},${row.scopes},now()+interval '30 days')`.execute(tx);}
   return json({access_token:accessToken,token_type:'Bearer',expires_in:3600,scope,...(refresh?{refresh_token:refresh}:{})});
  });
 }catch{return json({error:'invalid_client'},400);}
}
export async function revoke(c:Config,request:Request){try{const p=new URLSearchParams(await request.text());client(c,request,p);await sql`DELETE FROM crm_mcp_credentials WHERE hash=${hash(p.get('token')??'')} AND client_id=${c.clientId}`.execute(db);return json({});}catch{return json({error:'invalid_client'},400);}}
