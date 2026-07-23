/**
 * Test assembly — selecting 20 questions that satisfy the blueprint.
 *
 * This is a constraint satisfaction problem, not a shuffle. The test must simultaneously hit an
 * exact difficulty profile (4/8/6/2), give each of the six core domains at least two items, keep
 * any single category to at most four, and repeat nothing. Those constraints interact: some
 * (category, difficulty band) cells are empty in the bank — odd-one-out has no very-hard items,
 * for instance — so naive per-band sampling deadlocks.
 *
 * The strategy is: satisfy the hardest constraints first (core-category minimums), then fill the
 * remaining band quota from whatever categories still have room, and verify the result against
 * the blueprint. The whole thing is wrapped in a bounded randomised retry, which is far simpler
 * than full backtracking and, with a healthy bank, succeeds on the first or second attempt.
 */

import type { CategorySlug, DifficultyBand, Rng } from "../types";
import { bandOf, CATEGORY_SLUGS } from "../types";
import {
  CORE_CATEGORIES,
  DIFFICULTY_BLUEPRINT,
  MAX_DISTINCT_CATEGORIES,
  MAX_PER_CATEGORY,
  MIN_PER_CORE_CATEGORY,
  TEST_LENGTH,
  validateBlueprint,
} from "./blueprint";

export interface SamplerCandidate {
  questionId: string;
  category: CategorySlug;
  difficulty: number;
}

export interface AssembledItem extends SamplerCandidate {
  band: DifficultyBand;
}

export interface AssembleOptions {
  /**
   * Questions this test-taker has seen recently. Honoured when the remaining pool is still large
   * enough to build a valid test; otherwise ignored, because delivering a valid test matters more
   * than perfect novelty.
   */
  exclude?: ReadonlySet<string>;
  maxAttempts?: number;
}

export class AssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssemblyError";
  }
}

type Pool = Map<DifficultyBand, Map<CategorySlug, AssembledItem[]>>;

function buildPool(candidates: readonly SamplerCandidate[]): Pool {
  const pool: Pool = new Map();
  for (const candidate of candidates) {
    const band = bandOf(candidate.difficulty);
    const byCategory = pool.get(band) ?? new Map<CategorySlug, AssembledItem[]>();
    const list = byCategory.get(candidate.category) ?? [];
    list.push({ ...candidate, band });
    byCategory.set(candidate.category, list);
    pool.set(band, byCategory);
  }
  return pool;
}

/**
 * Assemble one test.
 *
 * @throws AssemblyError when the pool cannot satisfy the blueprint — which means the bank is too
 * small or too lopsided, and is a condition the caller should surface rather than paper over.
 */
export function assembleTest(
  candidates: readonly SamplerCandidate[],
  rng: Rng,
  options: AssembleOptions = {},
): AssembledItem[] {
  const { exclude, maxAttempts = 60 } = options;

  // Prefer unseen questions, but fall back to the full pool rather than failing to build a test.
  let working = candidates;
  if (exclude && exclude.size > 0) {
    const filtered = candidates.filter((c) => !exclude.has(c.questionId));
    if (canSatisfyBlueprint(filtered)) working = filtered;
  }

  if (!canSatisfyBlueprint(working)) {
    throw new AssemblyError(
      `The question bank cannot satisfy the blueprint: ${describeShortfall(working)}`,
    );
  }

  let lastViolations = "";

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = tryAssemble(working, rng);
    if (!result) continue;

    const violations = validateBlueprint(result);
    if (violations.length === 0) return result;
    lastViolations = violations.map((v) => v.message).join("; ");
  }

  throw new AssemblyError(
    `Could not assemble a blueprint-conforming test in ${maxAttempts} attempts. ` +
      `Last violations: ${lastViolations || "none recorded"}`,
  );
}

