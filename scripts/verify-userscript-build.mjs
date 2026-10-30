import { readFile } from "node:fs/promises";

const file = await readFile("dist/userscripts/hospeda-crm.user.js", "utf8");
const source = await readFile("userscript/src/version.ts", "utf8");
const version = source.match(/USERSCRIPT_VERSION\s*=\s*"([^"]+)"/)?.[1];
if (!version) throw new Error("Unable to read the userscript source version.");
for (const expected of ["// ==UserScript==", "@match        https://web.whatsapp.com/*", "@match        https://www.instagram.com/*", `@version      ${version}`]) {
  if (!file.startsWith("// ==UserScript==") || !file.includes(expected)) throw new Error(`Built userscript is missing expected metadata: ${expected}`);
}
