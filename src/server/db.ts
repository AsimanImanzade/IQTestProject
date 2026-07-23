import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma client.
 *
 * Prisma 7 constructs the client with a driver adapter rather than a connection string in the
 * schema. `@prisma/adapter-pg` wraps a node-postgres pool, so connection pooling happens there.
 *
 * THE CLIENT IS CREATED LAZILY, and that is load-bearing rather than a micro-optimisation.
 * `next build` imports every API route module to collect page data, so anything constructed at
 * module scope runs at build time. Building a Docker image happens without a database — there is
 * no DATABASE_URL and no server to reach — so eager construction fails the build with
 * "DATABASE_URL is not set" even though the running container would have been configured
 * correctly. Deferring construction to first use means the build only needs the code to *import*,
 * and a missing URL is reported when a request actually needs the database.
 */
function createPrismaClient(connectionString?: string): PrismaClient {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and start the database with `npm run db:up`.",
    );
  }

  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * In development Next.js hot-reloads modules on every edit. Without caching the client on
 * globalThis each reload would open a new connection pool and Postgres would run out of
 * connections within a few minutes.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * A proxy so call sites keep the familiar `prisma.user.findMany()` shape while construction stays
 * deferred. Functions are bound to the real client: Prisma's internals rely on `this`, and an
 * unbound method would lose it.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, property) {
    return Reflect.has(getClient(), property);
  },
});

/** Build an isolated client — used by the integration suite against its own database. */
export function createTestPrismaClient(connectionString: string): PrismaClient {
  return createPrismaClient(connectionString);
}
