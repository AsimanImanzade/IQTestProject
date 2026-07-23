import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 moved CLI configuration out of package.json's `prisma` block into this file.
 * It is where the schema path, migration output and seed command now live.
 *
 * Note: `.env` is NOT loaded automatically by Prisma 7 — the `dotenv/config` import above
 * is required.
 *
 * We read DATABASE_URL via `process.env` with an empty fallback rather than Prisma's `env()`
 * helper: `env()` throws when the variable is missing, which would break `prisma generate`
 * during the Docker image build, where no database URL exists yet. Commands that actually
 * talk to a database (migrate/seed) still fail loudly on an empty URL.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
