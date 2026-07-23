/**
 * Shared answer-choice assembly.
 *
 * Distractor quality is the difference between a real reasoning item and a trivia question. A
 * distractor is only useful if a test-taker who made a *specific, nameable* reasoning error would
 * arrive at it — "applied the row rule but ignored the column rule", "rotated the correct number
 * of degrees but in the mirror direction". Randomly perturbed options are rejected on sight by
 * anyone paying attention and carry almost no psychometric information.
 *
 * Every helper here therefore takes candidate distractors paired with the error model that
 * produced them, and enforces the two invariants the validator later re-checks: exactly one
 * correct option, and no two options with identical content.
 */

import type { GeneratedChoice, LocalizedString, Rng } from "../types";

export interface DistractorCandidate<T> {
  value: T;
  /** The reasoning error that leads here. Surfaced in the post-test review, in both languages. */
  rationale: LocalizedString;
}

export interface BuildChoicesOptions<T> {
  rng: Rng;
  correct: T;
  correctRationale: LocalizedString;
  /** Tried in order; the first ones are the most psychometrically valuable. */
  candidates: readonly DistractorCandidate<T>[];
  /** Total number of options including the correct one. */
  optionCount: number;
  /** Maps a value to a stable key used for uniqueness comparison. */
  keyOf: (value: T) => string;
  /** Renders a value into the choice payload. Text is localized; SVG is language-neutral. */
  render: (value: T) => { text?: LocalizedString; svg?: string };
  /**
   * Last-resort generator used when the supplied candidates do not yield enough *distinct*
   * options. Returning null gives up, which aborts the item — better a discarded item than one
   * with duplicate or missing options.
   */
  fallback?: (attempt: number) => DistractorCandidate<T> | null;
}

/**
 * Assemble a shuffled, de-duplicated option list.
 * Returns null when enough distinct options could not be produced, signalling the caller to
 * retry with a different seed.
 */
export function buildChoices<T>(options: BuildChoicesOptions<T>): GeneratedChoice[] | null {
  const { rng, correct, correctRationale, candidates, optionCount, keyOf, render, fallback } =
    options;

  const correctKey = keyOf(correct);
  const seen = new Set<string>([correctKey]);
  const chosen: DistractorCandidate<T>[] = [];

  for (const candidate of candidates) {
    if (chosen.length >= optionCount - 1) break;
    const key = keyOf(candidate.value);
    if (seen.has(key)) continue; // collides with the answer or an earlier distractor
    seen.add(key);
    chosen.push(candidate);
  }

  // Top up from the fallback when the named error models collided with each other.
  if (chosen.length < optionCount - 1 && fallback) {
    for (let attempt = 0; attempt < 60 && chosen.length < optionCount - 1; attempt += 1) {
      const candidate = fallback(attempt);
      if (!candidate) break;
      const key = keyOf(candidate.value);
      if (seen.has(key)) continue;
      seen.add(key);
      chosen.push(candidate);
    }
  }

  if (chosen.length < optionCount - 1) return null;

  const all: GeneratedChoice[] = [
    { ...render(correct), isCorrect: true, rationale: correctRationale },
    ...chosen.map((c) => ({ ...render(c.value), isCorrect: false, rationale: c.rationale })),
  ];

  return rng.shuffle(all);
}

/**
 * Number of options for a given difficulty.
 *
 * Harder items get five options rather than four. This is deliberate psychometrics, not
 * decoration: more options lower the pseudo-guessing floor (c = 1/k, so 0.25 → 0.20), which
 * sharpens measurement exactly where the test is trying to discriminate between high abilities.
 */
export function optionCountFor(difficulty: number): 4 | 5 {
  return difficulty >= 7 ? 5 : 4;
}

/**
 * Estimated solving time in seconds, scaled by difficulty.
 * Used for the untimed-mode pacing hint and as the baseline the rapid-guessing detector compares
 * against.
 */
export function estimateSeconds(difficulty: number, base = 25): number {
  return Math.round(base + difficulty * 7);
}
