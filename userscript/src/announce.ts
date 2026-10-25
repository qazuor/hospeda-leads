import { USERSCRIPT_VERSION } from "./version";

/** Attribute and event the CRM page reads. A string attribute crosses Tampermonkey's sandbox; event details may not. */
export const INSTALLED_ATTRIBUTE = "data-hospeda-userscript";
export const INSTALLED_EVENT = "hospeda-userscript-installed";

/** Tells the CRM's user-script page which version is installed in this browser. */
export function announceInstalled(doc: Document): void {
  doc.documentElement.setAttribute(INSTALLED_ATTRIBUTE, USERSCRIPT_VERSION);
  doc.dispatchEvent(new Event(INSTALLED_EVENT));
}
