import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    // e2e/ roda via Playwright (npm run test:e2e), nao vitest.
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
