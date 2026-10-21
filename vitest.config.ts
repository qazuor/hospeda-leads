import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    // Importing the session module fails fast without a valid JWT_SECRET; give unit tests a deterministic one (CI sets its own).
    env: { JWT_SECRET: "vitest-unit-secret-0123456789abcdef0123" },
  },
});
