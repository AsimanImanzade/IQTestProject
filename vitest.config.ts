import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // The integration suite needs a database and its own environment bootstrap; it runs from
    // vitest.integration.config.ts. Without this exclusion the unit run picks it up and fails at
    // import time.
    exclude: ["tests/integration/**"],
    fileParallelism: true,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
