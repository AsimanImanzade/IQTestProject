/**
 * Age referencing — converting a measured ability into a score relative to the test-taker's own
 * age group.
 *
 * WHY THIS EXISTS. A raw ability estimate answers "how well did this person reason on these
 * items?". An IQ-scale score answers a different question: "how does this person compare with
 * others of their age?". Those come apart sharply at the ends of the lifespan — a 10-year-old and
 * a 25-year-old who answer identically have not demonstrated the same thing, and reporting them
 * as equal would be wrong. Every serious instrument (WAIS, Stanford-Binet, Raven's) therefore
 * norms by age, and that is exactly what "deviation IQ" means.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * HONESTY: WHERE THESE NUMBERS COME FROM, AND WHAT THAT COSTS
 *
 * A proper age norm is measured: you administer the test to a large, representative sample in
 * each age band and record what "average" actually looks like there. **This instrument has no
 * such sample.** The table below is therefore a MODELLED curve, shaped by the well-replicated
 * finding that fluid reasoning rises steeply through adolescence, peaks in the early twenties,
 * and declines gradually thereafter. It is an informed approximation, not a measurement of this
 * item bank.
 *
 * Two consequences follow, and both are enforced in code rather than left to good intentions:
 *
 *   1. Every result carries its `source`. While the modelled table is in use the application says
 *      so in plain language, and the unadjusted score is always reported alongside the adjusted
 *      one so nothing is hidden behind the correction.
 *   2. The table is replaceable. `EMPIRICAL_NORMS` is checked first; once enough real attempts
 *      exist in an age band (see MIN_SAMPLE_FOR_EMPIRICAL_NORM) a measured value can be dropped in
 *      and it takes precedence automatically. That is the intended destination — the modelled
 *      curve is scaffolding, not the finished building.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 */

import type { Locale } from "../i18n";

/** Below this age the bank's vocabulary and reading load make a score uninterpretable. */
export const MIN_SUPPORTED_AGE = 12;
/** Sanity bound; anything outside is treated as a data-entry error. */
export const MAX_SUPPORTED_AGE = 100;

/**
 * Below this age the result carries an extra warning: several item types (verbal analogies in
 * particular) assume adult vocabulary, so a low score may reflect reading rather than reasoning.
 */
export const AGE_CAUTION_THRESHOLD = 16;

/** Attempts needed in a band before an empirically measured norm may replace the modelled one. */
export const MIN_SAMPLE_FOR_EMPIRICAL_NORM = 100;

export interface AgeBand {
  /** Inclusive lower bound. */
  from: number;
  /** Inclusive upper bound. */
  to: number;
  /**
   * Expected ability (in logits) for a typical person in this band, relative to the peak adult
   * group which is fixed at 0. Negative means the group scores below peak-adult on average.
   */
  expectedTheta: number;
  label: string;
}

/**
 * Modelled expected ability by age.
 *
 * The reference point is ages 20–29, set to 0, because the item difficulties were designed with a
 * general adult audience in mind. Everything else is expressed as an offset from that.
 *
 * The adolescent gradient is steep and the adult decline is shallow, which is the consistent
 * shape reported for fluid/non-verbal reasoning across the literature. Magnitudes are deliberately
 * conservative: where the evidence is uncertain, a smaller correction is the safer error, because
 * an over-large one manufactures differences that were never measured.
 */
export const MODELLED_AGE_NORMS: readonly AgeBand[] = [
  { from: 12, to: 13, expectedTheta: -1.15, label: "12–13" },
  { from: 14, to: 15, expectedTheta: -0.75, label: "14–15" },
  { from: 16, to: 17, expectedTheta: -0.40, label: "16–17" },
  { from: 18, to: 19, expectedTheta: -0.15, label: "18–19" },
  { from: 20, to: 24, expectedTheta: 0.0, label: "20–24" },
  { from: 25, to: 29, expectedTheta: 0.0, label: "25–29" },
  { from: 30, to: 34, expectedTheta: -0.06, label: "30–34" },
  { from: 35, to: 39, expectedTheta: -0.14, label: "35–39" },
  { from: 40, to: 44, expectedTheta: -0.24, label: "40–44" },
  { from: 45, to: 49, expectedTheta: -0.36, label: "45–49" },
  { from: 50, to: 54, expectedTheta: -0.50, label: "50–54" },
  { from: 55, to: 59, expectedTheta: -0.66, label: "55–59" },
  { from: 60, to: 64, expectedTheta: -0.84, label: "60–64" },
  { from: 65, to: 69, expectedTheta: -1.04, label: "65–69" },
  { from: 70, to: 74, expectedTheta: -1.26, label: "70–74" },
  { from: 75, to: MAX_SUPPORTED_AGE, expectedTheta: -1.50, label: "75+" },
];

