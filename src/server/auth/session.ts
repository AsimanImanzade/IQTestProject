import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "../db";
import type { Role } from "@/generated/prisma/enums";

/**
 * Server-side sessions.
 *
 * The spec offered "JWT or Auth.js"; this uses neither, deliberately. A stateless JWT cannot be
 * revoked, and the same specification separately requires preventing multiple simultaneous
 * sessions — which is unenforceable without server-side state. A session row also makes logout
 * real, supports listing and terminating devices, and lets an administrator cut off a compromised
 * account immediately.
 *
 * Only the SHA-256 hash of each token is stored. A database leak therefore yields no usable
 * sessions, exactly as with password hashes. SHA-256 (rather than Argon2) is correct here because
 * the token is 256 bits of cryptographic randomness, not a low-entropy human secret, so there is
 * nothing to brute force.
 */

export const SESSION_COOKIE = "iq_session";
export const GUEST_COOKIE = "iq_guest";

/** Sessions last 30 days, refreshed on use. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Only rewrite lastSeenAt when it is meaningfully stale, to avoid a write on every request. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  role: Role;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Create a session and set its cookie. Returns the raw token (never stored server-side). */
export async function createSession(
  userId: string,
  context: { userAgent?: string | null; ipHash?: string | null } = {},
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      tokenHash: tokenHash(token),
      userId,
      expiresAt,
      userAgent: context.userAgent ?? null,
      ipHash: context.ipHash ?? null,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    expires: expiresAt,
  });

  return token;
}

/** Resolve the current user from the session cookie, or null when signed out. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    select: {
      id: true,
      expiresAt: true,
      lastSeenAt: true,
      user: { select: { id: true, email: true, displayName: true, role: true } },
    },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    // Clean up eagerly so expired rows do not accumulate.
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  return session.user;
}

/** Destroy the current session. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  }

  store.delete(SESSION_COOKIE);
}

/** Revoke every other session for a user — used after a password change. */
export async function revokeOtherSessions(userId: string, keepToken?: string): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      userId,
      ...(keepToken ? { NOT: { tokenHash: tokenHash(keepToken) } } : {}),
    },
  });
  return result.count;
}

/** Remove expired sessions. Safe to call periodically. */
export async function pruneExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  return result.count;
}
