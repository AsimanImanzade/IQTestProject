/**
 * Occupational reference figures, used to give a signed-in user a rough "how does my score
 * compare with my field?" reference.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * THESE FIGURES ARE WEAKER THAN THE NATIONAL ONES — TREAT THEM AS A CURIOSITY.
 *
 *   1. OLD AND US-CENTRIC. The occupational hierarchy traces to Harrell & Harrell (1945), who
 *      sorted US Army servicemen by their pre-war civilian jobs and reported each group's mean on
 *      the Army General Classification Test, later expressed as an IQ-equivalent, supplemented by
 *      later Wonderlic occupational aggregates. It reflects a specific time, place and workforce.
 *   2. WITHIN ≫ BETWEEN. The single most important fact about this data, and stated to the user:
 *      the spread of ability *within* any profession is far larger than the difference *between*
 *      professions. An individual's score says nothing about their fit for a field.
 *   3. DIFFERENT INSTRUMENT. As with the national figures, these are not on this app's calibrated
 *      scale, so any difference is indicative only.
 *
 * Figures are whole integers and grouped into broad families rather than specific job titles,
 * because the source data does not support fine distinctions.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Sources: Harrell, T. W., & Harrell, M. S. (1945), "Army General Classification Test scores for
 * civilian occupations", Educational and Psychological Measurement 5(3); plus later Wonderlic
 * Personnel Test occupational compilations.
 */

export const PROFESSION_SOURCE = {
  name: "Harrell & Harrell (1945) and Wonderlic occupational aggregates",
  note: "Historical, US-based; within-profession variation exceeds between-profession differences.",
} as const;

export interface Profession {
  key: string;
  label: string;
  /** Rounded historical reference, or null for grouping options that carry no figure. */
  average: number | null;
}

/**
 * A curated catalogue. Grouping (rather than free text) is deliberate: it keeps "developer" and
 * "software engineer" in one comparable bucket and matches the coarseness of the underlying data.
 */
export const PROFESSIONS: readonly Profession[] = [
  { key: "MEDICINE", label: "Medicine & healthcare (doctor, surgeon)", average: 125 },
  { key: "SCIENCE", label: "Science & research", average: 122 },
  { key: "ENGINEERING", label: "Engineering", average: 122 },
  { key: "LAW", label: "Law", average: 122 },
  { key: "SOFTWARE", label: "Software & IT", average: 119 },
  { key: "ARCHITECTURE", label: "Architecture", average: 120 },
  { key: "FINANCE", label: "Accounting & finance", average: 118 },
  { key: "EDUCATION", label: "Education & teaching", average: 112 },
  { key: "NURSING", label: "Nursing & allied health", average: 112 },
  { key: "MANAGEMENT", label: "Business & management", average: 110 },
  { key: "CREATIVE", label: "Design, arts & media", average: 110 },
  { key: "PUBLIC_SERVICE", label: "Public service & administration", average: 108 },
  { key: "SALES", label: "Sales & marketing", average: 108 },
  { key: "CLERICAL", label: "Clerical & office support", average: 105 },
  { key: "SKILLED_TRADES", label: "Skilled trades (electrician, mechanic)", average: 104 },
  { key: "HOSPITALITY", label: "Service & hospitality", average: 100 },
  { key: "MANUAL", label: "Manual & labour", average: 97 },
  { key: "STUDENT", label: "Student", average: null },
  { key: "RETIRED", label: "Retired", average: null },
  { key: "OTHER", label: "Other", average: null },
  { key: "PREFER_NOT_TO_SAY", label: "Prefer not to say", average: null },
] as const;

const BY_KEY = new Map(PROFESSIONS.map((p) => [p.key, p]));

export function isValidProfessionKey(key: string): boolean {
  return BY_KEY.has(key);
}

export function professionLabel(key: string): string | null {
  return BY_KEY.get(key)?.label ?? null;
}

export interface ProfessionReference {
  key: string;
  label: string;
  average: number;
  source: typeof PROFESSION_SOURCE;
}

/** Reference figure for a profession, or null when the group carries no figure (Student, Other…). */
export function professionReference(key: string | null | undefined): ProfessionReference | null {
  if (!key) return null;
  const profession = BY_KEY.get(key);
  if (!profession || profession.average === null) return null;
  return { key, label: profession.label, average: profession.average, source: PROFESSION_SOURCE };
}