/**
 * Empirically measured norms, keyed by band label.
 *
 * Deliberately empty. Entries are added only once a band has at least
 * MIN_SAMPLE_FOR_EMPIRICAL_NORM completed attempts and the mean has been computed from them; at
 * that point this table overrides the modelled curve for that band and the reported source
 * changes accordingly. Populating it by hand with anything other than measured values would
 * defeat the entire point of separating the two tables.
 */
export const EMPIRICAL_NORMS: Readonly<Record<string, { expectedTheta: number; sampleSize: number }>> =
  {};

export type NormSource = "modelled-v1" | "empirical" | "none";

export interface AgeReference {
  /** True when an adjustment was actually applied. */
  applied: boolean;
  ageYears: number | null;
  bandLabel: string | null;
  /** The offset subtracted from the measured ability. */
  expectedTheta: number;
  source: NormSource;
  /** Set when the age is supported but young enough that vocabulary may confound the result. */
  cautionYoungAge: boolean;
}

export function isSupportedAge(age: number): boolean {
  return Number.isInteger(age) && age >= MIN_SUPPORTED_AGE && age <= MAX_SUPPORTED_AGE;
}

export function findAgeBand(age: number): AgeBand | null {
  return MODELLED_AGE_NORMS.find((band) => age >= band.from && age <= band.to) ?? null;
}

/**
 * Resolve the age reference for a given age.
 * Returns an inert reference (no adjustment) when the age is missing or out of range, so callers
 * never have to special-case it.
 */
export function resolveAgeReference(age: number | null | undefined): AgeReference {
  const inert: AgeReference = {
    applied: false,
    ageYears: age ?? null,
    bandLabel: null,
    expectedTheta: 0,
    source: "none",
    cautionYoungAge: false,
  };

  if (age === null || age === undefined || !isSupportedAge(age)) return inert;

  const band = findAgeBand(age);
  if (!band) return inert;

  const empirical = EMPIRICAL_NORMS[band.label];
  const useEmpirical =
    empirical !== undefined && empirical.sampleSize >= MIN_SAMPLE_FOR_EMPIRICAL_NORM;

  return {
    applied: true,
    ageYears: age,
    bandLabel: band.label,
    expectedTheta: useEmpirical ? empirical.expectedTheta : band.expectedTheta,
    source: useEmpirical ? "empirical" : "modelled-v1",
    cautionYoungAge: age < AGE_CAUTION_THRESHOLD,
  };
}

/**
 * Apply the age reference to a measured ability.
 *
 * Subtracting the age group's expected ability is what produces a score relative to peers: a
 * 13-year-old performing at the level of a typical adult lands well above their own age group,
 * while a 70-year-old doing the same lands above theirs by a smaller margin.
 *
 * Note that only the location is shifted, not the scale. A proper deviation score divides by the
 * age group's standard deviation too, but that dispersion has not been measured here, and
 * inventing one would add a second layer of assumption on top of the first for no gain in
 * accuracy.
 */
export function applyAgeReference(theta: number, reference: AgeReference): number {
  return reference.applied ? theta - reference.expectedTheta : theta;
}

/** Human-readable explanation shown with the result, in the requested locale. */
export function describeAgeReference(
  reference: AgeReference,
  locale: Locale = "en",
): string | null {
  if (!reference.applied) return null;

  if (locale === "az") {
    const direction =
      reference.expectedTheta < -0.02
        ? "bu qrup adətən pik yetkinlik səviyyəsindən aşağı nəticə göstərir, ona görə eyni nəticə sizi həmyaşıdlarınıza nisbətən daha yuxarı yerləşdirir"
        : reference.expectedTheta > 0.02
          ? "bu qrup adətən pik yetkinlik səviyyəsindən yuxarı nəticə göstərir"
          : "bu, şkalanın mərkəzləşdirildiyi istinad qrupudur";
    const provenance =
      reference.source === "empirical"
        ? "Bu müqayisə bu testdəki real cəhdlərdən ölçülmüş normalardan istifadə edir."
        : "Bu müqayisə bu testdə ölçülmüş normalardan yox, modelləşdirilmiş yaş əyrisindən istifadə edir — aşağıdakı qeydə baxın.";
    return `Balınız ${reference.bandLabel} yaşındakı digərlərinə nisbətən ifadə olunur, ${direction}. ${provenance}`;
  }

  const direction =
    reference.expectedTheta < -0.02
      ? "which typically scores below the peak adult range, so the same performance places you higher relative to your peers"
      : reference.expectedTheta > 0.02
        ? "which typically scores above the peak adult range"
        : "which is the reference group the scale is centred on";

  const provenance =
    reference.source === "empirical"
      ? "This comparison uses norms measured from real attempts on this test."
      : "This comparison uses a modelled age curve, not norms measured on this test — see the note below.";

  return (
    `Your score is expressed relative to others aged ${reference.bandLabel}, ${direction}. ` +
    provenance
  );
}
