// @vitest-environment node
import {beforeAll,describe,expect,it} from 'vitest';
import type {Hono} from 'hono';

// Public by design (own credentials, API key, bearer token or webhook secret; leads_ingest checks its token against the DB, so it cannot be probed without one). Everything else under /_api must reject a request without a session cookie.
const PUBLIC_ROUTES=new Set(['GET /_api/health','POST /_api/auth/login_with_password','POST /_api/auth/register_with_password','POST /_api/auth/password_recovery/request','POST /_api/auth/password_recovery/reset','GET /_api/auth/invitation','POST /_api/brevo/events','POST /_api/leads_ingest','GET /_api/business_import','POST /_api/business_import']);
// Routes that currently answer something other than 401 without a cookie. These legacy handlers map every error, including 'Not authenticated', to 400. TODO(E-02): return 401 and remove the entries.
const KNOWN_EXCEPTIONS:Record<string,number>={
'GET /_api/analytics':400,
'GET /_api/lead_journal':400,
'GET /_api/saved_views':400,
'POST /_api/saved_views':400,
'GET /_api/profile':400,
'POST /_api/profile':400,
'GET /_api/lead_notes':400,
'POST /_api/lead_notes':400,
'POST /_api/leads_delete':400,
'POST /_api/leads_bulk':400,
'POST /_api/leads_bulk_delete':400,
'GET /_api/leads_duplicates':400,
'POST /_api/leads_hard_delete':400,
'POST /_api/leads':400,
'POST /_api/leads_quick':400,
'POST /_api/leads_restore':400,
'POST /_api/leads_save':400,
'GET /_api/leads_trash':400,
'GET /_api/business_reassignment':400,
'POST /_api/business_reassignment':400,
'GET /_api/settings':400,
'POST /_api/settings_save':400,
};

let app:Hono;
beforeAll(async()=>{
// The DB client connects lazily, so a dummy URL is enough as long as no request reaches the database.
process.env.DATABASE_URL='postgres://u:p@127.0.0.1:1/x';
process.env.JWT_SECRET='route-matrix-test-secret-0123456789abcdef';
app=(await import('./app')).app as unknown as Hono;
});

describe('API route matrix without a session cookie',()=>{
it('rejects every non-public /_api route with 401',async()=>{
const routes=app.routes.filter(r=>r.path.startsWith('/_api/')&&r.method!=='ALL'&&!r.path.includes('*'));
expect(routes.length).toBeGreaterThan(40);
const unexpected:string[]=[];
for(const r of routes){
const key=`${r.method} ${r.path}`;
if(PUBLIC_ROUTES.has(key))continue;
const res=await app.request(r.path,{method:r.method,...(r.method==='POST'?{headers:{'content-type':'application/json'},body:'{}'}:{})});
const expected=KNOWN_EXCEPTIONS[key]??401;
if(res.status!==expected)unexpected.push(`${key} -> ${res.status} (expected ${expected})`);
}
expect(unexpected).toEqual([]);
});
it('keeps the public allowlist in sync with registered routes',()=>{
const registered=new Set(app.routes.map(r=>`${r.method} ${r.path}`));
for(const key of PUBLIC_ROUTES)expect(registered.has(key),key).toBe(true);
});
it('answers 404 JSON for unknown /_api paths',async()=>{
const res=await app.request('/_api/does_not_exist');
expect(res.status).toBe(404);
});
});
