import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {z} from 'zod';
import {config,scope} from './config';
import {access,authorize,authMetadata,resourceMetadata,token,revoke} from './oauth';
import {list,business,matches,overview,history} from './data';
const id=z.string().regex(/^[1-9][0-9]{0,17}$/),cursor=z.string().regex(/^[0-9]{1,18}$/).default('0'),limit=z.number().int().min(1).max(100).default(50);
export function mcpRoutes(){
 const app=new Hono();
 app.use('*',bodyLimit({maxSize:65536}));
 app.use('*',async(c,next)=>{
  const cfg=config();
  if(!cfg)return c.json({error:'MCP disabled'},404);
  if(new URL(c.req.url).host!==new URL(cfg.origin).host)return c.json({error:'Host not allowed'},403);
  const origin=c.req.header('origin');
  if(origin&&![cfg.origin,'https://chatgpt.com'].includes(origin))return c.json({error:'Origin not allowed'},403);
  // Use the fixed configured origin for discovery/issuance; never forwarded host headers.
  if(origin){c.header('Access-Control-Allow-Origin',origin);c.header('Vary','Origin');c.header('Access-Control-Allow-Headers','Authorization, Content-Type, MCP-Protocol-Version');c.header('Access-Control-Allow-Methods','GET, POST, OPTIONS');c.header('Access-Control-Expose-Headers','WWW-Authenticate');}
  c.header('Cache-Control','no-store');
  await next();
 });
 app.options('*',c=>c.body(null,204));
 app.get('/.well-known/oauth-authorization-server',c=>c.json(authMetadata(config()!)));
 for(const path of ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'])app.get(path,c=>c.json(resourceMetadata(config()!)));
 app.get('/mcp/oauth/authorize',c=>authorize(config()!,c.req.raw));
 app.post('/mcp/oauth/authorize',c=>authorize(config()!,c.req.raw));
 app.post('/mcp/oauth/token',c=>token(config()!,c.req.raw));
 app.post('/mcp/oauth/revoke',c=>revoke(config()!,c.req.raw));
 app.all('/mcp',async c=>{
  const cfg=config()!;
  try{await access(cfg,(c.req.header('authorization')??'').replace(/^Bearer /,''));}
  catch{return c.json({error:'unauthorized'},401,{'WWW-Authenticate':`Bearer resource_metadata="${cfg.origin}/.well-known/oauth-protected-resource/mcp", scope="${scope}"`});}
  if(c.req.method!=='POST')return c.body(null,405,{'Allow':'POST'});
  const server=new McpServer({name:'hospeda-crm-readonly',version:'1.0.0'});
  const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
  const wrap=async(fn:()=>Promise<unknown>)=>{try{const data=await fn();return {content:[{type:'text' as const,text:JSON.stringify(data)}]};}catch{return {isError:true,content:[{type:'text' as const,text:'No se pudo consultar el CRM. Revisar permisos y disponibilidad; no se modificaron datos.'}]};}};
  server.registerTool('crm_overview',{description:'Resumen del CRM y clasificaciones vigentes. Solo lectura.',annotations,inputSchema:{}},()=>wrap(()=>overview(cfg)));
  server.registerTool('crm_list_businesses',{description:'Lista paginada por ID; permite recorrer todos los negocios sin exportaciones. Excluye fusionados y, por defecto, archivados. Datos almacenados, no validación externa.',annotations,inputSchema:{cursor,limit,search:z.string().max(200).optional(),city:z.string().max(200).optional(),vertical:z.string().max(200).optional(),includeArchived:z.boolean().default(false)}},input=>wrap(()=>list(cfg,input)));
  server.registerTool('crm_get_business',{description:'Datos, fuentes, personas activas y gestiones de un negocio. Solo lectura.',annotations,inputSchema:{id}},input=>wrap(()=>business(cfg,input.id)));
  server.registerTool('crm_find_business_matches',{description:'Candidatos por nombre/localidad, teléfono o enlaces/contactos compartidos. No confirma duplicados y nunca fusiona.',annotations,inputSchema:{id}},input=>wrap(()=>matches(cfg,input.id)));
  server.registerTool('crm_business_history',{description:'Journal comercial del negocio paginado por ID. No incluye todos los diarios técnicos o de gestiones.',annotations,inputSchema:{id,cursor,limit}},input=>wrap(()=>history(cfg,input.id,input.cursor,input.limit)));
  const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try{await server.connect(transport);return await transport.handleRequest(c.req.raw);}finally{await server.close();}
 });
 return app;
}
