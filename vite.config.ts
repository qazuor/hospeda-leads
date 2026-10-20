import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/_api": "http://localhost:3001",
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
