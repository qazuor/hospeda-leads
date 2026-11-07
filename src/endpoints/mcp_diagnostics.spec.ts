import {afterEach,describe,expect,it} from 'vitest';
import {vi} from 'vitest';
vi.mock('../helpers/db',()=>({db:{}}));
vi.mock('../helpers/getServerUserSession',()=>({getServerUserSession:vi.fn()}));
import {handle} from './mcp_diagnostics';
import {config} from '../server/mcp/config';
import superjson from 'superjson';

const original={...process.env};
afterEach(()=>{process.env={...original};});
function setup(){process.env.CRM_MCP_ENABLED='1';process.env.PUBLIC_APP_URL='https://crm.example';process.env.CRM_MCP_DATABASE_URL='postgres://reader:password@db.example/crm';process.env.CRM_MCP_CLIENT_ID='client';process.env.CRM_MCP_CLIENT_SECRET='client-secret-that-is-at-least-32-characters';process.env.CRM_MCP_TOKEN_SECRET='token-secret-that-is-at-least-32-characters';return config()!;}
const session=(role:'admin'|'user')=>async()=>({user:{role}} as never);
const request=()=>new Request('https://crm.example/_api/mcp/diagnostics');
describe('MCP diagnostics handler',()=>{
 it('rejects non-admin users',async()=>{const response=await handle(request(),{session:session('user')});expect(response.status).toBe(403);});
 it('reports disabled MCP',async()=>{process.env.CRM_MCP_ENABLED='0';const response=await handle(request(),{session:session('admin'),getConfig:()=>{throw new Error();},lastIssued:async()=>null});const data=superjson.parse(await response.text()) as {enabled:boolean};expect(data.enabled).toBe(false);});
 it('reports a missing config variable by name only',async()=>{setup();delete process.env.CRM_MCP_CLIENT_ID;const response=await handle(request(),{session:session('admin'),getConfig:()=>{throw new Error('secret value');},lastIssued:async()=>null});const text=await response.text();expect(text).toContain('CRM_MCP_CLIENT_ID');expect(text).not.toContain('secret value');});
 it('reports an unreachable reader',async()=>{const cfg=setup();const response=await handle(request(),{session:session('admin'),getConfig:()=>cfg,getMissingGrants:async()=>[],readerPing:async()=>{throw new Error('offline');},lastIssued:async()=>null});const text=await response.text();expect(text).toContain('unreachable');});
});
