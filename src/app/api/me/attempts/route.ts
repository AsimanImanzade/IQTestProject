import { NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/server/api-helpers";
import { getSessionUser } from "@/server/auth/session";
import { getAttemptHistory, getDashboardStats } from "@/server/services/users";

/** GET /api/me/attempts — the signed-in user's history and dashboard statistics. */
export async function GET(): Promise<NextResponse> {
  try {
    const user = await getSessionUser();
    if (!user) return jsonError("unauthenticated", "Sign in to view your history.", 401);

    const [attempts, stats] = await Promise.all([
      getAttemptHistory(user.id),
      getDashboardStats(user.id),
    ]);

    return NextResponse.json({ attempts, stats });
  } catch (error) {
    return handleRouteError(error);
  }
}
