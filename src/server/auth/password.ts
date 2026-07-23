import { hash, verify } from "@node-rs/argon2";

/**
 * `Algorithm.Argon2id` from @node-rs/argon2 is an ambient const enum, which cannot be imported
 * under `verbatimModuleSyntax`. The numeric value is part of the package's stable public API
 * (Argon2d = 0, Argon2i = 1, Argon2id = 2), so it is inlined here rather than weakening the
 * compiler settings for the whole project.
 */
const ARGON2ID = 2;

/**
 * Password hashing with Argon2id.
 *
 * Argon2id is the current recommendation (OWASP, RFC 9106): it is memory-hard, so an attacker
 * with GPUs gains far less than against bcrypt or PBKDF2, and the "id" hybrid resists both
 * side-channel and time-memory tradeoff attacks.
 *
 * Parameters follow the OWASP minimum of 19 MiB memory with a time cost of 2. Memory cost is the
 * dominant defence; raising `timeCost` alone buys much less than raising `memoryCost`.
 */
const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/** Reject passwords that are trivially weak before they ever reach the database. */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  // Argon2 has no practical length limit, but an unbounded input is a cheap denial-of-service:
  // hashing a 10 MB "password" burns CPU on every attempt.
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
  return hash(password, OPTIONS);
}

/**
 * Verify a password against a stored hash.
 * Returns false rather than throwing on a malformed hash, so a corrupted row cannot be used to
 * distinguish "user exists" from "user does not exist" through error behaviour.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  try {
    return await verify(storedHash, password, OPTIONS);
  } catch {
    return false;
  }
}

/**
 * A dummy hash used to equalise timing on the login path.
 *
 * Without this, a login attempt for a non-existent email returns much faster than one for a real
 * email with a wrong password, which lets an attacker enumerate registered accounts. Verifying
 * against this constant makes both paths do the same work.
 */
export const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$J9V1Zz8kFZ3pQxYqZqXJ0mYyH1kZ7yGmC3xWl0dQ8Bc";
