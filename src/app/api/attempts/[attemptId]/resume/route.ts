import { NextResponse } from "next/server";
import { handleRouteError, resolveOwner } from "@/server/api-helpers";
import { resumeAttempt } from "@/server/services/attempts";

/**
 * GET /api/attempts/[attemptId]/resume — reload an in-progress test.
 *
 * Covers a page refresh, a browser crash, or a laptop lid closing mid-test. The saved answers
 * come back with it; the elapsed clock does not reset, because the deadline was fixed server-side
 * when the attempt started.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ attemptId: string }> },
): Promise<NextResponse> {
  try {
    const { attemptId } = await context.params;
    const owner = await resolveOwner();
    const attempt = await resumeAttempt(attemptId, owner);
    return NextResponse.json(attempt);
  } catch (error) {
    return handleRouteError(error);
  }
}
