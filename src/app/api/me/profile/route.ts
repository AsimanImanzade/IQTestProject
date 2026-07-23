import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  handleRouteError,
  jsonError,
  parseBody,
} from "@/server/api-helpers";
import { getSessionUser } from "@/server/auth/session";
import { getProfile, updateProfile } from "@/server/services/demographics";
import { MAX_SUPPORTED_AGE, MIN_SUPPORTED_AGE } from "@/core/psychometrics/age-norms";

const currentYear = new Date().getFullYear();

const ProfileSchema = z.object({
  displayName: z.string().trim().max(60).nullable().optional(),
  birthYear: z
    .number()
    .int()
    // Bounds derived from the supported age range so the two can never drift apart.
    .min(currentYear - MAX_SUPPORTED_AGE)
    .max(currentYear - MIN_SUPPORTED_AGE)
    .nullable()
    .optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]).nullable().optional(),
  educationLevel: z
    .enum([
      "PRIMARY", "SECONDARY", "VOCATIONAL",
      "BACHELORS", "MASTERS", "DOCTORATE", "PREFER_NOT_TO_SAY",
    ])
    .nullable()
    .optional(),
  // Loosely typed here (short strings) and validated against the catalogues in the service layer,
  // so adding a country or profession never requires touching this schema.
  nationality: z.string().max(2).nullable().optional(),
  profession: z.string().max(40).nullable().optional(),
});

/** GET /api/me/profile — the signed-in user's profile, including their current age. */
export async function GET(): Promise<NextResponse> {
  try {
    const user = await getSessionUser();
    if (!user) return jsonError("unauthenticated", "Sign in to view your profile.", 401);
    return NextResponse.json({ profile: await getProfile(user.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PATCH /api/me/profile — update profile details.
 *
 * Birth year is stored rather than age: an age would silently go stale, whereas a birth year
 * stays correct and lets each attempt record the age the person actually was on the day.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const user = await getSessionUser();
    if (!user) return jsonError("unauthenticated", "Sign in to update your profile.", 401);

    const update = await parseBody(request, ProfileSchema);
    await updateProfile(user.id, update);

    return NextResponse.json({ profile: await getProfile(user.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
