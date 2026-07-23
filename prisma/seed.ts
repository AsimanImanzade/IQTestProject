/**
 * Seed script — generates and loads the question bank.
 *
 * Run with `npm run db:seed`. It is deterministic: the same SEED_RANDOM_SEED always produces the
 * same bank, on any machine and in CI. It is also idempotent at the item level, because every
 * question carries a unique content signature — re-running tops the bank up rather than
 * duplicating it.
 *
 * The script exits non-zero if the bank fails validation, so a broken generator cannot be
 * deployed silently.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildBank } from "../src/core/generation/bank";
import { toPersistable } from "../src/core/generation/persist";
import { parametersFor } from "../src/core/psychometrics/irt";
import { CATEGORIES } from "../src/core/types";
import type { GeneratedItem } from "../src/core/types";

const SEED_COUNT = Number(process.env.SEED_COUNT ?? 600);
const RANDOM_SEED = process.env.SEED_RANDOM_SEED ?? "20260722";

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env, then run `npm run db:up`.",
    );
  }
  return url;
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: requireDatabaseUrl() });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log(`\nGenerating ${SEED_COUNT} items (seed "${RANDOM_SEED}")…`);
    const started = Date.now();

    const bank = buildBank({ targetCount: SEED_COUNT, seed: RANDOM_SEED });
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    console.log(`Generated ${bank.items.length} valid items in ${elapsed}s.\n`);
    reportBank(bank);

    if (bank.items.length === 0) {
      throw new Error("No items were generated — refusing to seed an empty bank.");
    }

    // --- categories -------------------------------------------------------
    console.log("Upserting categories…");
    for (const category of CATEGORIES) {
      await prisma.category.upsert({
        where: { slug: category.slug },
        create: {
          slug: category.slug,
          name: category.name,
          description: category.description,
          isCore: category.isCore,
          sortOrder: category.sortOrder,
        },
        update: {
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

    // --- questions --------------------------------------------------------
    // Skip signatures already present so re-running tops up rather than failing on the unique
    // index.
    const existing = new Set(
      (await prisma.question.findMany({ select: { signature: true } })).map((q) => q.signature),
    );
    const fresh = bank.items.filter((item) => !existing.has(item.signature));

    console.log(
      `\n${existing.size} item(s) already in the database; inserting ${fresh.length} new item(s)…`,
    );

    const BATCH = 100;
    let inserted = 0;

    for (let start = 0; start < fresh.length; start += BATCH) {
      const batch = fresh.slice(start, start + BATCH);

      await prisma.$transaction(
        batch.map((item) => {
          const categoryId = categoryIds.get(item.category);
          if (!categoryId) throw new Error(`Category not found: ${item.category}`);

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

      inserted += batch.length;
      process.stdout.write(`\r  inserted ${inserted}/${fresh.length}`);
    }

    process.stdout.write("\n");

    const total = await prisma.question.count({ where: { status: "PUBLISHED" } });
    console.log(`\nDone. The bank now holds ${total} published question(s).\n`);
  } finally {
    await prisma.$disconnect();
  }
}

function reportBank(bank: ReturnType<typeof buildBank>): void {
  const line = (label: string, value: string | number): string =>
    `  ${label.padEnd(26)} ${value}`;

  console.log("By category:");
  for (const [category, count] of Object.entries(bank.byCategory).sort()) {
    console.log(line(category, count));
  }

  console.log("\nBy difficulty:");
  for (const [difficulty, count] of Object.entries(bank.byDifficulty).sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  )) {
    console.log(line(`level ${difficulty}`, count));
  }

  const rejections = Object.entries(bank.rejectionSummary);
  if (rejections.length > 0) {
    // Rejections are normal — generators refuse ambiguous or degenerate items by design — but
    // they are printed so a generator that starts failing constantly is visible immediately.
    console.log("\nRejected during generation (retried automatically):");
    for (const [code, count] of rejections.sort()) console.log(line(code, count));
  }

  if (bank.shortfalls.length > 0) {
    console.log("\nShortfalls (could not fill the requested quota):");
    for (const s of bank.shortfalls) {
      console.log(line(`${s.category} d${s.difficulty}`, `${s.got}/${s.wanted}`));
    }
  }
}

main().catch((error: unknown) => {
  console.error("\nSeeding failed:\n", error);
  process.exitCode = 1;
});

export type { GeneratedItem };
