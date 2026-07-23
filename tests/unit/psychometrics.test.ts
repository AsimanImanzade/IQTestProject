import { describe, expect, it } from "vitest";
import {
  difficultyToB,
  bToDifficulty,
  guessingFor,
  itemInformation,
  normalCdf,
  parametersFor,
  probabilityCorrect,
  testInformation,
} from "@/core/psychometrics/irt";
import { estimateAbility } from "@/core/psychometrics/ability";
import {
  confidenceFor,
  detectRapidGuessing,
  reasoningLevelFor,
  scoreAttempt,
  thetaToIq,
  thetaToPercentile,
  IQ_MAX,
  IQ_MIN,
} from "@/core/psychometrics/scoring";
import { scoreCategories } from "@/core/psychometrics/categories";
import { buildInsights } from "@/core/psychometrics/insights";
import { createRng } from "@/core/generation/rng";
import type { ItemParameters, ScoredResponse } from "@/core/types";

describe("3PL model", () => {
  it("returns the guessing floor far below the item difficulty", () => {
    const params: ItemParameters = { a: 1, b: 0, c: 0.25 };
    // The approach to c is asymptotic, not fast: at theta = -6 the logistic still contributes
    // 0.0019, so P is 0.2519. Only well beyond that does it collapse onto c.
    expect(probabilityCorrect(-20, params)).toBeCloseTo(0.25, 6);
    expect(probabilityCorrect(-6, params)).toBeGreaterThan(0.25);
    expect(probabilityCorrect(-6, params)).toBeLessThan(0.26);
  });

  it("approaches 1 far above the item difficulty", () => {
    const params: ItemParameters = { a: 1, b: 0, c: 0.25 };
    expect(probabilityCorrect(6, params)).toBeGreaterThan(0.99);
  });

  it("returns the midpoint between c and 1 at theta = b", () => {
    // A hand-computable checkpoint: the logistic is exactly 0.5 when theta equals b,
    // so P = c + (1 - c) * 0.5 = 0.625 for c = 0.25.
    const params: ItemParameters = { a: 1.4, b: 0.7, c: 0.25 };
    expect(probabilityCorrect(0.7, params)).toBeCloseTo(0.625, 10);
  });

  it("is strictly increasing in ability", () => {
    const params: ItemParameters = { a: 1.2, b: 0.3, c: 0.2 };
    let previous = -Infinity;
    for (let theta = -4; theta <= 4; theta += 0.1) {
      const p = probabilityCorrect(theta, params);
      expect(p).toBeGreaterThan(previous);
      previous = p;
    }
  });

  it("never returns a probability outside [c, 1]", () => {
    const params: ItemParameters = { a: 2.5, b: -1, c: 0.2 };
    for (let theta = -20; theta <= 20; theta += 0.5) {
      const p = probabilityCorrect(theta, params);
      expect(p).toBeGreaterThanOrEqual(params.c);
      expect(p).toBeLessThanOrEqual(1);
      expect(Number.isFinite(p)).toBe(true);
    }
  });

  it("does not overflow at extreme abilities", () => {
    // exp(710) is Infinity in IEEE 754 doubles; the implementation must branch to avoid it.
    const params: ItemParameters = { a: 3, b: 0, c: 0.25 };
    expect(Number.isFinite(probabilityCorrect(1e6, params))).toBe(true);
    expect(Number.isFinite(probabilityCorrect(-1e6, params))).toBe(true);
  });

  it("peaks item information near the item difficulty", () => {
    const params: ItemParameters = { a: 1.5, b: 1.0, c: 0.2 };
    const atB = itemInformation(1.0, params);
    expect(atB).toBeGreaterThan(itemInformation(-2, params));
    expect(atB).toBeGreaterThan(itemInformation(3.5, params));
  });

  it("sums information across a test", () => {
    const items: ItemParameters[] = [
      { a: 1, b: -1, c: 0.25 },
      { a: 1, b: 0, c: 0.25 },
      { a: 1, b: 1, c: 0.25 },
    ];
    const total = testInformation(0, items);
    const manual = items.reduce((s, p) => s + itemInformation(0, p), 0);
    expect(total).toBeCloseTo(manual, 12);
  });
});

