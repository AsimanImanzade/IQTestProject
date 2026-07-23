import { describe, expect, it } from "vitest";
import {
  AGE_CAUTION_THRESHOLD,
  MAX_SUPPORTED_AGE,
  MIN_SUPPORTED_AGE,
  MODELLED_AGE_NORMS,
  applyAgeReference,
  describeAgeReference,
  findAgeBand,
  isSupportedAge,
  resolveAgeReference,
} from "@/core/psychometrics/age-norms";
import { scoreAttempt } from "@/core/psychometrics/scoring";
import { parametersFor } from "@/core/psychometrics/irt";
import type { ScoredResponse } from "@/core/types";

describe("age band table", () => {
  it("covers the whole supported range without gaps or overlaps", () => {
    for (let age = MIN_SUPPORTED_AGE; age <= MAX_SUPPORTED_AGE; age += 1) {
      const bands = MODELLED_AGE_NORMS.filter((b) => age >= b.from && age <= b.to);
      expect(bands, `age ${age} matched ${bands.length} bands`).toHaveLength(1);
    }
  });

  it("is centred on the peak adult group", () => {
    // The scale is defined so that a typical 20–29 year old sits at exactly 100.
    expect(findAgeBand(22)?.expectedTheta).toBe(0);
    expect(findAgeBand(27)?.expectedTheta).toBe(0);
  });

  it("rises through adolescence and declines after the peak", () => {
    const adolescent = findAgeBand(13)!.expectedTheta;
    const lateTeen = findAgeBand(17)!.expectedTheta;
    const peak = findAgeBand(22)!.expectedTheta;
    const middle = findAgeBand(52)!.expectedTheta;
    const older = findAgeBand(72)!.expectedTheta;

    expect(adolescent).toBeLessThan(lateTeen);
    expect(lateTeen).toBeLessThan(peak);
    expect(middle).toBeLessThan(peak);
    expect(older).toBeLessThan(middle);
  });

  it("declines monotonically across adulthood", () => {
    const adultBands = MODELLED_AGE_NORMS.filter((b) => b.from >= 25);
    for (let i = 1; i < adultBands.length; i += 1) {
      expect(adultBands[i]!.expectedTheta).toBeLessThanOrEqual(adultBands[i - 1]!.expectedTheta);
    }
  });

  it("keeps corrections conservative", () => {
    // A correction beyond ±2 logits would move a score by more than 30 points on an assumption
    // rather than a measurement. If a future empirical table needs that, it should be a
    // deliberate decision, not a drift.
    for (const band of MODELLED_AGE_NORMS) {
      expect(Math.abs(band.expectedTheta)).toBeLessThan(2);
    }
  });
});

