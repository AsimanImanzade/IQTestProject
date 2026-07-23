/**
 * Shared domain types for the pure core.
 *
 * ARCHITECTURAL RULE: nothing under `src/core/**` may import from `next`, `react`, or the
 * generated Prisma client. The core is plain TypeScript over plain data, which is what makes
 * the scoring engine and every question generator unit-testable without a database or a browser.
 */

import type { LocalizedString } from "./i18n";

export type { LocalizedString };

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const CATEGORY_SLUGS = [
  "number-series",
  "matrix-reasoning",
  "pattern-recognition",
  "visual-sequences",
  "shape-rotation",
  "spatial-reasoning",
  "deductive-logic",
  "logical-reasoning",
  "analogies",
  "classification",
  "odd-one-out",
  "quantitative-reasoning",
] as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export interface CategoryDefinition {
  slug: CategorySlug;
  name: string;
  description: string;
  /**
   * The six domains the spec requires every test to represent ("no category should dominate").
   * The blueprint guarantees each core domain appears at least twice.
   */
  isCore: boolean;
  sortOrder: number;
}

export const CATEGORIES: readonly CategoryDefinition[] = [
  {
    slug: "matrix-reasoning",
    name: "Matrix Reasoning",
    description:
      "Infer the rules governing a 3x3 grid of figures and determine the missing cell.",
    isCore: true,
    sortOrder: 1,
  },
  {
    slug: "number-series",
    name: "Number Series",
    description: "Identify the rule generating a numeric sequence and continue it.",
    isCore: true,
    sortOrder: 2,
  },
  {
    slug: "pattern-recognition",
    name: "Pattern Recognition",
    description: "Detect the transformation cycle running through a sequence of figures.",
    isCore: true,
    sortOrder: 3,
  },
  {
    slug: "logical-reasoning",
    name: "Logical Reasoning",
    description: "Draw the conclusion that necessarily follows from the given constraints.",
    isCore: true,
    sortOrder: 4,
  },
  {
    slug: "spatial-reasoning",
    name: "Spatial Reasoning",
    description: "Reason about folding, unfolding and assembling objects in space.",
    isCore: true,
    sortOrder: 5,
  },
  {
    slug: "analogies",
    name: "Analogies",
    description: "Map the relationship in one pair onto another pair.",
    isCore: true,
    sortOrder: 6,
  },
  {
    slug: "visual-sequences",
    name: "Visual Sequences",
    description: "Continue a progression of figures that changes along one or more attributes.",
    isCore: false,
    sortOrder: 7,
  },
  {
    slug: "shape-rotation",
    name: "Shape Rotation",
    description: "Recognise a shape after rotation, and distinguish it from its mirror image.",
    isCore: false,
    sortOrder: 8,
  },
  {
    slug: "deductive-logic",
    name: "Deductive Logic",
    description: "Solve ordering, truth-telling and syllogistic puzzles with a unique solution.",
    isCore: false,
    sortOrder: 9,
  },
  {
    slug: "classification",
    name: "Classification",
    description: "Determine which item belongs to, or violates, a defined class.",
    isCore: false,
    sortOrder: 10,
  },
  {
    slug: "odd-one-out",
    name: "Odd One Out",
    description: "Find the single item that fails to share the property common to the rest.",
    isCore: false,
    sortOrder: 11,
  },
  {
    slug: "quantitative-reasoning",
    name: "Quantitative Reasoning",
    description: "Apply proportional, rate and algebraic reasoning to word problems.",
    isCore: false,
    sortOrder: 12,
  },
] as const;

export const CORE_CATEGORY_SLUGS: readonly CategorySlug[] = CATEGORIES.filter(
  (c) => c.isCore,
).map((c) => c.slug);

const CATEGORY_BY_SLUG = new Map<CategorySlug, CategoryDefinition>(
  CATEGORIES.map((c) => [c.slug, c]),
);

export function getCategory(slug: CategorySlug): CategoryDefinition {
  const found = CATEGORY_BY_SLUG.get(slug);
  if (!found) throw new Error(`Unknown category slug: ${slug}`);
  return found;
}

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

/** Designed difficulty on the authoring scale, 1 (easiest) .. 10 (hardest). */
export type Difficulty = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const DIFFICULTY_BANDS = ["easy", "medium", "hard", "very-hard"] as const;
export type DifficultyBand = (typeof DIFFICULTY_BANDS)[number];