describe("difficulty mapping", () => {
  it("centres the scale and round-trips", () => {
    expect(difficultyToB(5.5)).toBeCloseTo(0, 12);
    for (let d = 1; d <= 10; d += 1) {
      expect(bToDifficulty(difficultyToB(d))).toBeCloseTo(d, 10);
    }
  });

  it("spans roughly +/- 2.5 logits across the authoring scale", () => {
    expect(difficultyToB(1)).toBeCloseTo(-2.475, 3);
    expect(difficultyToB(10)).toBeCloseTo(2.475, 3);
  });

  it("derives the guessing floor from the option count", () => {
    expect(guessingFor(4)).toBeCloseTo(0.25, 12);
    expect(guessingFor(5)).toBeCloseTo(0.2, 12);
    expect(() => guessingFor(1)).toThrow();
    // Five options genuinely lower the floor — the reason hard items get an extra option.
    expect(parametersFor(8, 5).c).toBeLessThan(parametersFor(3, 4).c);
  });
});

describe("normal CDF", () => {
  it("matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1)).toBeCloseTo(0.8413447, 5);
    expect(normalCdf(-1)).toBeCloseTo(0.1586553, 5);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
  });
});

// ---------------------------------------------------------------------------
// EAP estimation
// ---------------------------------------------------------------------------

function testForm(): ItemParameters[] {
  // A 20-item form matching the blueprint's difficulty profile.
  const difficulties = [2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 9, 10];
  return difficulties.map((d) => parametersFor(d, d >= 7 ? 5 : 4));
}

