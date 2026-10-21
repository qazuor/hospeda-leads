import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    // getSetServerSession.tsx validates JWT_SECRET when first imported (missing, shorter than 32 chars or an example value throws), so unit tests that import it need a valid one. CI sets its own for the integration steps; this value only applies to Vitest.
    env: { JWT_SECRET: "vitest-unit-secret-0123456789abcdef0123" },
  },
});
