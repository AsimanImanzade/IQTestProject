import { NextResponse } from "next/server";
import { assertSameOrigin, handleRouteError } from "@/server/api-helpers";
import { destroySession } from "@/server/auth/session";

/**
 * POST /api/auth/logout
 *
 * Deletes the session row, not just the cookie. This is the concrete advantage of server-side
 * sessions over a stateless JWT: a stolen token stops working the moment the user logs out.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
