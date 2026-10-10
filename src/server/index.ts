import {get as searchGET} from '../endpoints/search';
import {mcpRoutes} from './mcp/routes';
import {handle as businessListDefaults} from '../endpoints/business_list_defaults';
import {get as communicationGET,post as communicationPOST,webhook as brevoWebhook} from '../endpoints/communication';
import {get as resourcesGET,post as resourcesPOST,download as resourceDownload} from '../endpoints/resources';
import {get as qualityGET,post as qualityPOST} from '../endpoints/dataQuality';
import {get as businessImportGET,post as businessImportPOST} from '../endpoints/businessImport';
import {request as passwordRecoveryRequest,reset as passwordRecoveryReset} from "../endpoints/auth/password_recovery";
import {get as pipelineGET,post as pipelinePOST} from "../endpoints/pipeline";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFile } from "node:fs/promises";
import { Hono } from "hono";
import { handle as h0 } from "../endpoints/analytics_GET";
import { handle as h1 } from "../endpoints/auth/login_with_password_POST";
import { handle as h2 } from "../endpoints/auth/logout_POST";
import { handle as h3 } from "../endpoints/auth/register_with_password_POST";
import { handle as h4 } from "../endpoints/auth/session_GET";
import { handle as invitationGET } from "../endpoints/auth/invitation_GET";
import { handle as h5 } from "../endpoints/lead_journal_GET";
import { handle as leadContactPOST } from "../endpoints/lead_contact_POST";
import { handle as savedViewsGET } from "../endpoints/saved_views_GET";
import { handle as savedViewsPOST } from "../endpoints/saved_views_POST";
import { handle as profileGET } from "../endpoints/profile_GET";
import { handle as profilePOST } from "../endpoints/profile_POST";
import { handle as h6 } from "../endpoints/lead_notes_GET";
import { handle as h7 } from "../endpoints/lead_notes_POST";
import { handle as h8 } from "../endpoints/leads_delete_POST";
import { handle as leadsBulkPOST } from "../endpoints/leads_bulk_POST";
import { handle as leadsBulkDeletePOST } from "../endpoints/leads_bulk_delete_POST";
import { handle as h9 } from "../endpoints/leads_duplicates_GET";
import { handle as h10 } from "../endpoints/leads_GET";
import { handle as h11 } from "../endpoints/leads_hard_delete_POST";
import { handle as h12 } from "../endpoints/leads_import_POST";
import { handle as h13 } from "../endpoints/leads_ingest_POST";
import { handle as h14 } from "../endpoints/leads_POST";
import { handle as h15 } from "../endpoints/leads_quick_POST";
import { handle as h16 } from "../endpoints/leads_restore_POST";
import { handle as h17 } from "../endpoints/leads_save_POST";
import { handle as h18 } from "../endpoints/leads_stats_GET";
import { handle as h19 } from "../endpoints/leads_trash_GET";
import { handle as h20 } from "../endpoints/live_version_GET";
import { handle as h21 } from "../endpoints/send_template_email_POST";
import { handle as h22 } from "../endpoints/settings_GET";
import { handle as h23 } from "../endpoints/settings_save_POST";

import { get as commercialGET, post as commercialPOST } from "../endpoints/commercial";

import {get as workGET,post as workPOST} from "../endpoints/work";

