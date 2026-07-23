import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { GUEST_COOKIE } from "./session";

/**
 * Anonymous guest identity.
 *
 * Guests take a full test without registering — forcing a signup before someone has seen any
 * value is the single biggest drop-off point for a public assessment. The guest key identifies
 * their attempts so results can be shown and later claimed at registration.
 *
 * The key is HMAC-signed. Without a signature anyone could set the cookie to an arbitrary value
 * and read another guest's results, since the key is the only thing authorising access to a
 * guest attempt. Signing means only keys this server issued are accepted.
 */

const GUEST_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to at least 32 characters. Generate one with: " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  return value;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function format(id: string): string {
  return `${id}.${sign(id)}`;
}

/** Verify and unwrap a signed guest cookie, returning null if it was tampered with. */
export function parseGuestKey(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;

  const separator = cookieValue.lastIndexOf(".");
  if (separator <= 0) return null;

  const id = cookieValue.slice(0, separator);
  const signature = cookieValue.slice(separator + 1);
  const expected = sign(id);

  // Constant-time comparison: a short-circuiting compare leaks how much of the signature was
  // correct, which is enough to forge one byte at a time.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return id;
}

/** Read the current guest key without creating one. */
export async function getGuestKey(): Promise<string | null> {
  const store = await cookies();
  return parseGuestKey(store.get(GUEST_COOKIE)?.value);
}

/** Read the current guest key, issuing one if absent. */
export async function ensureGuestKey(): Promise<string> {
  const store = await cookies();
  const existing = parseGuestKey(store.get(GUEST_COOKIE)?.value);
  if (existing) return existing;

  const id = randomBytes(24).toString("base64url");
  store.set(GUEST_COOKIE, format(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(Date.now() + GUEST_TTL_MS),
  });

  return id;
}

/** Clear the guest cookie, used once a guest's attempts have been claimed by an account. */
export async function clearGuestKey(): Promise<void> {
  const store = await cookies();
  store.delete(GUEST_COOKIE);
}