/** Band boundaries are inclusive on both ends. */
export const BAND_RANGES: Record<DifficultyBand, readonly [number, number]> = {
  easy: [1, 3],
  medium: [4, 6],
  hard: [7, 8],
  "very-hard": [9, 10],
};

export function bandOf(difficulty: number): DifficultyBand {
  for (const band of DIFFICULTY_BANDS) {
    const [lo, hi] = BAND_RANGES[band];
    if (difficulty >= lo && difficulty <= hi) return band;
  }
  throw new Error(`Difficulty out of range 1..10: ${difficulty}`);
}

export function isDifficulty(value: number): value is Difficulty {
  return Number.isInteger(value) && value >= 1 && value <= 10;
}

/** Clamp any computed difficulty into the valid authoring range. */
export function toDifficulty(value: number): Difficulty {
  const rounded = Math.round(value);
  const clamped = Math.min(10, Math.max(1, rounded));
  return clamped as Difficulty;
}

// ---------------------------------------------------------------------------
// Generated items
// ---------------------------------------------------------------------------

export interface GeneratedChoice {
  /** Text content, for verbal/numeric items. Exactly one of text/svg must be present. */
  text?: LocalizedString;
  /** Inline SVG, for figural items. Language-neutral, so a plain string. */
  svg?: string;
  isCorrect: boolean;
  /**
   * Why a test-taker might pick this. For distractors this names the error model that produced
   * it (e.g. "applied the row rule but ignored the column rule"), which the review screen shows.
   */
  rationale: LocalizedString;
}

export interface GeneratedItem {
  category: CategorySlug;
  difficulty: Difficulty;
  stem: LocalizedString;
  /** Inline SVG for the question figure, when the item is visual. Language-neutral. */
  svg?: string;
  choices: GeneratedChoice[];
  explanation: LocalizedString;
  estimatedSeconds: number;
  /** Identifies the generator + variant that produced this item. */
  generatorId: string;
  /** The RNG seed this item was produced from; makes it exactly reproducible. */
  seed: string;
  /**
   * Canonical hash of the item's semantic content, used to guarantee the bank contains no
   * duplicates even across separate seed runs.
   */
  signature: string;
}

/**
 * A generator produces one item from a seeded RNG, or returns null when the sampled parameters
 * do not yield a well-formed item (e.g. an odd-one-out set that turned out ambiguous). Returning
 * null is normal and simply causes the caller to retry with the next seed.
 */
export interface QuestionGenerator {
  /** Stable identifier, recorded on every item it produces. */
  id: string;
  category: CategorySlug;
  /**
   * Difficulty levels this generator can produce. The seeder asks for a specific level so the
   * bank can be filled to the blueprint's shape rather than whatever the generators felt like.
   */
  supportedDifficulties: readonly Difficulty[];
  generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null;
}

// ---------------------------------------------------------------------------
// RNG contract (implementation in core/generation/rng.ts)
// ---------------------------------------------------------------------------

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniform element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** `count` distinct elements, in random order. Throws if count exceeds the array length. */
  sample<T>(items: readonly T[], count: number): T[];
  /** A new array containing the same elements in random order. */
  shuffle<T>(items: readonly T[]): T[];
  /** True with probability p. */
  chance(p: number): boolean;
}

// ---------------------------------------------------------------------------
// Item response theory
// ---------------------------------------------------------------------------

/** 3PL item parameters. */
export interface ItemParameters {
  /** Discrimination — how sharply the item separates ability levels around b. */
  a: number;
  /** Difficulty on the ability (theta) scale. */
  b: number;
  /** Pseudo-guessing asymptote; for k-option multiple choice this is 1/k. */
  c: number;
}

/** One scored response, as consumed by the ability estimator. */
export interface ScoredResponse {
  category: CategorySlug;
  parameters: ItemParameters;
  correct: boolean;
  responseMs: number;
}

export const CONFIDENCE_LEVELS = ["LOW", "MODERATE", "HIGH"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const ABILITY_BANDS = ["BELOW_AVERAGE", "AVERAGE", "ABOVE_AVERAGE"] as const;
export type AbilityBand = (typeof ABILITY_BANDS)[number];
