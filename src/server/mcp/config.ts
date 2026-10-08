export const scope='crm.read';
export function config(){
 const env=process.env;
 if(env.CRM_MCP_ENABLED!=='1')return null;
 const origin=new URL(env.PUBLIC_APP_URL??'');
 if(origin.protocol!=='https:'&&!(env.CRM_TEST_DATABASE==='1'&&origin.hostname==='127.0.0.1'))throw new Error('MCP requires an HTTPS PUBLIC_APP_URL');
 if(origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw new Error('MCP PUBLIC_APP_URL must be an origin');
 if(!env.CRM_MCP_DATABASE_URL||!env.CRM_MCP_CLIENT_ID||!env.CRM_MCP_CLIENT_SECRET||!env.CRM_MCP_TOKEN_SECRET||env.CRM_MCP_CLIENT_SECRET.length<32||env.CRM_MCP_TOKEN_SECRET.length<32)throw new Error('MCP configuration incomplete');
 const redirects=(env.CRM_MCP_REDIRECT_URIS??'https://chatgpt.com/connector_platform_oauth_redirect').split(',');
 if(redirects.some(r=>{const u=new URL(r);return u.protocol!=='https:'||!!u.hash||!!u.username||!!u.password;}))throw new Error('MCP requires exact HTTPS redirect URIs');
 return {origin:origin.origin,resource:origin.origin+'/mcp',clientId:env.CRM_MCP_CLIENT_ID,clientSecret:env.CRM_MCP_CLIENT_SECRET,tokenSecret:env.CRM_MCP_TOKEN_SECRET,databaseUrl:env.CRM_MCP_DATABASE_URL,redirects};
}
export type Config=NonNullable<ReturnType<typeof config>>;
