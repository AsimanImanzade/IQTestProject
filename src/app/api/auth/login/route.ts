import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  enforceRateLimit,
  handleRouteError,
  jsonError,
  parseBody,
} from "@/server/api-helpers";
import { RATE_LIMITS } from "@/server/ratelimit";
import { authenticate, claimGuestAttempts } from "@/server/services/users";
import { createSession } from "@/server/auth/session";
import { clearGuestKey, getGuestKey } from "@/server/auth/guest";

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

/** POST /api/auth/login */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    // The strictest limit in the app: this is the brute-force target.
    enforceRateLimit(request, "login", RATE_LIMITS.login);

    const body = await parseBody(request, LoginSchema);
    const user = await authenticate(body);

    if (!user) {
      // One message for both "no such account" and "wrong password", so the response cannot be
      // used to discover which email addresses are registered.
      return jsonError("invalid-credentials", "Email or password is incorrect.", 401);
    }

    const guestKey = await getGuestKey();
    let claimed = 0;
    if (guestKey) {
      claimed = await claimGuestAttempts(user.id, guestKey);
      await clearGuestKey();
    }

    await createSession(user.id, { userAgent: request.headers.get("user-agent") });

    return NextResponse.json({ user, claimedAttempts: claimed });
  } catch (error) {
    return handleRouteError(error);
  }
}
