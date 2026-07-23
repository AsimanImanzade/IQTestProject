import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AttemptError } from "./services/attempts";
import { getSessionUser } from "./auth/session";
import { ensureGuestKey, getGuestKey } from "./auth/guest";
import type { AttemptOwner } from "./services/attempts";
import { checkRateLimit, rateLimitKey, type RateLimitRule } from "./ratelimit";

/** Shared plumbing for route handlers: validation, auth context, errors, rate limiting. */

export function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Convert a thrown error into a response.
 *
 * Unknown errors deliberately return a generic message: internal messages routinely contain
 * table names, file paths and query fragments, and leaking those to the client is a genuine
 * information disclosure. The detail goes to the server log instead.
 */
export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof AttemptError) {
    return jsonError(error.code, error.message, error.status);
  }

  if (error instanceof ZodError) {
    const first = error.issues[0];
    return jsonError(
      "invalid-request",
      first ? `${first.path.join(".")}: ${first.message}` : "Invalid request.",
      400,
    );
  }

  console.error("Unhandled route error:", error);
  return jsonError("server-error", "Something went wrong. Please try again.", 500);
}

/** Parse and validate a JSON body. */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new AttemptError("invalid-json", "Request body must be valid JSON.", 400);
  }
  return schema.parse(raw);
}

/**
 * Resolve who is making the request.
 *
 * A signed-in user always wins over a guest cookie, so someone who registers mid-session does not
 * keep writing attempts to their old anonymous identity.
 */
export async function resolveOwner(options: { createGuest?: boolean } = {}): Promise<AttemptOwner> {
  const user = await getSessionUser();
  if (user) return { userId: user.id };

  const guestKey = options.createGuest ? await ensureGuestKey() : await getGuestKey();
  if (!guestKey) {
    throw new AttemptError(
      "no-session",
      "No session found. Start a test first.",
      401,
    );
  }
  return { guestKey };
}

/** Apply a rate limit, throwing a 429 when exceeded. */
export function enforceRateLimit(request: Request, scope: string, rule: RateLimitRule): void {
  const result = checkRateLimit(rateLimitKey(request, scope), rule);
  if (!result.allowed) {
    throw new AttemptError(
      "rate-limited",
      `Too many requests. Try again in ${Math.ceil(result.retryAfterMs / 1000)} seconds.`,
      429,
    );
  }
}

/**
 * Reject cross-origin state-changing requests.
 *
 * SameSite=Lax cookies already block the classic form-post CSRF, but an explicit origin check is
 * cheap defence in depth and covers browsers or proxies that mishandle SameSite.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return; // same-origin fetches from some browsers omit it entirely

  const host = request.headers.get("host");
  if (!host) return;

  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      throw new AttemptError("cross-origin", "Cross-origin requests are not permitted.", 403);
    }
  } catch (error) {
    if (error instanceof AttemptError) throw error;
    throw new AttemptError("cross-origin", "Malformed Origin header.", 400);
  }
}
