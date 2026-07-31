import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Component tests only. The Playwright suite in ./e2e is run by `pnpm run e2e`.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
