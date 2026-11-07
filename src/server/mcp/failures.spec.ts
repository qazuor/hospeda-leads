import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../helpers/db',()=>({db:{}}));
vi.mock('../../helpers/getServerUserSession',()=>({getServerUserSession:vi.fn()}));
import {config} from './config';
import {token,revoke} from './oauth';
import {mcpRoutes} from './routes';

const secret='unit-test-client-secret-that-is-long-enough';
const original={...process.env};
afterEach(()=>{vi.restoreAllMocks();process.env= {...original};});
function setup(){process.env.CRM_MCP_ENABLED='1';process.env.PUBLIC_APP_URL='https://crm.example';process.env.CRM_MCP_DATABASE_URL='postgres://reader:password@db.example/crm';process.env.CRM_MCP_CLIENT_ID='client';process.env.CRM_MCP_CLIENT_SECRET=secret;process.env.CRM_MCP_TOKEN_SECRET=secret;process.env.CRM_MCP_REDIRECT_URIS='https://chatgpt.com/connector_platform_oauth_redirect';return config()!;}
const brokenDb=()=>({transaction:()=>({execute:async()=>{throw new Error('db failed; '+secret);}}),execute:async()=>{throw new Error('db failed; '+secret);}}) as never;
describe('MCP temporary database failures',()=>{
 it.each([['token',token],['revoke',revoke]] as const)('%s returns a bounded server error and safe log',async(name,handler)=>{
  const cfg=setup(),error=vi.spyOn(console,'error').mockImplementation(()=>{});
  const body=name==='token'?new URLSearchParams({client_id:'client',client_secret:secret,resource:cfg.resource,grant_type:'refresh_token',refresh_token:'credential'}):new URLSearchParams({client_id:'client',client_secret:secret,token:'credential'});
  const response=await handler(cfg,new Request('https://crm.example/mcp/oauth/'+(name==='token'?'token':'revoke'),{method:'POST',body:body.toString()}),brokenDb());
  expect(response.status).toBe(500);expect(await response.json()).toEqual({error:'server_error'});expect(error).toHaveBeenCalledOnce();expect(String(error.mock.calls[0]?.[0])).toContain('db_error');expect(String(error.mock.calls[0]?.[0])).not.toContain(secret);
 });
 it('returns 503 without an auth challenge when admin lookup is unavailable',async()=>{
  setup();const error=vi.spyOn(console,'error').mockImplementation(()=>{});
  const app=mcpRoutes({checkAccess:async()=>{throw new Error('database unavailable');}});
  const response=await app.fetch(new Request('https://crm.example/mcp',{headers:{host:'crm.example'}}));
  expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'temporarily_unavailable'});expect(response.headers.has('www-authenticate')).toBe(false);expect(String(error.mock.calls[0]?.[0])).toContain('mcp_auth_unavailable');
 });
});
