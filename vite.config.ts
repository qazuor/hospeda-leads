import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Overridable by scripts/local/cli.mjs when the default ports are busy.
    port: Number(process.env.CRM_DEV_WEB_PORT || 5173),
    // When the launcher chose the port, never silently move to another one.
    strictPort: Boolean(process.env.CRM_DEV_WEB_PORT),
    proxy: {
      "/_api": process.env.CRM_DEV_API_URL || "http://localhost:3001",
      // The API serves the user script; without this, Vite answers the install link (and Tampermonkey update checks) with the SPA.
      "/userscripts": process.env.CRM_DEV_API_URL || "http://localhost:3001",
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|react-router(-dom)?|scheduler)([\\/]|$)/.test(id)) return 'react';
          if (id.includes('/node_modules/@mantine/')) return 'mantine';
          if (id.includes('/node_modules/@tanstack/')) return 'query';
          if (id.includes('/node_modules/@tiptap/') || id.includes('/node_modules/prosemirror-')) return 'tiptap';
        },
      },
    },
  },
});