describe("EAP ability estimation", () => {
  it("returns the prior when there are no responses", () => {
    const estimate = estimateAbility([]);
    expect(estimate.theta).toBeCloseTo(0, 6);
    expect(estimate.sem).toBeCloseTo(1, 2);
  });

  it("stays finite for an all-correct pattern", () => {
    // This is the case that makes maximum likelihood diverge to +infinity, and the reason the
    // estimator is Bayesian.
    const responses = testForm().map((parameters) => ({ parameters, correct: true }));
    const estimate = estimateAbility(responses);
    expect(Number.isFinite(estimate.theta)).toBe(true);
    expect(Number.isFinite(estimate.sem)).toBe(true);
    expect(estimate.theta).toBeGreaterThan(1);
    expect(estimate.theta).toBeLessThan(4);
  });

  it("stays finite for an all-incorrect pattern", () => {
    const responses = testForm().map((parameters) => ({ parameters, correct: false }));
    const estimate = estimateAbility(responses);
    expect(Number.isFinite(estimate.theta)).toBe(true);
    expect(estimate.theta).toBeLessThan(-0.5);
    expect(estimate.theta).toBeGreaterThan(-4);
  });

  it("is monotonic: more correct answers never lower the estimate", () => {
    const form = testForm();
    let previous = -Infinity;
    for (let correctCount = 0; correctCount <= form.length; correctCount += 1) {
      const responses = form.map((parameters, i) => ({
        parameters,
        correct: i < correctCount,
      }));
      const { theta } = estimateAbility(responses);
      expect(theta).toBeGreaterThan(previous);
      previous = theta;
    }
  });

  it("rewards reaching further up the difficulty ladder", () => {
    // This is what "harder questions contribute more" means under IRT. It is not an additive
    // points bonus: it is that answering correctly further up the difficulty ordering places
    // your ability higher. Each step below adds strictly harder items to the correct set.
    const sorted = [...testForm()].sort((a, b) => a.b - b.b);

    let previousTheta = -Infinity;
    let previousHardest = -Infinity;

    for (const reach of [4, 8, 12, 16]) {
      const pattern = sorted.map((parameters, i) => ({ parameters, correct: i < reach }));
      const theta = estimateAbility(pattern).theta;
      const hardestAnswered = sorted[reach - 1]!.b;

      expect(hardestAnswered).toBeGreaterThan(previousHardest);
      expect(theta).toBeGreaterThan(previousTheta);

      previousTheta = theta;
      previousHardest = hardestAnswered;
    }
  });

  it("treats an aberrant pattern as guessing rather than brilliance", () => {
    // Someone who fails every easy item but passes hard ones has not demonstrated high ability:
    // under a 3PL model those hard successes are well explained by guessing (P approaches c),
    // while the easy failures are very improbable at any competent ability. The estimator must
    // therefore rate this pattern BELOW a conventional one with the same raw score — which is
    // also what stops the test being gamed by deliberately skipping easy items.
    const sorted = [...testForm()].sort((a, b) => a.b - b.b);

    const conventional = sorted.map((parameters, i) => ({ parameters, correct: i < 8 }));
    const aberrant = sorted.map((parameters, i) => ({
      parameters,
      correct: i >= sorted.length - 8,
    }));

    const conventionalEstimate = estimateAbility(conventional);
    const aberrantEstimate = estimateAbility(aberrant);

    expect(aberrantEstimate.theta).toBeLessThan(conventionalEstimate.theta);
    // And the model must be less certain about the odd pattern, not more.
    expect(aberrantEstimate.sem).toBeGreaterThan(conventionalEstimate.sem);
  });

  it("recovers a known ability from simulated responses", () => {
    // The central validity check: simulate response patterns from a known true ability using the
    // model itself, then confirm the estimator recovers it. Averaged over many replications the
    // bias must be small; EAP shrinks towards the prior, so a tolerance is expected at the tails.
    const form = testForm();

    for (const trueTheta of [-1.5, -0.75, 0, 0.75, 1.5]) {
      const rng = createRng(`recovery:${trueTheta}`);
      const estimates: number[] = [];

      for (let replication = 0; replication < 400; replication += 1) {
        const responses = form.map((parameters) => ({
          parameters,
          correct: rng.next() < probabilityCorrect(trueTheta, parameters),
        }));
        estimates.push(estimateAbility(responses).theta);
      }

      const mean = estimates.reduce((s, v) => s + v, 0) / estimates.length;
      // Shrinkage towards 0 grows with |trueTheta|, so allow proportionally more room there.
      const tolerance = 0.25 + 0.25 * Math.abs(trueTheta);
      expect(Math.abs(mean - trueTheta)).toBeLessThan(tolerance);

      // Shrinkage must be towards the prior, never away from it.
      if (trueTheta > 0) expect(mean).toBeLessThan(trueTheta + 0.15);
      if (trueTheta < 0) expect(mean).toBeGreaterThan(trueTheta - 0.15);
    }
  });

  it("produces a standard error consistent with the empirical spread", () => {
    const form = testForm();
    const rng = createRng("sem-check");
    const estimates: number[] = [];
    const reportedSems: number[] = [];

    for (let replication = 0; replication < 500; replication += 1) {
      const responses = form.map((parameters) => ({
        parameters,
        correct: rng.next() < probabilityCorrect(0, parameters),
      }));
      const estimate = estimateAbility(responses);
      estimates.push(estimate.theta);
      reportedSems.push(estimate.sem);
    }

    const mean = estimates.reduce((s, v) => s + v, 0) / estimates.length;
    const empiricalSd = Math.sqrt(
      estimates.reduce((s, v) => s + (v - mean) ** 2, 0) / estimates.length,
    );
    const meanSem = reportedSems.reduce((s, v) => s + v, 0) / reportedSems.length;

    // The reported standard error should be in the same ballpark as the actual spread of
    // estimates; a wildly optimistic SEM would make every confidence interval a lie.
    expect(meanSem).toBeGreaterThan(empiricalSd * 0.6);
    expect(meanSem).toBeLessThan(empiricalSd * 1.7);
  });

  it("becomes more precise as the test gets longer", () => {
    const form = testForm();
    const short = form.slice(0, 5).map((parameters) => ({ parameters, correct: true }));
    const long = form.map((parameters) => ({ parameters, correct: true }));
    expect(estimateAbility(long).sem).toBeLessThan(estimateAbility(short).sem);
  });
});

