/** Which module of the shared «Hospeda CRM» script runs on this page (spec 94 D1): one script, routed by host. */
export type ScriptSite = "whatsapp" | "instagram" | "crm";

/** WhatsApp Web and Instagram get their own module; every other matched host is the CRM, where the script only announces its version. */
export function siteFor({ hostname }: { hostname: string }): ScriptSite {
  if (hostname === "web.whatsapp.com") return "whatsapp";
  if (hostname === "www.instagram.com") return "instagram";
  return "crm";
}
