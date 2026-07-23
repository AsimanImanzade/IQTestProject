/**
 * Prepares the integration test database: applies migrations and seeds a small bank.
 *
 * The bank must be large enough for the blueprint sampler to succeed (every core category
 * represented in every difficulty band), so this is not a token fixture — it runs the real
 * generators, just fewer of them than production.
 */

import "dotenv/config";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildBank } from "../src/core/generation/bank";
import { toPersistable } from "../src/core/generation/persist";
import { parametersFor } from "../src/core/psychometrics/irt";
import { CATEGORIES } from "../src/core/types";

const TEST_ITEM_COUNT = Number(process.env.TEST_SEED_COUNT ?? 300);

async function main(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set — see .env.example.");
  if (url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL.");
  }

  console.log("Applying migrations to the integration database…");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    console.log(`Generating ${TEST_ITEM_COUNT} items…`);
    const bank = buildBank({ targetCount: TEST_ITEM_COUNT, seed: "integration-fixture" });

    await prisma.$executeRawUnsafe(
      `TRUNCATE questions, choices, item_statistics, attempts, attempt_items, responses,
       category_scores, categories, users, sessions CASCADE`,
    );

    for (const category of CATEGORIES) {
      await prisma.category.create({
        data: {
          slug: category.slug,
          name: category.name,
          description: category.description,
          isCore: category.isCore,
          sortOrder: category.sortOrder,
        },
      });
    }

    const categoryIds = new Map(
      (await prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [
        c.slug,
        c.id,
      ]),
    );

    for (let start = 0; start < bank.items.length; start += 100) {
      const batch = bank.items.slice(start, start + 100);
      await prisma.$transaction(
        batch.map((item) => {
          const categoryId = categoryIds.get(item.category);
          if (!categoryId) throw new Error(`Unknown category ${item.category}`);
          const params = parametersFor(item.difficulty, item.choices.length);
          const persistable = toPersistable(item);

          return prisma.question.create({
            data: {
              categoryId,
              difficulty: item.difficulty,
              irtA: params.a,
              irtB: params.b,
              irtC: params.c,
              stem: persistable.stem,
              stemI18n: persistable.stemI18n,
              svg: item.svg ?? null,
              explanation: persistable.explanation,
              explanationI18n: persistable.explanationI18n,
              locales: persistable.locales,
              estimatedSeconds: item.estimatedSeconds,
              generatorId: item.generatorId,
              seed: item.seed,
              signature: item.signature,
              status: "PUBLISHED",
              choices: {
                create: persistable.choices.map((choice) => ({
                  ordinal: choice.ordinal,
                  text: choice.text,
                  textI18n: choice.textI18n ?? undefined,
                  svg: choice.svg,
                  isCorrect: choice.isCorrect,
                  rationale: choice.rationale,
                  rationaleI18n: choice.rationaleI18n,
                })),
              },
              statistic: { create: {} },
            },
          });
        }),
      );
    }

    const total = await prisma.question.count();
    console.log(`Integration database ready with ${total} questions.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Test database setup failed:\n", error);
  process.exitCode = 1;
});
