import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  enforceRateLimit,
  handleRouteError,
  parseBody,
} from "@/server/api-helpers";
import { RATE_LIMITS } from "@/server/ratelimit";
import { claimGuestAttempts, registerUser } from "@/server/services/users";
import { createSession } from "@/server/auth/session";
import { clearGuestKey, getGuestKey } from "@/server/auth/guest";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/server/auth/password";

const RegisterSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  displayName: z.string().trim().max(60).optional(),
});

/**
 * POST /api/auth/register
 *
 * On success the new account immediately adopts any attempts taken as a guest in this browser,
 * which is the whole point of guest-first testing: the result someone just saw follows them into
 * their account instead of disappearing behind a signup wall.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, "register", RATE_LIMITS.register);

    const body = await parseBody(request, RegisterSchema);
    const guestKey = await getGuestKey();

    const user = await registerUser(body);

    let claimed = 0;
    if (guestKey) {
      claimed = await claimGuestAttempts(user.id, guestKey);
      await clearGuestKey();
    }

    await createSession(user.id, { userAgent: request.headers.get("user-agent") });

    return NextResponse.json({ user, claimedAttempts: claimed }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
