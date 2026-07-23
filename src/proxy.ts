import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`. Keeping the old filename means this file is
 * silently never executed, so the rename is load-bearing rather than cosmetic.
 *
 * This is a fast path only: it redirects visitors with no session cookie away from private pages
 * so they do not see a flash of an empty dashboard. It deliberately does NOT validate the session,
 * because presence of a cookie proves nothing — the real check runs in the page itself, against
 * the database. Treating this as the security boundary is a well-known way to ship an auth bypass.
 */
export function proxy(request: NextRequest): NextResponse {
  const hasSessionCookie = request.cookies.has("iq_session");

  if (!hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