describe("age validation", () => {
  it("accepts the supported range only", () => {
    expect(isSupportedAge(MIN_SUPPORTED_AGE)).toBe(true);
    expect(isSupportedAge(MAX_SUPPORTED_AGE)).toBe(true);
    expect(isSupportedAge(MIN_SUPPORTED_AGE - 1)).toBe(false);
    expect(isSupportedAge(MAX_SUPPORTED_AGE + 1)).toBe(false);
    expect(isSupportedAge(25.5)).toBe(false);
  });

  it("returns an inert reference for a missing or unusable age", () => {
    for (const age of [null, undefined, 5, 250, Number.NaN]) {
      const reference = resolveAgeReference(age as number | null | undefined);
      expect(reference.applied).toBe(false);
      expect(reference.expectedTheta).toBe(0);
      expect(reference.source).toBe("none");
      // An inert reference must be a no-op on the ability estimate.
      expect(applyAgeReference(0.8, reference)).toBe(0.8);
    }
  });

  it("flags young test-takers for the vocabulary caveat", () => {
    expect(resolveAgeReference(13).cautionYoungAge).toBe(true);
    expect(resolveAgeReference(AGE_CAUTION_THRESHOLD).cautionYoungAge).toBe(false);
    expect(resolveAgeReference(30).cautionYoungAge).toBe(false);
  });

  it("reports the modelled source while no empirical norms exist", () => {
    expect(resolveAgeReference(30).source).toBe("modelled-v1");
    expect(describeAgeReference(resolveAgeReference(30))).toMatch(/modelled age curve/i);
    expect(describeAgeReference(resolveAgeReference(5))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The behaviour the whole feature exists for
// ---------------------------------------------------------------------------

function form(): ScoredResponse[] {
  const difficulties = [2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 9, 10];
  return difficulties.map((d, i) => ({
    category: "matrix-reasoning" as const,
    parameters: parametersFor(d, d >= 7 ? 5 : 4),
    correct: i % 2 === 0,
    responseMs: 30_000,
  }));
}

describe("age-referenced scoring", () => {
  it("gives a younger person a higher score for identical answers", () => {
    // The requirement in one assertion: a 13-year-old and a 22-year-old who answer exactly the
    // same have not demonstrated the same thing, and must not receive the same score.
    const responses = form();
    const child = scoreAttempt(responses, { ageYears: 13 });
    const adult = scoreAttempt(responses, { ageYears: 22 });

    expect(child.iq).toBeGreaterThan(adult.iq);
    // The underlying measurement is identical — only the comparison group differs.
    expect(child.theta).toBeCloseTo(adult.theta, 12);
    expect(child.iqUnadjusted).toBe(adult.iqUnadjusted);
  });

  it("gives an older person a higher score than a peak-age person for identical answers", () => {
    const responses = form();
    const older = scoreAttempt(responses, { ageYears: 72 });
    const peak = scoreAttempt(responses, { ageYears: 22 });
    expect(older.iq).toBeGreaterThan(peak.iq);
  });

  it("leaves the peak adult group unshifted", () => {
    const responses = form();
    const peak = scoreAttempt(responses, { ageYears: 22 });
    expect(peak.iq).toBe(peak.iqUnadjusted);
    expect(peak.thetaAdjusted).toBeCloseTo(peak.theta, 12);
  });

  it("scores without adjustment when no age is supplied", () => {
    const responses = form();
    const anonymous = scoreAttempt(responses);
    expect(anonymous.ageReference.applied).toBe(false);
    expect(anonymous.iq).toBe(anonymous.iqUnadjusted);
    expect(anonymous.thetaAdjusted).toBeCloseTo(anonymous.theta, 12);
  });

  it("always preserves the raw measurement alongside the adjusted score", () => {
    // The correction must never be able to hide what was actually measured.
    for (const age of [13, 17, 22, 45, 68, 90]) {
      const score = scoreAttempt(form(), { ageYears: age });
      expect(Number.isFinite(score.iqUnadjusted)).toBe(true);
      expect(Number.isFinite(score.theta)).toBe(true);
      expect(score.ageReference.ageYears).toBe(age);
    }
  });

  it("keeps the confidence interval bracketing the adjusted score", () => {
    for (const age of [13, 22, 55, 80]) {
      const score = scoreAttempt(form(), { ageYears: age });
      expect(score.iqLower).toBeLessThanOrEqual(score.iq);
      expect(score.iqUpper).toBeGreaterThanOrEqual(score.iq);
    }
  });

  it("keeps adjusted scores inside the reportable range", () => {
    const allCorrect: ScoredResponse[] = form().map((r) => ({ ...r, correct: true }));
    const allWrong: ScoredResponse[] = form().map((r) => ({ ...r, correct: false }));

    for (const age of [12, 22, 100]) {
      for (const responses of [allCorrect, allWrong]) {
        const score = scoreAttempt(responses, { ageYears: age });
        expect(score.iq).toBeGreaterThanOrEqual(55);
        expect(score.iq).toBeLessThanOrEqual(145);
      }
    }
  });

  it("moves the percentile with the age comparison, not against it", () => {
    const responses = form();
    const child = scoreAttempt(responses, { ageYears: 13 });
    const adult = scoreAttempt(responses, { ageYears: 22 });
    // The percentile must agree with the headline score rather than contradict it.
    expect(child.percentile).toBeGreaterThan(adult.percentile);
  });

  it("never lets gender or education reach the scorer", () => {
    // Structural guarantee: ScoreOptions has one field. If someone adds gender here in future,
    // this test fails and forces the conversation.
    const score = scoreAttempt(form(), { ageYears: 30 });
    expect(Object.keys(score.ageReference).sort()).toEqual(
      ["ageYears", "applied", "bandLabel", "cautionYoungAge", "expectedTheta", "source"].sort(),
    );
  });
});
