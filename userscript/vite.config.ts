import { defineConfig } from "vite";
import { resolve } from "node:path";
import { USERSCRIPT_VERSION } from "./src/version";

const base = process.env.USERSCRIPT_CRM_BASE_URL || "https://crm.hospeda.com.ar";
const connectHost = new URL(base).hostname;
const banner = `// ==UserScript==\n// @name         Hospeda CRM\n// @namespace    https://crm.hospeda.com.ar\n// @version      ${USERSCRIPT_VERSION}\n// @description  Registro manual y confirmado de mensajes visibles en WhatsApp Web\n// @match        https://web.whatsapp.com/*\n// @grant        GM_xmlhttpRequest\n// @grant        GM_getValue\n// @grant        GM_setValue\n// @grant        GM_registerMenuCommand\n// @grant        unsafeWindow\n// @connect      ${connectHost}\n// @updateURL    ${base}/userscripts/hospeda-crm.user.js\n// @downloadURL  ${base}/userscripts/hospeda-crm.user.js\n// @run-at       document-idle\n// @noframes\n// ==/UserScript==`;

export default defineConfig({
  define: { "import.meta.env.USERSCRIPT_CRM_BASE_URL": JSON.stringify(base) },
  plugins: [{
    name: "userscript-metadata-prefix",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) if (output.type === "chunk" && output.isEntry && !output.code.startsWith("// ==UserScript==")) output.code = `${banner}\n${output.code}`;
    },
  }],
  build: {
    outDir: resolve(__dirname, "../dist/userscripts"), emptyOutDir: false, minify: false, sourcemap: false,
    lib: { entry: resolve(__dirname, "src/main.ts"), formats: ["iife"], name: "HospedaCRM", fileName: () => "hospeda-crm.user.js" },
    rollupOptions: { output: { inlineDynamicImports: true, banner } },
  },
});
