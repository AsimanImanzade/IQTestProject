/**
 * The test blueprint — the fixed specification every assembled test must satisfy.
 *
 * A blueprint is what separates a test from a pile of random questions. Without one, two people
 * taking "the same" test could receive wildly different difficulty mixes, and their scores would
 * not be comparable even though both are expressed on the same scale. Fixing the difficulty
 * profile means the only thing that varies between test-takers is *which* items they see, not
 * *how hard* the test was.
 */

import type { CategorySlug, DifficultyBand } from "../types";
import { CORE_CATEGORY_SLUGS } from "../types";

export const TEST_LENGTH = 20;

/**
 * Difficulty profile: 4 easy, 8 medium, 6 hard, 2 very hard.
 *
 * The distribution is centre-weighted because that is where a fixed-length test measures best.
 * Test information peaks near an item's difficulty, so concentrating items in the middle
 * maximises precision for the majority of test-takers, while the tails keep the test able to
 * distinguish at the extremes.
 */
export const DIFFICULTY_BLUEPRINT: Readonly<Record<DifficultyBand, number>> = {
  easy: 4,
  medium: 8,
  hard: 6,
  "very-hard": 2,
};

/** Minimum distinct categories in any single test. */
export const MIN_DISTINCT_CATEGORIES = 6;

/**
 * Maximum distinct categories in any single test.
 *
 * This bound is as important as the minimum, and less obvious. There are twelve categories and
 * only twenty items: spreading across all twelve leaves one or two items per category, which
 * cannot support *any* per-category statement — the results page would be reduced to reporting
 * "too few questions to comment" for every domain. Capping the spread is what makes the category
 * feedback meaningful.
 */
export const MAX_DISTINCT_CATEGORIES = 8;

/** No single category may exceed this share of the test — "no category should dominate". */
export const MAX_PER_CATEGORY = 4;

/**
 * Any category that appears at all must appear at least this many times.
 *
 * A category represented by a single item contributes a coin-flip to the results page and can
 * only ever be reported as "too few questions to comment on" — it costs a slot and buys nothing.
 * Better to drop it and give that slot to a category already in the test.
 */
export const MIN_PER_PRESENT_CATEGORY = 2;

/**
 * Each of the six core domains must appear at least this many times.
 *
 * Three, not two, for a measurement reason: the insights engine will not characterise a category
 * from fewer than three items, so a minimum of two would guarantee that some core domains were
 * delivered but never reportable.
 */
export const MIN_PER_CORE_CATEGORY = 3;

export const CORE_CATEGORIES: readonly CategorySlug[] = CORE_CATEGORY_SLUGS;

export interface BlueprintViolation {
  code:
    | "wrong-length"
    | "difficulty-mismatch"
    | "too-few-categories"
    | "too-many-categories"
    | "category-dominates"
    | "category-too-thin"
    | "core-category-missing"
    | "duplicate-question";
  message: string;
}

export interface BlueprintCandidate {
  questionId: string;
  category: CategorySlug;
  band: DifficultyBand;
}

/**
 * Check an assembled test against the blueprint.
 * Used by the sampler to verify its own output and by the test suite to assert the invariants
 * hold across many random draws.
 */
export function validateBlueprint(items: readonly BlueprintCandidate[]): BlueprintViolation[] {
  const violations: BlueprintViolation[] = [];

  if (items.length !== TEST_LENGTH) {
    violations.push({
      code: "wrong-length",
      message: `Test has ${items.length} items; the blueprint requires ${TEST_LENGTH}.`,
    });
  }

  const ids = items.map((i) => i.questionId);
  if (new Set(ids).size !== ids.length) {
    violations.push({
      code: "duplicate-question",
      message: "The same question appears more than once in a single test.",
    });
  }

  const byBand = new Map<DifficultyBand, number>();
  for (const item of items) byBand.set(item.band, (byBand.get(item.band) ?? 0) + 1);

  for (const [band, required] of Object.entries(DIFFICULTY_BLUEPRINT) as [
    DifficultyBand,
    number,
  ][]) {
    const actual = byBand.get(band) ?? 0;
    if (actual !== required) {
      violations.push({
        code: "difficulty-mismatch",
        message: `Band "${band}" has ${actual} items; the blueprint requires ${required}.`,
      });
    }
  }

  const byCategory = new Map<CategorySlug, number>();
  for (const item of items) byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + 1);

  if (byCategory.size < MIN_DISTINCT_CATEGORIES) {
    violations.push({
      code: "too-few-categories",
      message: `Test spans ${byCategory.size} categories; at least ${MIN_DISTINCT_CATEGORIES} are required.`,
    });
  }

  if (byCategory.size > MAX_DISTINCT_CATEGORIES) {
    violations.push({
      code: "too-many-categories",
      message:
        `Test spans ${byCategory.size} categories; at most ${MAX_DISTINCT_CATEGORIES} are allowed, ` +
        `otherwise each is measured by too few items to report on.`,
    });
  }

  for (const [category, count] of byCategory) {
    if (count > MAX_PER_CATEGORY) {
      violations.push({
        code: "category-dominates",
        message: `Category "${category}" contributes ${count} items; the maximum is ${MAX_PER_CATEGORY}.`,
      });
    }
    if (count < MIN_PER_PRESENT_CATEGORY) {
      violations.push({
        code: "category-too-thin",
        message:
          `Category "${category}" contributes only ${count} item(s); a category that appears must ` +
          `contribute at least ${MIN_PER_PRESENT_CATEGORY} to be reportable.`,
      });
    }
  }

  for (const category of CORE_CATEGORIES) {
    const count = byCategory.get(category) ?? 0;
    if (count < MIN_PER_CORE_CATEGORY) {
      violations.push({
        code: "core-category-missing",
        message: `Core category "${category}" contributes ${count} items; at least ${MIN_PER_CORE_CATEGORY} are required.`,
      });
    }
  }

  return violations;
}

/**
 * Sanity check on the blueprint constants themselves. Called by the test suite so that editing
 * the numbers above cannot quietly produce an unsatisfiable specification.
 */
export function blueprintIsSatisfiable(): boolean {
  const total = Object.values(DIFFICULTY_BLUEPRINT).reduce((s, n) => s + n, 0);
  if (total !== TEST_LENGTH) return false;

  // The six core categories claim 18 of the 20 slots at minimum.
  if (CORE_CATEGORIES.length * MIN_PER_CORE_CATEGORY > TEST_LENGTH) return false;

  // Those minimums must also be reachable without breaching the per-category ceiling.
  if (MIN_PER_CORE_CATEGORY > MAX_PER_CATEGORY) return false;

  // The core categories alone must not already exceed the distinct-category ceiling.
  if (CORE_CATEGORIES.length > MAX_DISTINCT_CATEGORIES) return false;
  if (MIN_DISTINCT_CATEGORIES > MAX_DISTINCT_CATEGORIES) return false;

  // The ceiling must leave room for every slot to be filled.
  if (MAX_DISTINCT_CATEGORIES * MAX_PER_CATEGORY < TEST_LENGTH) return false;

  return true;
}
