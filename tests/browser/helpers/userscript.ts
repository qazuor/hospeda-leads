import type {Page} from '@playwright/test';
import {CONNECTION_ATTRIBUTE,INSTALLED_ATTRIBUTE,INSTALLED_EVENT,USER_ATTRIBUTE} from '../../../userscript/src/announce';
import {USERSCRIPT_VERSION} from '../../../userscript/src/version';

/**
 * Spec 96 §6: the Playwright browser has no user script, so on desktop every WhatsApp/Instagram button would be gated. This announces a
 * script the way 1.5.0 does on the CRM page (attributes on <html> plus `INSTALLED_EVENT`), on every navigation of `page`. It only sets
 * the installed/connection/user attributes: it never acks an Instagram handoff, so the plain profile URL is still what opens.
 * Call it before the first `page.goto`; `user` must be the email of the user the suite logs in as, or the gate reports another account.
 */
export async function simulateUserscript(page:Page,{version=USERSCRIPT_VERSION,connection='connected',user}:{version?:string;connection?:string;user:string}):Promise<void>{
 await page.addInitScript(({version,connection,user,names})=>{
  const announce=()=>{const html=document.documentElement;if(!html)return;html.setAttribute(names.installed,version);html.setAttribute(names.connection,connection);html.setAttribute(names.user,user);document.dispatchEvent(new Event(names.event));};
  announce();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',announce,{once:true});
 },{version,connection,user,names:{installed:INSTALLED_ATTRIBUTE,connection:CONNECTION_ATTRIBUTE,user:USER_ATTRIBUTE,event:INSTALLED_EVENT}});
}
