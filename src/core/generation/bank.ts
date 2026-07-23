/**
 * Bank assembly — turns the generators into a validated, well-shaped question bank.
 *
 * The bank's difficulty distribution deliberately mirrors the test blueprint (20% easy,
 * 40% medium, 30% hard, 10% very hard). If the bank were uniform across difficulties, the
 * sampler would exhaust the medium stratum long before the others and start repeating items
 * across attempts — the shape of the bank has to match the shape of the demand.
 *
 * Scaling to 10,000+ items is purely a matter of raising `targetCount`: the generators are
 * loops, so nothing here changes.
 */

import type {
  CategorySlug,
  Difficulty,
  GeneratedItem,
  QuestionGenerator,
} from "../types";
import { createRng, deriveSeed } from "./rng";
import { generatorsForDifficulty } from "./registry";
import { CATEGORY_SLUGS } from "../types";
import { BankValidator } from "./validate";

/** Share of the bank allocated to each difficulty level, mirroring the blueprint. */
const DIFFICULTY_WEIGHTS: Record<Difficulty, number> = {
  1: 0.05, 2: 0.07, 3: 0.08, // easy    → 20%
  4: 0.13, 5: 0.14, 6: 0.13, // medium  → 40%
  7: 0.16, 8: 0.14, // hard            → 30%
  9: 0.06, 10: 0.04, // very hard      → 10%
};

export interface BankBuildOptions {
  targetCount: number;
  seed: string;
  /** Attempts allowed per item before giving up on a (category, difficulty) cell. */
  maxAttemptsPerItem?: number;
  onProgress?: (produced: number, target: number) => void;
}

export interface BankBuildResult {
  items: GeneratedItem[];
  /** Items requested but not produced, by reason. Non-empty output here is a signal, not noise. */
  rejectionSummary: Record<string, number>;
  shortfalls: { category: CategorySlug; difficulty: Difficulty; wanted: number; got: number }[];
  byCategory: Record<string, number>;
  byDifficulty: Record<string, number>;
}

/**
 * Distribute `total` across `keys` proportionally to `weights`, using largest-remainder
 * apportionment so the parts sum to exactly `total` rather than drifting through rounding.
 */
function apportion<K extends string | number>(
  total: number,
  keys: readonly K[],
  weight: (key: K) => number,
): Map<K, number> {
  const weights = keys.map((key) => Math.max(0, weight(key)));
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const result = new Map<K, number>();

  if (weightSum <= 0) {
    for (const key of keys) result.set(key, 0);
    return result;
  }

  const exact = keys.map((key, i) => (total * (weights[i] ?? 0)) / weightSum);
  const floors = exact.map((v) => Math.floor(v));
  let remaining = total - floors.reduce((s, v) => s + v, 0);

  const order = keys
    .map((key, i) => ({ key, i, remainder: exact[i]! - floors[i]! }))
    .sort((a, b) => b.remainder - a.remainder);

  const counts = [...floors];
  for (const entry of order) {
    if (remaining <= 0) break;
    counts[entry.i] = (counts[entry.i] ?? 0) + 1;
    remaining -= 1;
  }

  keys.forEach((key, i) => result.set(key, counts[i] ?? 0));
  return result;
}

const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function buildBank(options: BankBuildOptions): BankBuildResult {
  const { targetCount, seed, maxAttemptsPerItem = 40, onProgress } = options;

  const validator = new BankValidator();
  const items: GeneratedItem[] = [];
  const shortfalls: BankBuildResult["shortfalls"] = [];

  const perDifficulty = apportion(targetCount, DIFFICULTIES, (d) => DIFFICULTY_WEIGHTS[d]);

  for (const difficulty of DIFFICULTIES) {
    const wantedForDifficulty = perDifficulty.get(difficulty) ?? 0;
    if (wantedForDifficulty === 0) continue;

    // Only categories with a generator that reaches this difficulty can take a share of it.
    const eligible = CATEGORY_SLUGS.filter(
      (category) => generatorsForDifficulty(category, difficulty).length > 0,
    );
    if (eligible.length === 0) continue;

    const perCategory = apportion(wantedForDifficulty, eligible, () => 1);

    for (const category of eligible) {
      const wanted = perCategory.get(category) ?? 0;
      if (wanted === 0) continue;

      const generators = generatorsForDifficulty(category, difficulty);
      let produced = 0;

      for (let index = 0; index < wanted; index += 1) {
        const item = tryGenerate(
          generators,
          category,
          difficulty,
          seed,
          index,
          maxAttemptsPerItem,
          validator,
        );
        if (item) {
          items.push(item);
          produced += 1;
          onProgress?.(items.length, targetCount);
        }
      }

      if (produced < wanted) {
        shortfalls.push({ category, difficulty, wanted, got: produced });
      }
    }
  }

  const byCategory: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    byDifficulty[item.difficulty] = (byDifficulty[item.difficulty] ?? 0) + 1;
  }

  return {
    items,
    rejectionSummary: validator.rejectionSummary,
    shortfalls,
    byCategory,
    byDifficulty,
  };
}

/**
 * Produce one valid item, retrying with fresh seeds.
 *
 * Generators legitimately return null: a rotation rule can land on a symmetric shape, an
 * odd-one-out set can come out ambiguous, a syllogism can have two valid conclusions. Those are
 * *correct* refusals, and retrying is the intended response.
 */
function tryGenerate(
  generators: readonly QuestionGenerator[],
  category: CategorySlug,
  difficulty: Difficulty,
  bankSeed: string,
  index: number,
  maxAttempts: number,
  validator: BankValidator,
): GeneratedItem | null {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // Rotate through the category's generators so a category with several variants gets a mix.
    const generator = generators[(index + attempt) % generators.length];
    if (!generator) return null;

    const itemSeed = deriveSeed(bankSeed, category, difficulty, index, attempt);
    const rng = createRng(itemSeed);

    let candidate: GeneratedItem | null = null;
    try {
      candidate = generator.generate(rng, difficulty);
    } catch (error) {
      // A throwing generator is a bug, not a refusal — surface it rather than silently retrying.
      throw new Error(
        `Generator ${generator.id} threw on seed ${itemSeed}: ${(error as Error).message}`,
        { cause: error },
      );
    }

    if (!candidate) continue;

    const item: GeneratedItem = { ...candidate, seed: itemSeed };
    const result = validator.accept(item);
    if (result.valid) return item;
  }

  return null;
}
