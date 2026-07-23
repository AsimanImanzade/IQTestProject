/**
 * Turning a user's score plus a reference average into a displayable comparison.
 *
 * The maths here is intentionally trivial — a difference and a direction. The value of this module
 * is that it is the single place where the comparison is framed, so the caveats travel with the
 * number and cannot be dropped by a careless caller. Anything reported from here is "indicative",
 * because the score and the reference come from different instruments (see `national-iq.ts`).
 */

import { nationalReference } from "./national-iq";
import { professionReference } from "./professions";
import { countryName } from "./countries";

export type ComparisonKind = "country" | "profession";

export interface ScoreComparison {
  kind: ComparisonKind;
  /** Display name of the group, e.g. "Azerbaijan" or "Engineering". */
  groupLabel: string;
  /** The user's score being compared. */
  userScore: number;
  /** The published reference average. */
  referenceAverage: number;
  /** userScore − referenceAverage, rounded. Positive means above the reference. */
  difference: number;
  direction: "above" | "below" | "at";
  sourceName: string;
  sourceYear?: number;
  sourceUrl?: string;
  /** The standing caveat for this kind of comparison. */
  caveat: string;
}

const COUNTRY_CAVEAT =
  "This is a light reference point, not a ranking. The national figure comes from a different " +
  "online test and a self-selected sample, so it is not on the same calibrated scale as your " +
  "score — treat the difference as rough.";

const PROFESSION_CAVEAT =
  "Historical, US-based figures — and the spread of ability within any profession is far larger " +
  "than the gap between professions. Your score says nothing about your fit for a field.";

function direction(difference: number): ScoreComparison["direction"] {
  if (difference > 0) return "above";
  if (difference < 0) return "below";
  return "at";
}

export function compareToCountry(
  userScore: number,
  countryCode: string | null | undefined,
): ScoreComparison | null {
  const reference = nationalReference(countryCode);
  if (!reference) return null;

  const difference = Math.round(userScore - reference.average);
  return {
    kind: "country",
    groupLabel: countryName(reference.code) ?? reference.code,
    userScore: Math.round(userScore),
    referenceAverage: reference.average,
    difference,
    direction: direction(difference),
    sourceName: reference.source.name,
    sourceYear: reference.source.year,
    sourceUrl: reference.source.url,
    caveat: COUNTRY_CAVEAT,
  };
}

export function compareToProfession(
  userScore: number,
  professionKey: string | null | undefined,
): ScoreComparison | null {
  const reference = professionReference(professionKey);
  if (!reference) return null;

  const difference = Math.round(userScore - reference.average);
  return {
    kind: "profession",
    groupLabel: reference.label,
    userScore: Math.round(userScore),
    referenceAverage: reference.average,
    difference,
    direction: direction(difference),
    sourceName: reference.source.name,
    caveat: PROFESSION_CAVEAT,
  };
}
