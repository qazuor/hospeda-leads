import { USERSCRIPT_VERSION } from "./version";

/** Attribute and event the CRM page reads. A string attribute crosses Tampermonkey's sandbox; event details may not. */
export const INSTALLED_ATTRIBUTE = "data-hospeda-userscript";
export const INSTALLED_EVENT = "hospeda-userscript-installed";
/** Spec 96 §3.1: whether the script's token works with the CRM (`connected | missing-token | rejected | outdated | unknown`). Never the token. */
export const CONNECTION_ATTRIBUTE = "data-hospeda-userscript-connection";
/** Spec 96 §10.3: the email of the CRM user that owns the token, only while connected. Not a secret; the token never reaches the page. */
export const USER_ATTRIBUTE = "data-hospeda-userscript-user";
/** The page asks the script to check its connection again («Verificar de nuevo»). */
export const RECHECK_EVENT = "hospeda-userscript-recheck";

/** Tells the CRM's user-script page which version is installed in this browser. */
export function announceInstalled(doc: Document): void {
  doc.documentElement.setAttribute(INSTALLED_ATTRIBUTE, USERSCRIPT_VERSION);
  doc.dispatchEvent(new Event(INSTALLED_EVENT));
}
