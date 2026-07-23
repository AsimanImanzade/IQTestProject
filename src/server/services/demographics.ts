import { prisma } from "../db";
import { AttemptError } from "./attempts";
import {
  MAX_SUPPORTED_AGE,
  MIN_SUPPORTED_AGE,
  isSupportedAge,
} from "@/core/psychometrics/age-norms";
import { isValidCountryCode } from "@/core/reference/countries";
import { isValidProfessionKey } from "@/core/reference/professions";
import { isLocale } from "@/core/i18n";
import type { EducationLevel, Gender } from "@/generated/prisma/enums";

/**
 * Demographic capture.
 *
 * Two paths, by design:
 *   * a signed-in user states their birth year once in their profile, and every attempt
 *     snapshots the age they were on the day they took it
 *   * a guest has nowhere to store a profile, so they are asked at the start of each attempt
 *
 * Age is the only field that affects a score. Gender and education level are recorded for
 * reporting and bias monitoring and are never used in any calculation — see `age-norms.ts`.
 */

export interface DemographicsInput {
  /** Guests supply an age directly; signed-in users supply a birth year on their profile. */
  ageYears?: number | null;
  gender?: Gender | null;
  educationLevel?: EducationLevel | null;
}

export interface ResolvedDemographics {
  ageYears: number | null;
  gender: Gender | null;
  educationLevel: EducationLevel | null;
  nationality: string | null;
  profession: string | null;
}

/** Age in whole years from a birth year, as of today. */
export function ageFromBirthYear(birthYear: number, now: Date = new Date()): number {
  // Year granularity only, so this is accurate to within one year — which is finer than the
  // age bands the norms use, and avoids collecting a full date of birth.
  return now.getFullYear() - birthYear;
}

export function birthYearFromAge(age: number, now: Date = new Date()): number {
  return now.getFullYear() - age;
}

export function validateAge(age: number | null | undefined): number | null {
  if (age === null || age === undefined) return null;
  if (!isSupportedAge(age)) {
    throw new AttemptError(
      "age-out-of-range",
      `Age must be a whole number between ${MIN_SUPPORTED_AGE} and ${MAX_SUPPORTED_AGE}. ` +
        `This test is not designed for children under ${MIN_SUPPORTED_AGE}.`,
      400,
    );
  }
  return age;
}

/** Read a signed-in user's stored profile. */
export async function getProfile(userId: string): Promise<{
  birthYear: number | null;
  ageYears: number | null;
  gender: Gender | null;
  educationLevel: EducationLevel | null;
  nationality: string | null;
  profession: string | null;
  displayName: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      birthYear: true,
      gender: true,
      educationLevel: true,
      nationality: true,
      profession: true,
      displayName: true,
    },
  });

  if (!user) throw new AttemptError("not-found", "Account not found.", 404);

  return {
    birthYear: user.birthYear,
    ageYears: user.birthYear === null ? null : ageFromBirthYear(user.birthYear),
    gender: user.gender,
    educationLevel: user.educationLevel,
    nationality: user.nationality,
    profession: user.profession,
    displayName: user.displayName,
  };
}

export interface ProfileUpdate {
  displayName?: string | null;
  birthYear?: number | null;
  gender?: Gender | null;
  educationLevel?: EducationLevel | null;
  nationality?: string | null;
  profession?: string | null;
  language?: string | null;
}

export async function updateProfile(userId: string, update: ProfileUpdate): Promise<void> {
  if (update.birthYear !== undefined && update.birthYear !== null) {
    // Validate as an age so the error message matches what the person actually typed about.
    validateAge(ageFromBirthYear(update.birthYear));
  }

  // Reject unknown catalogue values rather than storing junk that would never match a reference.
  if (update.nationality !== undefined && update.nationality !== null && update.nationality !== "") {
    if (!isValidCountryCode(update.nationality)) {
      throw new AttemptError("invalid-nationality", "Unknown country.", 400);
    }
  }
  if (update.profession !== undefined && update.profession !== null && update.profession !== "") {
    if (!isValidProfessionKey(update.profession)) {
      throw new AttemptError("invalid-profession", "Unknown profession.", 400);
    }
  }
  if (update.language !== undefined && update.language !== null && update.language !== "") {
    if (!isLocale(update.language)) {
      throw new AttemptError("invalid-language", "Unsupported language.", 400);
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(update.displayName !== undefined ? { displayName: update.displayName } : {}),
      ...(update.birthYear !== undefined ? { birthYear: update.birthYear } : {}),
      ...(update.gender !== undefined ? { gender: update.gender } : {}),
      ...(update.educationLevel !== undefined ? { educationLevel: update.educationLevel } : {}),
      ...(update.nationality !== undefined ? { nationality: update.nationality || null } : {}),
      ...(update.profession !== undefined ? { profession: update.profession || null } : {}),
      ...(update.language !== undefined ? { language: update.language || null } : {}),
    },
  });
}

/**
 * Work out which demographics apply to an attempt about to start.
 *
 * A signed-in user's profile is authoritative — they are not asked again on every attempt. A
 * guest must supply the details with the request, because there is nowhere to have stored them.
 */
export async function resolveForAttempt(
  owner: { userId?: string; guestKey?: string },
  supplied: DemographicsInput | undefined,
): Promise<ResolvedDemographics> {
  if (owner.userId) {
    const profile = await getProfile(owner.userId);
    return {
      ageYears: profile.ageYears,
      gender: profile.gender,
      educationLevel: profile.educationLevel,
      nationality: profile.nationality,
      profession: profile.profession,
    };
  }

  // Guests supply age/gender/education inline; nationality and profession are a signed-in-only
  // feature, so they are always null for a guest attempt.
  return {
    ageYears: validateAge(supplied?.ageYears ?? null),
    gender: supplied?.gender ?? null,
    educationLevel: supplied?.educationLevel ?? null,
    nationality: null,
    profession: null,
  };
}