// ---------------------------------------------------------------------------
// Score reporting
// ---------------------------------------------------------------------------

function makeResponses(
  pattern: readonly boolean[],
  responseMs = 30_000,
): ScoredResponse[] {
  const form = testForm();
  return pattern.map((correct, i) => ({
    category: (i % 2 === 0 ? "matrix-reasoning" : "number-series") as ScoredResponse["category"],
    parameters: form[i] ?? { a: 1, b: 0, c: 0.25 },
    correct,
    responseMs,
  }));
}

describe("score reporting", () => {
  it("maps ability onto the IQ scale", () => {
    expect(thetaToIq(0)).toBeCloseTo(100, 10);
    expect(thetaToIq(1)).toBeCloseTo(115, 10);
    expect(thetaToIq(-2)).toBeCloseTo(70, 10);
  });

  it("clamps the reported score to what a 20-item test can resolve", () => {
    const allCorrect = scoreAttempt(makeResponses(Array(20).fill(true)));
    const allWrong = scoreAttempt(makeResponses(Array(20).fill(false)));

    expect(allCorrect.iq).toBeLessThanOrEqual(IQ_MAX);
    expect(allWrong.iq).toBeGreaterThanOrEqual(IQ_MIN);
    expect(allCorrect.iq).toBeGreaterThan(allWrong.iq);
  });

  it("always reports an interval that contains the point estimate", () => {
    for (let correct = 0; correct <= 20; correct += 1) {
      const pattern = Array.from({ length: 20 }, (_, i) => i < correct);
      const score = scoreAttempt(makeResponses(pattern));
      expect(score.iqLower).toBeLessThanOrEqual(score.iq);
      expect(score.iqUpper).toBeGreaterThanOrEqual(score.iq);
    }
  });

  it("never reports a percentile of exactly 0 or 100", () => {
    expect(thetaToPercentile(-9)).toBeGreaterThan(0);
    expect(thetaToPercentile(9)).toBeLessThan(100);
    expect(thetaToPercentile(0)).toBeCloseTo(50, 1);
  });

  it("grades confidence by the standard error", () => {
    expect(confidenceFor(0.2, false)).toBe("HIGH");
    expect(confidenceFor(0.4, false)).toBe("MODERATE");
    expect(confidenceFor(0.7, false)).toBe("LOW");
  });

  it("caps confidence at LOW when rapid guessing is detected", () => {
    // However precise the arithmetic looks, a click-through response pattern is not a measurement.
    expect(confidenceFor(0.1, true)).toBe("LOW");
  });

  it("assigns reasoning levels across the range", () => {
    expect(reasoningLevelFor(135)).toBe("Very High");
    expect(reasoningLevelFor(100)).toBe("Average");
    expect(reasoningLevelFor(72)).toBe("Well Below Average");
  });

  it("computes accuracy and mean response time", () => {
    const pattern = Array.from({ length: 20 }, (_, i) => i < 12);
    const score = scoreAttempt(makeResponses(pattern, 20_000));
    expect(score.correctCount).toBe(12);
    expect(score.totalCount).toBe(20);
    expect(score.accuracy).toBeCloseTo(0.6, 10);
    expect(score.meanResponseMs).toBeCloseTo(20_000, 6);
  });
});