function tryAssemble(candidates: readonly SamplerCandidate[], rng: Rng): AssembledItem[] | null {
  const pool = buildPool(candidates);
  const used = new Set<string>();
  const chosen: AssembledItem[] = [];

  const bandRemaining = new Map<DifficultyBand, number>(
    Object.entries(DIFFICULTY_BLUEPRINT) as [DifficultyBand, number][],
  );
  const categoryCount = new Map<CategorySlug, number>();

  const take = (band: DifficultyBand, category: CategorySlug): AssembledItem | null => {
    const available = (pool.get(band)?.get(category) ?? []).filter((i) => !used.has(i.questionId));
    if (available.length === 0) return null;
    const picked = rng.pick(available);
    used.add(picked.questionId);
    chosen.push(picked);
    bandRemaining.set(band, (bandRemaining.get(band) ?? 0) - 1);
    categoryCount.set(category, (categoryCount.get(category) ?? 0) + 1);
    return picked;
  };

  // --- Phase 1: guarantee the core-domain minimums --------------------------
  // Done first because these are the constraints most likely to become unsatisfiable once band
  // quota has been spent elsewhere.
  for (const category of rng.shuffle(CORE_CATEGORIES)) {
    for (let i = 0; i < MIN_PER_CORE_CATEGORY; i += 1) {
      // Prefer the band with the most remaining quota, so no band is starved for later phases.
      const bands = rng
        .shuffle([...bandRemaining.keys()])
        .filter((band) => (bandRemaining.get(band) ?? 0) > 0)
        .sort((a, b) => (bandRemaining.get(b) ?? 0) - (bandRemaining.get(a) ?? 0));

      let placed = false;
      for (const band of bands) {
        if (take(band, category)) {
          placed = true;
          break;
        }
      }
      if (!placed) return null; // this category has nothing left anywhere
    }
  }

  // --- Phase 2: fill the remaining band quota ------------------------------
  // Bands with the least available supply are filled first: leaving very-hard until last is how
  // assembly deadlocks, since few categories carry very-hard items.
  const remainingBands: DifficultyBand[] = [];
  for (const [band, count] of bandRemaining) {
    for (let i = 0; i < count; i += 1) remainingBands.push(band);
  }
  remainingBands.sort((a, b) => supplyOf(pool, a, used) - supplyOf(pool, b, used));

  // One rotating non-core category is admitted per test, so the supporting content (shape
  // rotation, odd-one-out, quantitative and the rest) is still seen across attempts without
  // fragmenting a single test across all twelve categories.
  const nonCore = CATEGORY_SLUGS.filter((c) => !CORE_CATEGORIES.includes(c));
  const guestCategory = rng.pick(nonCore);
  // Two items: the six core categories already claim 18 of 20 slots, so this is what remains.
  const GUEST_CATEGORY_ITEMS = 2;

  for (const band of remainingBands) {
    const available = (category: CategorySlug): boolean =>
      (categoryCount.get(category) ?? 0) < MAX_PER_CATEGORY &&
      (pool.get(band)?.get(category) ?? []).some((i) => !used.has(i.questionId));

    const inPlay = [...(pool.get(band)?.keys() ?? [])].filter(available);

    // CONCENTRATE, do not spread. Preference order:
    //   1. the rotating non-core category, until it has GUEST_CATEGORY_ITEMS items
    //   2. categories already in this test that are still below the cap
    //   3. anything else, only if neither of the above can supply this band
    //
    // Spreading (preferring the least-used category) is the intuitive choice and it is wrong:
    // with 20 items over 12 categories it yields one or two items each, and a two-item category
    // supports no inference at all.
    //
    // The guest slot is given FIRST refusal rather than last. The six core categories consume 18
    // of 20 slots at three each and can nearly always absorb the remainder, so a guest ranked
    // below them never actually gets in — and half the bank (shape rotation, odd one out,
    // quantitative and the rest) would never be delivered to anyone.
    const guest = inPlay.filter(
      (c) => c === guestCategory && (categoryCount.get(c) ?? 0) < GUEST_CATEGORY_ITEMS,
    );

    const alreadyUsed = rng
      .shuffle(inPlay.filter((c) => (categoryCount.get(c) ?? 0) > 0 && c !== guestCategory))
      // Among those, top up the thinnest first so nothing is left on a single item.
      .sort((a, b) => (categoryCount.get(a) ?? 0) - (categoryCount.get(b) ?? 0));

    const rest = rng
      .shuffle(inPlay.filter((c) => (categoryCount.get(c) ?? 0) === 0 && c !== guestCategory))
      .filter(() => distinctCount(categoryCount) < MAX_DISTINCT_CATEGORIES);

    let placed = false;
    for (const category of [...guest, ...alreadyUsed, ...rest]) {
      // Never exceed the distinct-category ceiling by introducing a brand new one.
      if (
        (categoryCount.get(category) ?? 0) === 0 &&
        distinctCount(categoryCount) >= MAX_DISTINCT_CATEGORIES
      ) {
        continue;
      }
      if (take(band, category)) {
        placed = true;
        break;
      }
    }
    if (!placed) return null;
  }

  return chosen.length === TEST_LENGTH ? chosen : null;
}

