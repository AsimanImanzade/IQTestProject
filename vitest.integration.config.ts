import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Integration suite: runs against a real Postgres database.
 *
 * Separate from the unit config because these tests need the environment redirected to the
 * throwaway database before any module loads, and because they must not run in parallel — they
 * truncate shared tables between tests.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
