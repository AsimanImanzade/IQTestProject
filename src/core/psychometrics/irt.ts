/**
 * Item response theory — the 3-parameter logistic model.
 *
 *     P(correct | theta) = c + (1 - c) / (1 + exp(-a * (theta - b)))
 *
 *   a  discrimination — how sharply the item separates abilities either side of b
 *   b  difficulty on the ability scale
 *   c  pseudo-guessing floor — the probability a test-taker who knows nothing still answers
 *      correctly, which for a k-option multiple-choice item is 1/k
 *
 * WHY 3PL RATHER THAN 2PL: every item in this test is multiple choice, so guessing is real and
 * non-zero. A 2PL model implicitly claims someone with very low ability has a near-zero chance of
 * a correct answer, which is false when there are four options. Ignoring `c` systematically
 * over-estimates low-ability test-takers, because their lucky guesses get read as evidence of
 * ability.
 *
 * PARAMETER PROVENANCE — this matters for honesty. `b` is derived from the *designed* difficulty
 * assigned by the generator, not from response data. `a` is fixed at a neutral 1.0 for every item
 * because we have no calibration sample and inventing per-item discriminations would be
 * fabrication. The `ItemStatistic` table accumulates the exposures, p-values and point-biserial
 * correlations needed to replace both with empirically estimated values later; until then the
 * scores are model-based estimates and the application says so.
 */

import type { ItemParameters } from "../types";

/** Neutral discrimination prior. Replaced per-item once calibration data exists. */
export const DEFAULT_DISCRIMINATION = 1.0;

/**
 * Map designed difficulty (1..10) onto the ability scale.
 * The slope is chosen so the bank spans roughly ±2.5 logits — about ±37 IQ points — which covers
 * the range a 20-item test can meaningfully resolve without pretending to reach the extremes.
 */
export function difficultyToB(difficulty: number): number {
  return (difficulty - 5.5) * 0.55;
}

/** Inverse of `difficultyToB`, used when displaying a calibrated item on the authoring scale. */
export function bToDifficulty(b: number): number {
  return b / 0.55 + 5.5;
}

/** Pseudo-guessing for a k-option multiple-choice item. */
export function guessingFor(optionCount: number): number {
  if (optionCount < 2) throw new Error(`optionCount must be at least 2, received ${optionCount}`);
  return 1 / optionCount;
}

export function parametersFor(difficulty: number, optionCount: number): ItemParameters {
  return {
    a: DEFAULT_DISCRIMINATION,
    b: difficultyToB(difficulty),
    c: guessingFor(optionCount),
  };
}

/** Probability of a correct response at ability `theta`. */
export function probabilityCorrect(theta: number, params: ItemParameters): number {
  const { a, b, c } = params;
  const logit = a * (theta - b);
  // Guard against overflow at extreme abilities; exp(710) is Infinity in IEEE 754 doubles.
  const logistic = logit >= 0 ? 1 / (1 + Math.exp(-logit)) : Math.exp(logit) / (1 + Math.exp(logit));
  return c + (1 - c) * logistic;
}

/**
 * Fisher information contributed by an item at ability `theta`.
 * Used to report where the test measures precisely, and to drive adaptive item selection if the
 * test ever becomes adaptive.
 */
export function itemInformation(theta: number, params: ItemParameters): number {
  const { a, c } = params;
  const p = probabilityCorrect(theta, params);
  if (p <= c || p >= 1) return 0;
  const q = 1 - p;
  // Birnbaum's 3PL information function.
  const numerator = a * a * q * (p - c) * (p - c);
  const denominator = p * (1 - c) * (1 - c);
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Total test information at `theta` — the reciprocal of the squared standard error. */
export function testInformation(theta: number, items: readonly ItemParameters[]): number {
  return items.reduce((sum, params) => sum + itemInformation(theta, params), 0);
}

// ---------------------------------------------------------------------------
// Normal distribution helpers
// ---------------------------------------------------------------------------

/** Standard normal probability density. */
export function normalPdf(x: number, mean = 0, sd = 1): number {
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
}

/**
 * Standard normal cumulative distribution, via Abramowitz & Stegun 7.1.26 applied to erf.
 * Accurate to about 1.5e-7 — far beyond what a percentile displayed to the nearest whole number
 * requires.
 */
export function normalCdf(x: number, mean = 0, sd = 1): number {
  const z = (x - mean) / (sd * Math.SQRT2);
  return 0.5 * (1 + erf(z));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * absX);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}
