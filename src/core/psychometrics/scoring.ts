/**
 * Turning an ability estimate into the numbers shown to a test-taker.
 *
 * THE HONESTY CONSTRAINT, IN CODE. The theta -> IQ conversion below assumes ability is standard
 * normal in the population, which is the definition of the IQ scale (mean 100, SD 15). That
 * assumption is a *model*, not an empirical finding: no standardisation sample has been collected
 * for this item bank, and the item difficulties are designed rather than calibrated. The number
 * this module produces is therefore an estimate of performance against this bank, expressed on a
 * familiar scale — not a normed IQ.
 *
 * Three deliberate design choices follow from that, and none of them should be removed to make
 * the output look more confident:
 *   1. the score is clamped to [55, 145], because a 20-item test cannot resolve the tails
 *   2. a confidence interval is computed alongside every point estimate and the UI shows both
 *   3. rapid-guessing downgrades the reported confidence rather than being silently ignored
 */

import type { ConfidenceLevel, ScoredResponse } from "../types";
import type { AbilityEstimate } from "./ability";
import { estimateAbilityFromResponses } from "./ability";
import { normalCdf } from "./irt";
import type { AgeReference } from "./age-norms";
import { applyAgeReference, resolveAgeReference } from "./age-norms";

/** The IQ scale: mean 100, standard deviation 15. */
export const IQ_MEAN = 100;
export const IQ_SD = 15;

/**
 * Reporting bounds. A 20-item instrument has a standard error around 0.35 logits at best, so
 * claiming to distinguish an IQ of 150 from 160 would be indefensible. Scores are reported as
 * "145 or above" / "55 or below" outside this range.
 */
export const IQ_MIN = 55;
export const IQ_MAX = 145;

/** z for a two-sided 95% interval. */
const Z_95 = 1.959963985;

export interface RapidGuessingSignal {
  detected: boolean;
  /** Proportion of items answered implausibly fast. */
  rapidProportion: number;
  medianResponseMs: number;
}

export interface TestScore {
  /** Ability as measured, before age referencing. */
  theta: number;
  /** Ability after age referencing. Equals `theta` when no age is known. */
  thetaAdjusted: number;
  sem: number;
  reliability: number;

  /** Reported score, derived from the age-referenced ability. */
  iq: number;
  /** Score before age referencing — always reported alongside, never hidden. */
  iqUnadjusted: number;
  iqLower: number;
  iqUpper: number;
  /** True when the point estimate hit a reporting bound. */
  clamped: boolean;

  ageReference: AgeReference;

  percentile: number;
  confidence: ConfidenceLevel;
  reasoningLevel: string;

  correctCount: number;
  totalCount: number;
  accuracy: number;
  meanResponseMs: number;

  rapidGuessing: RapidGuessingSignal;
}

function clampIq(value: number): { iq: number; clamped: boolean } {
  const rounded = Math.round(value);
  if (rounded < IQ_MIN) return { iq: IQ_MIN, clamped: true };
  if (rounded > IQ_MAX) return { iq: IQ_MAX, clamped: true };
  return { iq: rounded, clamped: false };
}

export function thetaToIq(theta: number): number {
  return IQ_MEAN + IQ_SD * theta;
}

export function iqToTheta(iq: number): number {
  return (iq - IQ_MEAN) / IQ_SD;
}

/** Percentile of an ability, as a percentage of the modelled population below it. */
export function thetaToPercentile(theta: number): number {
  const raw = normalCdf(theta) * 100;
  // Never report 0 or 100: both imply certainty the instrument cannot support.
  return Math.min(99.9, Math.max(0.1, raw));
}

/**
 * Detect rapid guessing.
 *
 * Someone clicking through without reading produces response times far below the time needed to
 * even parse an item. Their score is not an ability estimate at all, so the result is annotated
 * and its confidence downgraded rather than presented as a measurement.
 */
