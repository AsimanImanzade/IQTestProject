import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  enforceRateLimit,
  handleRouteError,
  parseBody,
  resolveOwner,
} from "@/server/api-helpers";
import { RATE_LIMITS } from "@/server/ratelimit";
import { startAttempt } from "@/server/services/attempts";
import { getLocale } from "@/server/locale";

const StartSchema = z.object({
  mode: z.enum(["TIMED", "UNTIMED"]),
  /**
   * Supplied by guests only. A signed-in user's profile is authoritative and these fields are
   * ignored for them — otherwise a crafted request could score an attempt against an age the
   * person never claimed.
   */
  demographics: z
    .object({
      ageYears: z.number().int().min(12).max(100).nullable().optional(),
      gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]).nullable().optional(),
      educationLevel: z
        .enum([
          "PRIMARY", "SECONDARY", "VOCATIONAL",
          "BACHELORS", "MASTERS", "DOCTORATE", "PREFER_NOT_TO_SAY",
        ])
        .nullable()
        .optional(),
    })
    .optional(),
});

/** POST /api/attempts — assemble and start a new test. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, "start-attempt", RATE_LIMITS.startAttempt);

    const { mode, demographics } = await parseBody(request, StartSchema);
    // createGuest: a first-time visitor has no identity yet, and starting a test is exactly the
    // moment to issue one.
    const owner = await resolveOwner({ createGuest: true });
    const locale = await getLocale();

    const attempt = await startAttempt(owner, mode, demographics, locale);
    return NextResponse.json(attempt, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
