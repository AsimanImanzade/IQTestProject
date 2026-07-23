/**
 * Integration test environment.
 *
 * Runs before any test module is imported, so that `src/server/db.ts` — which reads
 * DATABASE_URL at module load to build its connection pool — points at the throwaway integration
 * database rather than the development one. The suite truncates tables between tests, so pointing
 * it at the wrong database would destroy the seeded bank.
 */

import "dotenv/config";

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Copy .env.example to .env — the integration suite needs a " +
      "database it is allowed to truncate.",
  );
}

if (testUrl === process.env.DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL must not equal DATABASE_URL. The integration suite truncates tables and " +
      "would wipe your development bank.",
  );
}

process.env.DATABASE_URL = testUrl;
// NODE_ENV is set to "test" by Vitest itself and is typed read-only by Next's env definitions,
// so it must not be assigned here.
process.env.SESSION_SECRET ??= "integration-test-secret-value-at-least-32-chars";
