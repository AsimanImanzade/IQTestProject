import { NextResponse } from "next/server";
import { assertSameOrigin, handleRouteError, resolveOwner } from "@/server/api-helpers";
import { recordFocusLoss } from "@/server/services/attempts";

/**
 * POST /api/attempts/[attemptId]/focus-loss — record that the test-taker left the tab.
 *
 * This is an integrity signal, not a blocker. The count is stored on the attempt and shown on the
 * result; it is deliberately not used to void a test, because switching tabs has many innocent
 * explanations and a false accusation is worse than a noisy signal.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ attemptId: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { attemptId } = await context.params;
    const owner = await resolveOwner();
    const result = await recordFocusLoss(attemptId, owner);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