export function detectRapidGuessing(responses: readonly ScoredResponse[]): RapidGuessingSignal {
  const times = responses.map((r) => r.responseMs).filter((t) => t > 0);
  if (times.length === 0) {
    return { detected: false, rapidProportion: 0, medianResponseMs: 0 };
  }

  const sorted = [...times].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);

  // 3 seconds is below the time needed to read even the shortest stem and scan four options.
  const rapidCount = times.filter((t) => t < 3000).length;
  const rapidProportion = rapidCount / times.length;

  const detected = median < 2000 || rapidProportion > 0.3;
  return { detected, rapidProportion, medianResponseMs: median };
}

/**
 * Confidence in the estimate, driven by the standard error.
 *
 * The thresholds correspond to roughly +/- 8 and +/- 13 IQ points at 95%. Rapid guessing caps
 * confidence at LOW regardless of the standard error, because in that case the model fits a
 * response process that was never really about ability.
 */
export function confidenceFor(sem: number, rapidGuessing: boolean): ConfidenceLevel {
  if (rapidGuessing) return "LOW";
  if (sem < 0.3) return "HIGH";
  if (sem <= 0.45) return "MODERATE";
  return "LOW";
}

/** Qualitative band shown alongside the score. Bands are wide on purpose. */
export function reasoningLevelFor(iq: number): string {
  if (iq >= 130) return "Very High";
  if (iq >= 120) return "High";
  if (iq >= 110) return "Above Average";
  if (iq >= 90) return "Average";
  if (iq >= 80) return "Below Average";
  return "Well Below Average";
}

export interface ScoreOptions {
  /** Age at the time of the attempt. Omit or pass null to score without age referencing. */
  ageYears?: number | null;
}

/** Score a completed attempt. */
export function scoreAttempt(
  responses: readonly ScoredResponse[],
  options: ScoreOptions = {},
): TestScore {
  const estimate: AbilityEstimate = estimateAbilityFromResponses(responses);
  const rapidGuessing = detectRapidGuessing(responses);

  // Age referencing shifts the ability estimate before it becomes a score. The measurement
  // itself is untouched — `theta` and `iqUnadjusted` preserve what was actually observed.
  const ageReference = resolveAgeReference(options.ageYears);
  const thetaAdjusted = applyAgeReference(estimate.theta, ageReference);

  const { iq, clamped } = clampIq(thetaToIq(thetaAdjusted));
  const unadjusted = clampIq(thetaToIq(estimate.theta));

  // The interval is computed on the ability scale and then converted, so it stays symmetric in
  // the units the model actually works in. It is built around the adjusted ability because that
  // is what the reported score represents; the standard error itself is unchanged by the shift.
  const marginTheta = Z_95 * estimate.sem;
  const lower = clampIq(thetaToIq(thetaAdjusted - marginTheta));
  const upper = clampIq(thetaToIq(thetaAdjusted + marginTheta));

  const correctCount = responses.filter((r) => r.correct).length;
  const totalCount = responses.length;
  const totalMs = responses.reduce((sum, r) => sum + r.responseMs, 0);

  return {
    theta: estimate.theta,
    thetaAdjusted,
    sem: estimate.sem,
    reliability: estimate.reliability,

    iq,
    iqUnadjusted: unadjusted.iq,
    iqLower: lower.iq,
    iqUpper: upper.iq,
    clamped,

    ageReference,

    // The percentile answers "compared with whom?" — the same age group the score is referenced
    // to. Computing it from the unadjusted ability would contradict the headline number.
    percentile: thetaToPercentile(thetaAdjusted),
    confidence: confidenceFor(estimate.sem, rapidGuessing.detected),
    reasoningLevel: reasoningLevelFor(iq),

    correctCount,
    totalCount,
    accuracy: totalCount === 0 ? 0 : correctCount / totalCount,
    meanResponseMs: totalCount === 0 ? 0 : totalMs / totalCount,

    rapidGuessing,
  };
}