const app=new Hono();
// Mount only MCP paths; the normal CRM API and static routes keep their behavior.
const mcp=mcpRoutes();
for(const path of ['/mcp','/mcp/*','/.well-known/oauth-authorization-server','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'])app.all(path,c=>mcp.fetch(c.req.raw));
app.get('/_api/search',c=>searchGET(c.req.raw));
app.get('/_api/business_import',c=>businessImportGET(c.req.raw));
app.post('/_api/business_import',c=>businessImportPOST(c.req.raw));
app.get('/_api/communication',c=>communicationGET(c.req.raw));
app.post('/_api/communication',c=>communicationPOST(c.req.raw));
app.post('/_api/brevo/events',c=>brevoWebhook(c.req.raw));
app.get('/_api/resources',c=>resourcesGET(c.req.raw));
app.post('/_api/resources',c=>resourcesPOST(c.req.raw));
app.get('/_api/resources/download',c=>resourceDownload(c.req.raw));
app.get("/_api/data_quality",c=>qualityGET(c.req.raw));
app.post("/_api/data_quality",c=>qualityPOST(c.req.raw));
app.post("/_api/auth/password_recovery/request",c=>passwordRecoveryRequest(c.req.raw));
app.post("/_api/auth/password_recovery/reset",c=>passwordRecoveryReset(c.req.raw));
app.get("/_api/pipeline",c=>pipelineGET(c.req.raw));
app.post("/_api/pipeline",c=>pipelinePOST(c.req.raw));
app.get("/_api/work",c=>workGET(c.req.raw));
app.post("/_api/work",c=>workPOST(c.req.raw));
app.get("/_api/commercial", c=>commercialGET(c.req.raw));
app.post("/_api/commercial", c=>commercialPOST(c.req.raw));

app.get("/_api/health",(c)=>c.json({ok:true,service:"hospeda-leads"}));
app.get("/_api/analytics", (c) => h0(c.req.raw));
app.post("/_api/auth/login_with_password", (c) => h1(c.req.raw));
app.post("/_api/auth/logout", (c) => h2(c.req.raw));
app.post("/_api/auth/register_with_password", (c) => h3(c.req.raw));
app.get("/_api/auth/session", (c) => h4(c.req.raw));
app.get("/_api/auth/invitation", (c) => invitationGET(c.req.raw));
app.get("/_api/lead_journal", (c) => h5(c.req.raw));
app.post("/_api/lead_contact", (c) => leadContactPOST(c.req.raw));
app.get("/_api/saved_views", (c) => savedViewsGET(c.req.raw));
app.post("/_api/saved_views", (c) => savedViewsPOST(c.req.raw));
app.get("/_api/profile", (c) => profileGET(c.req.raw));
app.post("/_api/profile", (c) => profilePOST(c.req.raw));
app.get("/_api/lead_notes", (c) => h6(c.req.raw));
app.post("/_api/lead_notes", (c) => h7(c.req.raw));
app.post("/_api/leads_delete", (c) => h8(c.req.raw));
app.post("/_api/leads_bulk", (c) => leadsBulkPOST(c.req.raw));
app.post("/_api/leads_bulk_delete", (c) => leadsBulkDeletePOST(c.req.raw));
app.get("/_api/leads_duplicates", (c) => h9(c.req.raw));
app.get("/_api/leads", (c) => h10(c.req.raw));
app.post("/_api/leads_hard_delete", (c) => h11(c.req.raw));
app.post("/_api/leads_import", (c) => h12(c.req.raw));
app.post("/_api/leads_ingest", (c) => h13(c.req.raw));
app.post("/_api/leads", (c) => h14(c.req.raw));
app.post("/_api/leads_quick", (c) => h15(c.req.raw));
app.post("/_api/leads_restore", (c) => h16(c.req.raw));
app.post("/_api/leads_save", (c) => h17(c.req.raw));
app.get("/_api/leads_stats", (c) => h18(c.req.raw));
app.get("/_api/leads_trash", (c) => h19(c.req.raw));
app.get("/_api/live_version", (c) => h20(c.req.raw));
app.post("/_api/send_template_email", (c) => h21(c.req.raw));
app.get('/_api/business_list_defaults',c=>businessListDefaults(c.req.raw));
app.post('/_api/business_list_defaults',c=>businessListDefaults(c.req.raw));
app.get("/_api/settings", (c) => h22(c.req.raw));
app.post("/_api/settings_save", (c) => h23(c.req.raw));

app.use("/*",serveStatic({root:"./dist"}));
app.notFound(async(c)=>{
  if(c.req.path.startsWith("/_api/")) return c.json({error:"Endpoint not found"},404);
  try{
    const html=await readFile("./dist/index.html","utf8");
    return c.html(html);
  }catch{
    return c.text("Not found",404);
  }
});

const port=Number(process.env.PORT||3001);
serve({fetch:app.fetch,port},(info)=>{
  console.log(`Hospeda Leads listening on http://localhost:${info.port}`);
});
