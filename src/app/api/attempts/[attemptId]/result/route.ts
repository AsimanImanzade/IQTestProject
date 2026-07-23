import { NextResponse } from "next/server";
import { handleRouteError, resolveOwner } from "@/server/api-helpers";
import { getAttemptResult } from "@/server/services/scoring";

/** GET /api/attempts/[attemptId]/result — full result, including the answer key and explanations. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ attemptId: string }> },
): Promise<NextResponse> {
  try {
    const { attemptId } = await context.params;
    const owner = await resolveOwner();
    const result = await getAttemptResult(attemptId, owner);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