function distinctCount(counts: ReadonlyMap<CategorySlug, number>): number {
  let total = 0;
  for (const count of counts.values()) if (count > 0) total += 1;
  return total;
}

/** Total unused items available in a band, across all categories. */
function supplyOf(pool: Pool, band: DifficultyBand, used: ReadonlySet<string>): number {
  let total = 0;
  for (const items of pool.get(band)?.values() ?? []) {
    total += items.filter((i) => !used.has(i.questionId)).length;
  }
  return total;
}

/**
 * Cheap necessary-condition check, used to decide whether the exclusion set can be honoured and
 * to fail fast with a useful message.
 */
export function canSatisfyBlueprint(candidates: readonly SamplerCandidate[]): boolean {
  if (candidates.length < TEST_LENGTH) return false;

  const byBand = new Map<DifficultyBand, number>();
  const byCategory = new Map<CategorySlug, number>();

  for (const candidate of candidates) {
    const band = bandOf(candidate.difficulty);
    byBand.set(band, (byBand.get(band) ?? 0) + 1);
    byCategory.set(candidate.category, (byCategory.get(candidate.category) ?? 0) + 1);
  }

  for (const [band, required] of Object.entries(DIFFICULTY_BLUEPRINT) as [
    DifficultyBand,
    number,
  ][]) {
    if ((byBand.get(band) ?? 0) < required) return false;
  }

  for (const category of CORE_CATEGORIES) {
    if ((byCategory.get(category) ?? 0) < MIN_PER_CORE_CATEGORY) return false;
  }

  return true;
}

function describeShortfall(candidates: readonly SamplerCandidate[]): string {
  const problems: string[] = [];

  if (candidates.length < TEST_LENGTH) {
    problems.push(`only ${candidates.length} questions available, ${TEST_LENGTH} needed`);
  }

  const byBand = new Map<DifficultyBand, number>();
  const byCategory = new Map<CategorySlug, number>();
  for (const candidate of candidates) {
    const band = bandOf(candidate.difficulty);
    byBand.set(band, (byBand.get(band) ?? 0) + 1);
    byCategory.set(candidate.category, (byCategory.get(candidate.category) ?? 0) + 1);
  }

  for (const [band, required] of Object.entries(DIFFICULTY_BLUEPRINT) as [
    DifficultyBand,
    number,
  ][]) {
    const actual = byBand.get(band) ?? 0;
    if (actual < required) problems.push(`band "${band}" has ${actual}, needs ${required}`);
  }

  for (const category of CORE_CATEGORIES) {
    const actual = byCategory.get(category) ?? 0;
    if (actual < MIN_PER_CORE_CATEGORY) {
      problems.push(`core category "${category}" has ${actual}, needs ${MIN_PER_CORE_CATEGORY}`);
    }
  }

  return problems.join("; ") || "unknown shortfall";
}

/**
 * Shuffle the delivered order of questions and, independently, the order of each question's
 * options. The option permutation is returned so the server can map a chosen position back to the
 * canonical choice — the client never needs to know the canonical order.
 */
export function shuffleDelivery(
  items: readonly AssembledItem[],
  choiceCounts: ReadonlyMap<string, number>,
  rng: Rng,
): { questionId: string; position: number; choiceOrder: number[] }[] {
  return rng.shuffle(items).map((item, position) => {
    const count = choiceCounts.get(item.questionId) ?? 4;
    const ordinals = Array.from({ length: count }, (_, i) => i);
    return { questionId: item.questionId, position, choiceOrder: rng.shuffle(ordinals) };
  });
}
