import { NextResponse } from "next/server";
import { assertSameOrigin, handleRouteError, resolveOwner } from "@/server/api-helpers";
import { submitAttempt } from "@/server/services/scoring";

/**
 * POST /api/attempts/[attemptId]/submit — grade and score the attempt.
 *
 * The request carries no body: everything needed to score is already stored server-side, so
 * there is nothing a client could tamper with. Submitting twice returns the same stored result.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ attemptId: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { attemptId } = await context.params;
    const owner = await resolveOwner();

    const result = await submitAttempt(attemptId, owner);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
