import type { CategorySlug, Difficulty, QuestionGenerator } from "../types";
import { figuralGenerators } from "./generators/figural";
import { logicGenerators } from "./generators/logic";
import { seriesGenerators } from "./generators/series";
import { spatialGenerators } from "./generators/spatial";
import { verbalGenerators } from "./generators/verbal";

/**
 * Every generator in the system. Six modules produce twelve categories — the figural module
 * alone accounts for six of them, since matrix reasoning, pattern recognition, visual sequences,
 * figural analogies, classification and odd-one-out are the same attribute engine under
 * different rule sets.
 */
export const ALL_GENERATORS: readonly QuestionGenerator[] = [
  ...figuralGenerators,
  ...seriesGenerators,
  ...spatialGenerators,
  ...logicGenerators,
  ...verbalGenerators,
];

const BY_CATEGORY = new Map<CategorySlug, QuestionGenerator[]>();
for (const generator of ALL_GENERATORS) {
  const existing = BY_CATEGORY.get(generator.category) ?? [];
  existing.push(generator);
  BY_CATEGORY.set(generator.category, existing);
}

export function generatorsFor(category: CategorySlug): readonly QuestionGenerator[] {
  return BY_CATEGORY.get(category) ?? [];
}

/** Generators for a category that can produce the requested difficulty. */
export function generatorsForDifficulty(
  category: CategorySlug,
  difficulty: Difficulty,
): readonly QuestionGenerator[] {
  return generatorsFor(category).filter((g) => g.supportedDifficulties.includes(difficulty));
}

/** Categories that have at least one generator. Used by the seeder to plan coverage. */
export function generatableCategories(): readonly CategorySlug[] {
  return [...BY_CATEGORY.keys()];
}
