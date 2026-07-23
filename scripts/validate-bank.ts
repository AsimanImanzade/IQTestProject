/**
 * Generates the bank in memory and validates it, without touching the database.
 *
 * This is the CI gate: if a generator regresses and starts emitting ambiguous items, duplicate
 * options or unanswerable figures, the build fails here rather than shipping a broken assessment.
 *
 * Run with `npm run bank:validate`.
 */

import { buildBank } from "../src/core/generation/bank";
import { validateItem } from "../src/core/generation/validate";
import { ALL_GENERATORS } from "../src/core/generation/registry";
import { CATEGORY_SLUGS } from "../src/core/types";

const TARGET = Number(process.env.SEED_COUNT ?? 600);
const SEED = process.env.SEED_RANDOM_SEED ?? "20260722";

/** Fraction of requested items we must actually produce before the bank is considered healthy. */
const MIN_YIELD = 0.95;

function main(): void {
  console.log(`Validating a ${TARGET}-item bank (seed "${SEED}")…\n`);

  const started = Date.now();
  const bank = buildBank({ targetCount: TARGET, seed: SEED });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const failures: string[] = [];

  // 1. Every item must pass validation individually. buildBank already filtered, so anything
  //    failing here means the validator and the builder disagree — a real bug.
  for (const item of bank.items) {
    const result = validateItem(item);
    if (!result.valid) {
      failures.push(
        `${item.generatorId} (${item.signature}): ${result.issues.map((i) => i.code).join(", ")}`,
      );
    }
  }

  // 2. Signatures must be unique across the whole bank.
  const signatures = new Set<string>();
  for (const item of bank.items) {
    if (signatures.has(item.signature)) {
      failures.push(`Duplicate signature ${item.signature} from ${item.generatorId}`);
    }
    signatures.add(item.signature);
  }

  // 3. Yield check — a generator silently refusing everything would otherwise show up only as a
  //    quietly smaller bank.
  const yieldRate = bank.items.length / TARGET;
  if (yieldRate < MIN_YIELD) {
    failures.push(
      `Only ${bank.items.length}/${TARGET} items produced (${(yieldRate * 100).toFixed(1)}%), ` +
        `below the ${(MIN_YIELD * 100).toFixed(0)}% floor.`,
    );
  }

  // 4. Every category must be represented, or a test can't be assembled to blueprint.
  for (const category of CATEGORY_SLUGS) {
    const count = bank.byCategory[category] ?? 0;
    if (count === 0) failures.push(`Category "${category}" produced no items.`);
  }

  // 5. Every registered generator must contribute something.
  const producedBy = new Set(bank.items.map((i) => i.generatorId));
  for (const generator of ALL_GENERATORS) {
    if (!producedBy.has(generator.id)) {
      failures.push(`Generator "${generator.id}" produced no items at all.`);
    }
  }

  // --- report -------------------------------------------------------------
  console.log(`Produced ${bank.items.length}/${TARGET} items in ${elapsed}s\n`);

  console.log("By category:");
  for (const category of CATEGORY_SLUGS) {
    const count = bank.byCategory[category] ?? 0;
    const bar = "#".repeat(Math.round(count / 2));
    console.log(`  ${category.padEnd(24)} ${String(count).padStart(4)}  ${bar}`);
  }

  console.log("\nBy difficulty:");
  for (let d = 1; d <= 10; d += 1) {
    const count = bank.byDifficulty[d] ?? 0;
    const bar = "#".repeat(Math.round(count / 2));
    console.log(`  level ${String(d).padStart(2)}${" ".repeat(17)}${String(count).padStart(4)}  ${bar}`);
  }

  console.log("\nBy generator:");
  const perGenerator = new Map<string, number>();
  for (const item of bank.items) {
    perGenerator.set(item.generatorId, (perGenerator.get(item.generatorId) ?? 0) + 1);
  }
  for (const generator of ALL_GENERATORS) {
    console.log(
      `  ${generator.id.padEnd(24)} ${String(perGenerator.get(generator.id) ?? 0).padStart(4)}`,
    );
  }

  const withFigures = bank.items.filter((i) => i.svg).length;
  console.log(
    `\nItems with figures: ${withFigures}/${bank.items.length} ` +
      `(${((withFigures / bank.items.length) * 100).toFixed(0)}%)`,
  );

  const rejections = Object.entries(bank.rejectionSummary);
  if (rejections.length > 0) {
    console.log("\nRejected and retried during generation:");
    for (const [code, count] of rejections.sort()) {
      console.log(`  ${code.padEnd(24)} ${String(count).padStart(4)}`);
    }
  }

  if (bank.shortfalls.length > 0) {
    console.log("\nShortfalls:");
    for (const s of bank.shortfalls) {
      console.log(`  ${s.category} d${s.difficulty}: ${s.got}/${s.wanted}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} validation failure(s):\n`);
    for (const failure of failures.slice(0, 40)) console.error(`  - ${failure}`);
    if (failures.length > 40) console.error(`  … and ${failures.length - 40} more`);
    process.exit(1);
  }

  console.log("\nBank validation passed.\n");
}

main();
