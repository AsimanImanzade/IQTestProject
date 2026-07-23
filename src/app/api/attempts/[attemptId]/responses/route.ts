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
import { saveResponse } from "@/server/services/attempts";

const SaveSchema = z.object({
  questionId: z.string().min(1),
  choiceId: z.string().min(1).nullable(),
  responseMs: z.number().int().min(0).max(3_600_000),
  flagged: z.boolean(),
});

/**
 * PATCH /api/attempts/[attemptId]/responses — autosave a single answer.
 *
 * The response body is intentionally just `{ saved: true }`. Returning whether the answer was
 * correct would let anyone determine the key by submitting each option in turn.
 */
export async function PATCH(
  request: Request,
  // Next.js 16: route params are a Promise and must be awaited.
  context: { params: Promise<{ attemptId: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, "save-response", RATE_LIMITS.saveResponse);

    const { attemptId } = await context.params;
    const body = await parseBody(request, SaveSchema);
    const owner = await resolveOwner();

    const result = await saveResponse({ attemptId, ...body }, owner);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
