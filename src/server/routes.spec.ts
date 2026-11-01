// @vitest-environment node
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {Hono} from 'hono';

// Public by design (own credentials, API key, bearer token or webhook secret). Probed without credentials (empty body: 400 is the handler's own validation, 503 means the secret is not configured) and with the relevant token envs unset; each must answer exactly this status.
const PUBLIC_EXPECTED:Record<string,number>={
'GET /_api/health':200,
'GET /_api/health/live':200,
// Readiness checks the DB; the dummy DB is unreachable, so it answers 503.
'GET /_api/health/ready':503,
'POST /_api/auth/login_with_password':400,
'POST /_api/auth/register_with_password':400,
'POST /_api/auth/password_recovery/request':400,
'POST /_api/auth/password_recovery/reset':400,
'GET /_api/auth/invitation':400,
'POST /_api/brevo/events':503,
'GET /_api/business_import':503,
'POST /_api/business_import':503,
'POST /_api/inbound/email':503,
'POST /_api/inbound/instagram':503,
'GET /_api/inbound/instagram':503,
'GET /_api/inbound/addresses':503,
'GET /_api/userscript/context':401,
'GET /_api/userscript/status':401,
'POST /_api/userscript/register':401,
'POST /_api/userscript/badges':401,
'GET /_api/userscript/templates':401,
'POST /_api/userscript/prepare':401,
'GET /_api/userscript/materials':401,
'POST /_api/userscript/material_add':401,
'POST /_api/userscript/material_remove':401,
'GET /_api/userscript/material_file':401,
'POST /_api/userscript/dispatch':401,
'POST /_api/userscript/outcome':401,
'POST /_api/userscript/instagram/thread':401,
'POST /_api/userscript/instagram/thread/stale':401,
'GET /_api/userscript/instagram/threads':401,
'POST /_api/userscript/preferences':401,
'GET /_api/userscript/auto-registrations':401,
'POST /_api/userscript/void':401,
'GET /_api/userscript/tokens':401,
'POST /_api/userscript/tokens':401,
'POST /_api/userscript/tokens/revoke':401,
'GET /_api/inbound/review':401,
'GET /_api/inbound/unmatched':401,
'POST /_api/inbound/assign':401,
'POST /_api/inbound/unmatched/dismiss':401,
'POST /_api/inbound/unmatched/restore':401,
'POST /_api/inbound/unmatched/rescan':401,
};
// Wildcard or ALL routes under /_api are not probed, so none are allowed.
const WILDCARD_ALLOWLIST=new Set<string>();
const TOUCHED_ENV=['DATABASE_URL','JWT_SECRET','BREVO_WEBHOOK_TOKEN','BUSINESS_IMPORT_TOKEN_SHA256','BUSINESS_IMPORT_ACTOR_EMAIL','INBOUND_EMAIL_TOKEN','INSTAGRAM_APP_SECRET','INSTAGRAM_ACCOUNT_ID','INSTAGRAM_VERIFY_TOKEN','INTEGRATION_SECRETS_KEY'];
const savedEnv:Record<string,string|undefined>={};
let app:Hono;
const probe=(path:string,method:string)=>app.request(path,{method,...(method==='POST'?{headers:{'content-type':'application/json'},body:'{}'}:{})});

beforeAll(async()=>{
for(const k of TOUCHED_ENV){savedEnv[k]=process.env[k];delete process.env[k];}
// The DB client connects lazily, so a dummy URL is enough as long as no request reaches the database.
process.env.DATABASE_URL='postgres://u:p@127.0.0.1:1/x';
process.env.JWT_SECRET='route-matrix-test-secret-0123456789abcdef';
app=(await import('./app')).app as unknown as Hono;
});
afterAll(()=>{for(const k of TOUCHED_ENV){if(savedEnv[k]===undefined)delete process.env[k];else process.env[k]=savedEnv[k];}});

describe('API route matrix without a session cookie',()=>{
it('has no wildcard or ALL routes under /_api',()=>{
const bad=app.routes.filter(r=>r.path.startsWith('/_api')&&(r.method==='ALL'||r.path.includes('*'))).map(r=>`${r.method} ${r.path}`).filter(k=>!WILDCARD_ALLOWLIST.has(k));
expect(bad).toEqual([]);
});
it('rejects every non-public /_api route as not authenticated',async()=>{
const routes=app.routes.filter(r=>r.path.startsWith('/_api/')&&r.method!=='ALL'&&!r.path.includes('*'));
expect(routes.length).toBeGreaterThan(40);
const unexpected:string[]=[];
for(const r of routes){
const key=`${r.method} ${r.path}`;
if(key in PUBLIC_EXPECTED)continue;
const res=await probe(r.path,r.method);
const text=await res.text();
if(res.status!==401)unexpected.push(`${key} -> ${res.status} ${text.slice(0,80)}`);
}
expect(unexpected).toEqual([]);
});
it('keeps every public route answering its expected status without credentials',async()=>{
const registered=new Set(app.routes.map(r=>`${r.method} ${r.path}`));
const actual:Record<string,number>={};
for(const key of Object.keys(PUBLIC_EXPECTED)){
expect(registered.has(key),key).toBe(true);
const [method,path]=key.split(' ');
actual[key]=(await probe(path,method)).status;
}
expect(actual).toEqual(PUBLIC_EXPECTED);
});
it('answers 404 JSON for unknown /_api paths',async()=>{
const res=await app.request('/_api/does_not_exist');
expect(res.status).toBe(404);
expect(await res.json()).toEqual({error:'Endpoint not found'});
});
it('answers 413 for an over-limit /_api body before auth, while a small body still reaches auth',async()=>{
const big=await app.request('/_api/commercial',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(300*1024)});
expect(big.status).toBe(413);
expect(((await big.json()) as {json:{error:string}}).json.error).toBe('La solicitud es demasiado grande.');
expect((await app.request('/_api/commercial',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status).toBe(401);
});
});
