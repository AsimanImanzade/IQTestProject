/**
 * Per-category performance.
 *
 * WHY BANDS AND NOT PER-CATEGORY IQ SCORES. A 20-item test spread over six or more categories
 * leaves two to five items per category. The standard error of an ability estimate from three
 * items is roughly 0.8 logits — about +/- 24 IQ points at 95% confidence. Printing
 * "Spatial reasoning: 112" off the back of that would be a fabrication dressed as a measurement.
 *
 * So category results are reported as three wide bands, and the band boundaries are deliberately
 * set outside the noise: a category is only called above or below average when the posterior mean
 * is far enough from zero that the label would survive the uncertainty. Everything else is
 * "Average", which is usually the truthful answer.
 */

import type { AbilityBand, CategorySlug, ScoredResponse } from "../types";
import { estimateAbility } from "./ability";

export interface CategoryResult {
  category: CategorySlug;
  theta: number;
  sem: number;
  band: AbilityBand;
  correctCount: number;
  totalCount: number;
  accuracy: number;
  meanResponseMs: number;
}

/**
 * Band thresholds on the ability scale. +/- 0.5 logits is 7.5 IQ points — comfortably inside a
 * single category's standard error, which is precisely why the band is wide and the label is
 * qualitative.
 */
const BAND_THRESHOLD = 0.5;

function bandFor(theta: number): AbilityBand {
  if (theta >= BAND_THRESHOLD) return "ABOVE_AVERAGE";
  if (theta <= -BAND_THRESHOLD) return "BELOW_AVERAGE";
  return "AVERAGE";
}

/**
 * Score each category separately.
 *
 * Each category is estimated against the same standard normal prior as the overall score. With
 * few items the posterior stays close to the prior, which is the correct behaviour: little
 * evidence should move the estimate little.
 */
export function scoreCategories(responses: readonly ScoredResponse[]): CategoryResult[] {
  const grouped = new Map<CategorySlug, ScoredResponse[]>();
  for (const response of responses) {
    const existing = grouped.get(response.category) ?? [];
    existing.push(response);
    grouped.set(response.category, existing);
  }

  const results: CategoryResult[] = [];

  for (const [category, items] of grouped) {
    const estimate = estimateAbility(
      items.map((i) => ({ parameters: i.parameters, correct: i.correct })),
    );

    const correctCount = items.filter((i) => i.correct).length;
    const totalMs = items.reduce((sum, i) => sum + i.responseMs, 0);

    results.push({
      category,
      theta: estimate.theta,
      sem: estimate.sem,
      band: bandFor(estimate.theta),
      correctCount,
      totalCount: items.length,
      accuracy: items.length === 0 ? 0 : correctCount / items.length,
      meanResponseMs: items.length === 0 ? 0 : totalMs / items.length,
    });
  }

  // Strongest first, so the results screen leads with what went well.
  return results.sort((a, b) => b.theta - a.theta);
}
