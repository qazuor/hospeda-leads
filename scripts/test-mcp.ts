import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import postgres from 'postgres';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {mcpRoutes} from '../src/server/mcp/routes';
import {hash,access} from '../src/server/mcp/oauth';
import {config} from '../src/server/mcp/config';
import {closeData} from '../src/server/mcp/data';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {db} from '../src/helpers/db';
assert.equal(process.env.CRM_TEST_DATABASE,'1');
const sql=postgres(process.env.DATABASE_URL!,{max:2,prepare:false});
const role='crm_mcp_test_'+Date.now(),password=randomBytes(24).toString('hex');
const origin='http://127.0.0.1:3001',resource=origin+'/mcp',redirect='https://chatgpt.com/connector_platform_oauth_redirect';
let fixtureId:number|undefined;
const app=mcpRoutes();
const call=(path:string,init?:RequestInit)=>app.fetch(new Request(origin+path,init));
const secret='test-mcp-secret-'+randomBytes(24).toString('hex');
process.env.CRM_MCP_CLIENT_ID='crm-mcp-test';process.env.CRM_MCP_CLIENT_SECRET=secret;process.env.CRM_MCP_TOKEN_SECRET=secret+'token';process.env.PUBLIC_APP_URL=origin;
const readonlyUrl=new URL(process.env.DATABASE_URL!);readonlyUrl.username=role;readonlyUrl.password=password;process.env.CRM_MCP_DATABASE_URL=readonlyUrl.toString();
async function exchange(body:Record<string,string>){return call('/mcp/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:'crm-mcp-test',client_secret:secret,resource,...body})});}
try{
 assert.equal((await call('/mcp')).status,404);
 await sql.unsafe(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
 await sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT ON crm_accounts,crm_contacts,leads,crm_verticals,crm_subtypes,crm_commercial_journal TO ${role}`);
 process.env.CRM_MCP_ENABLED='1';
 const reader=postgres(readonlyUrl.toString(),{max:1,prepare:false});
 try{await assert.rejects(()=>reader`UPDATE crm_accounts SET nombre=nombre WHERE false`,/permission denied/);await assert.rejects(()=>reader`SELECT * FROM user_passwords`,/permission denied/);}finally{await reader.end();}
 const metadata=await(await call('/.well-known/oauth-protected-resource/mcp')).json();assert.equal(metadata.resource,resource);
 assert.equal((await call('/mcp')).status,401);
 assert.ok((await call('/mcp')).headers.get('www-authenticate')?.includes('oauth-protected-resource/mcp'));
 assert.equal((await call('/mcp',{headers:{origin:'https://evil.example'}})).status,403);
 const email='mcp-test-'+Date.now()+'@example.com';
 const [u]=await sql`INSERT INTO users(email,display_name,role) VALUES(${email},'MCP test','admin') RETURNING id`;fixtureId=u.id;
 await sql`INSERT INTO authorized_emails(email,active) VALUES(${email},true)`;
 const sid=randomBytes(24).toString('hex');
 await sql`INSERT INTO sessions(id,user_id,expires_at) VALUES(${sid},${u.id},now()+interval '1 day')`;
 const response=new Response();await setServerSession(response,{id:sid,createdAt:Date.now(),lastAccessed:Date.now()});const cookie=response.headers.get('set-cookie')!.split(';')[0];
 const verifier=randomBytes(32).toString('base64url');
 const params=new URLSearchParams({client_id:'crm-mcp-test',redirect_uri:redirect,response_type:'code',resource,code_challenge:hash(verifier),code_challenge_method:'S256',scope:'crm.read offline_access',state:'test-state'});
 const authorizePath='/mcp/oauth/authorize?'+params;
 assert.equal((await call(authorizePath)).status,401);
 const bad=new URLSearchParams(params);bad.set('redirect_uri','https://evil.example');assert.equal((await call('/mcp/oauth/authorize?'+bad,{headers:{cookie}})).status,400);
 const consent=await call(authorizePath,{headers:{cookie}});assert.equal(consent.status,200);const consentToken=(await consent.text()).match(/name="consent" value="([^"]+)"/)![1];
 const form=new URLSearchParams({consent:consentToken,decision:'allow'});
 assert.equal((await call('/mcp/oauth/authorize',{method:'POST',headers:{cookie,origin:'https://chatgpt.com'},body:form})).status,400);
 const approved=await call('/mcp/oauth/authorize',{method:'POST',headers:{cookie,origin},body:form});assert.equal(approved.status,303);
 const callback=new URL(approved.headers.get('location')!);assert.equal(callback.searchParams.get('state'),'test-state');assert.equal(callback.searchParams.get('iss'),origin);const code=callback.searchParams.get('code')!;
 assert.equal((await exchange({grant_type:'authorization_code',code,redirect_uri:redirect,code_verifier:verifier+'bad'})).status,400);
 const exchanged=await exchange({grant_type:'authorization_code',code,redirect_uri:redirect,code_verifier:verifier});assert.equal(exchanged.status,200);const tokens=await exchanged.json();
 assert.equal((await exchange({grant_type:'authorization_code',code,redirect_uri:redirect,code_verifier:verifier})).status,400);
 assert.equal(await access(config()!,tokens.access_token),u.id);
 const client=new Client({name:'crm-test',version:'1'});
 const fetcher:typeof fetch=async(input,init)=>app.fetch(new Request(input,init));
 await client.connect(new StreamableHTTPClientTransport(new URL(resource),{fetch:fetcher,requestInit:{headers:{authorization:'Bearer '+tokens.access_token}}}));
 const tools=await client.listTools();assert.equal(tools.tools.length,5);assert.ok(tools.tools.every(t=>t.annotations?.readOnlyHint&&!t.annotations?.destructiveHint));
 const first=await client.callTool({name:'crm_list_businesses',arguments:{limit:2}});assert.ok(!first.isError);const data=JSON.parse((first.content as any)[0].text);assert.equal(data.businesses.length,2);assert.ok(data.nextCursor);
 const second=await client.callTool({name:'crm_list_businesses',arguments:{limit:2,cursor:data.nextCursor}});assert.notEqual(JSON.parse((second.content as any)[0].text).businesses[0].id,data.businesses[0].id);
 const badId=await client.callTool({name:'crm_get_business',arguments:{id:'1; DELETE FROM crm_accounts'}});assert.equal(badId.isError,true);
 assert.equal((await client.callTool({name:'crm_overview',arguments:{}})).isError,undefined);
 await client.close();
 // Refuse even a correctly authenticated tool if the DB role gained write permission.
 await sql.unsafe(`GRANT UPDATE ON crm_accounts TO ${role}`);
 const unsafeClient=new Client({name:'unsafe-test',version:'1'});await unsafeClient.connect(new StreamableHTTPClientTransport(new URL(resource),{fetch:fetcher,requestInit:{headers:{authorization:'Bearer '+tokens.access_token}}}));
 assert.equal((await unsafeClient.callTool({name:'crm_overview',arguments:{}})).isError,true);await unsafeClient.close();
 await sql.unsafe(`REVOKE UPDATE ON crm_accounts FROM ${role}`);
 const refreshed=await exchange({grant_type:'refresh_token',refresh_token:tokens.refresh_token});assert.equal(refreshed.status,200);const rotated=await refreshed.json();
 assert.equal((await exchange({grant_type:'refresh_token',refresh_token:tokens.refresh_token})).status,400);
 await sql`UPDATE users SET role='user' WHERE id=${u.id}`;
 await assert.rejects(()=>access(config()!,rotated.access_token));assert.equal((await exchange({grant_type:'refresh_token',refresh_token:rotated.refresh_token})).status,400);
 assert.equal((await call('/mcp',{headers:{authorization:'Bearer '+rotated.access_token}})).status,401);
 console.log('MCP OAuth PKCE, consent, replay, refresh rotation, live admin revocation, SDK tools and read-only role enforcement passed');
}finally{
 await closeData();
 if(fixtureId){await sql`DELETE FROM authorized_emails WHERE email=(SELECT email FROM users WHERE id=${fixtureId})`;await sql`DELETE FROM sessions WHERE user_id=${fixtureId}`;await sql`DELETE FROM users WHERE id=${fixtureId}`;}
 await sql.unsafe(`DROP OWNED BY ${role}; DROP ROLE IF EXISTS ${role}`);
 await sql.end();await db.destroy();
}