describe("rapid guessing detection", () => {
  it("flags a click-through pattern", () => {
    const signal = detectRapidGuessing(makeResponses(Array(20).fill(false), 800));
    expect(signal.detected).toBe(true);
    expect(signal.medianResponseMs).toBe(800);
  });

  it("does not flag genuine engagement", () => {
    const signal = detectRapidGuessing(makeResponses(Array(20).fill(true), 45_000));
    expect(signal.detected).toBe(false);
    expect(signal.rapidProportion).toBe(0);
  });

  it("flags a partially rushed attempt", () => {
    const responses = makeResponses(Array(20).fill(true), 40_000);
    // 40% of items answered in under three seconds.
    for (let i = 0; i < 8; i += 1) {
      const response = responses[i];
      if (response) response.responseMs = 900;
    }
    expect(detectRapidGuessing(responses).detected).toBe(true);
  });
});

describe("category scoring", () => {
  it("reports a band per category and orders strongest first", () => {
    const responses = makeResponses(Array.from({ length: 20 }, (_, i) => i % 2 === 0));
    const results = scoreCategories(responses);

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(["BELOW_AVERAGE", "AVERAGE", "ABOVE_AVERAGE"]).toContain(result.band);
      expect(result.totalCount).toBeGreaterThan(0);
    }
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i - 1]!.theta).toBeGreaterThanOrEqual(results[i]!.theta);
    }
  });

  it("stays near the prior when a category has very few items", () => {
    // Two items cannot justify a strong claim, so the posterior must remain close to average.
    const responses: ScoredResponse[] = [
      {
        category: "spatial-reasoning",
        parameters: parametersFor(5, 4),
        correct: true,
        responseMs: 30_000,
      },
      {
        category: "spatial-reasoning",
        parameters: parametersFor(5, 4),
        correct: true,
        responseMs: 30_000,
      },
    ];
    const [result] = scoreCategories(responses);
    expect(result).toBeDefined();
    expect(Math.abs(result!.theta)).toBeLessThan(1.2);
  });
});

describe("insights", () => {
  it("refuses to characterise categories with too few items", () => {
    const responses = makeResponses(Array(20).fill(true));
    const score = scoreAttempt(responses);
    const categories = scoreCategories(responses);
    const insights = buildInsights(score, categories, responses);

    // Every claim must name a category that actually had at least three items.
    const thinCategories = categories.filter((c) => c.totalCount < 3).map((c) => c.category);
    for (const claim of [...insights.strengths, ...insights.weaknesses]) {
      for (const thin of thinCategories) {
        expect(claim.toLowerCase()).not.toContain(thin.replace("-", " "));
      }
    }
  });

  it("adds a caveat and a retake recommendation when rapid guessing is detected", () => {
    const responses = makeResponses(Array(20).fill(false), 600);
    const score = scoreAttempt(responses);
    const insights = buildInsights(score, scoreCategories(responses), responses);

    expect(insights.caveats.join(" ")).toMatch(/quickly/i);
    expect(insights.recommendations.join(" ")).toMatch(/retake/i);
  });

  it("breaks results down by difficulty band, totalling the whole test", () => {
    const responses = makeResponses(Array.from({ length: 20 }, (_, i) => i < 10));
    const score = scoreAttempt(responses);
    const insights = buildInsights(score, scoreCategories(responses), responses);

    const total = insights.difficultyBreakdown.reduce((s, b) => s + b.totalCount, 0);
    expect(total).toBe(20);
    expect(insights.difficultyBreakdown.map((b) => b.band)).toEqual([
      "easy",
      "medium",
      "hard",
      "very-hard",
    ]);
  });

  it("always produces at least one recommendation", () => {
    for (const correct of [0, 5, 10, 15, 20]) {
      const responses = makeResponses(Array.from({ length: 20 }, (_, i) => i < correct));
      const score = scoreAttempt(responses);
      const insights = buildInsights(score, scoreCategories(responses), responses);
      expect(insights.recommendations.length).toBeGreaterThan(0);
    }
  });
});
