import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { countPublishedQuestions } from "@/server/repositories/questions";
import { TEST_LENGTH } from "@/core/blueprint/blueprint";

/**
 * GET /api/health — liveness and readiness.
 *
 * Reports unhealthy when the bank is too small to assemble a test, not just when the process is
 * up. A container that answers requests but cannot deliver a test is not actually ready, and a
 * load balancer should know that.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const questionCount = await countPublishedQuestions();
    const ready = questionCount >= TEST_LENGTH;

    return NextResponse.json(
      {
        status: ready ? "ok" : "degraded",
        database: "connected",
        questionCount,
        required: TEST_LENGTH,
        ...(ready ? {} : { detail: "Question bank too small — run `npm run db:seed`." }),
      },
      { status: ready ? 200 : 503 },
    );
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json(
      { status: "error", database: "unreachable" },
      { status: 503 },
    );
  }
}
