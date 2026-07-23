/**
 * Published national average-IQ estimates, used only to give a signed-in user a rough reference
 * point for "how does my score compare with my country?".
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE TRUSTING THESE NUMBERS.
 *
 * These figures are EXTERNAL, PUBLISHED estimates — they are not measured by this application and
 * they are not on the same calibrated scale as the score this app produces. Three specific
 * limitations, all surfaced to the user in the UI:
 *
 *   1. DIFFERENT INSTRUMENT. A national average from another test cannot be subtracted from our
 *      score with any rigour. The comparison is indicative, not exact. We deliberately chose the
 *      International IQ Test (IIT) aggregate as the source precisely because it, like this app, is
 *      an online self-selected test centred near 100 — making it the *least* mismatched reference
 *      available, not a rigorous one.
 *   2. SELF-SELECTED SAMPLES. The source figures come from whoever chose to take an online test in
 *      each country — not a representative national sample. So does our own user base. Neither is
 *      "the IQ of a nation".
 *   3. DISPUTED FIELD. National-IQ comparison is scientifically contested and has a history of
 *      misuse. The app frames this as a light-hearted personal reference, never as a ranking or a
 *      statement about any group of people.
 *
 * Numbers are stored as whole integers on purpose: the underlying estimates carry nothing like
 * decimal precision, and showing "98.03" would imply certainty that does not exist.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Source: International IQ Test (IIT) country aggregate, 2025, as compiled by World Population
 * Review — https://worldpopulationreview.com/country-rankings/average-iq-by-country
 */

export const NATIONAL_IQ_SOURCE = {
  name: "International IQ Test (online aggregate)",
  year: 2025,
  url: "https://worldpopulationreview.com/country-rankings/average-iq-by-country",
} as const;

/** ISO 3166-1 alpha-2 → rounded published average. */
export const NATIONAL_IQ: Readonly<Record<string, number>> = {
  AZ: 98,
  AM: 100,
  GE: 100,
  TR: 97,
  RU: 104,
  IR: 105,
  IQ: 94,
  KZ: 96,
  KG: 94,
  TJ: 93,
  DE: 99,
  GB: 102,
  US: 101,
  CA: 102,
  FR: 100,
  IT: 100,
  ES: 102,
  NL: 100,
  BE: 100,
  CH: 101,
  AT: 100,
  SE: 98,
  NO: 98,
  DK: 98,
  FI: 100,
  PL: 99,
  UA: 96,
  RO: 99,
  GR: 100,
  PT: 100,
  IE: 98,
  CZ: 99,
  HU: 100,
  SA: 94,
  AE: 97,
  EG: 97,
  IL: 99,
  PK: 97,
  BD: 97,
  IN: 98,
  ID: 90,
  VN: 102,
  TH: 100,
  PH: 96,
  MY: 99,
  JP: 106,
  CN: 106,
  KR: 107,
  TW: 106,
  SG: 104,
  HK: 108,
  MX: 94,
  BR: 95,
  AR: 97,
  AU: 104,
  NZ: 102,
  ZA: 94,
  NG: 93,
  MA: 97,
  DZ: 98,
};

export interface NationalReference {
  code: string;
  average: number;
  source: typeof NATIONAL_IQ_SOURCE;
}

/** Look up the reference figure for a country, or null when we hold none. */
export function nationalReference(code: string | null | undefined): NationalReference | null {
  if (!code) return null;
  const average = NATIONAL_IQ[code];
  if (average === undefined) return null;
  return { code, average, source: NATIONAL_IQ_SOURCE };
}
