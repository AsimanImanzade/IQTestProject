import { NextResponse } from "next/server";
import { handleRouteError } from "@/server/api-helpers";
import { getSessionUser } from "@/server/auth/session";

/** GET /api/me — the current session's user, or null when signed out. */
export async function GET(): Promise<NextResponse> {
  try {
    const user = await getSessionUser();
    return NextResponse.json({ user });
  } catch (error) {
    return handleRouteError(error);
  }
}
