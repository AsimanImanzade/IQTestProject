/**
 * Sliding-window rate limiting.
 *
 * In-memory, which is correct for a single instance and honest about its limits: on multiple
 * instances each holds its own counters, so the effective limit multiplies by the instance count.
 * The interface is deliberately the one a Redis implementation would expose, so swapping the
 * backing store later touches only this file.
 *
 * Rate limiting matters most on the login route, where it is the difference between a password
 * being brute-forceable and not.
 */

interface Window {
  timestamps: number[];
}

const buckets = new Map<string, Window>();

/** Periodically drop buckets nothing has touched, so the map cannot grow without bound. */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

export interface RateLimitRule {
  /** Maximum number of requests permitted within the window. */
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the caller may retry; 0 when allowed. */
  retryAfterMs: number;
}

export const RATE_LIMITS = {
  /** Login is the brute-force target: strict. */
  login: { limit: 8, windowMs: 15 * 60 * 1000 },
  register: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** Starting tests is expensive (assembly + writes) but legitimately repeated. */
  startAttempt: { limit: 20, windowMs: 60 * 60 * 1000 },
  /** Answer autosave fires on every interaction, so this is a runaway guard, not a throttle. */
  saveResponse: { limit: 600, windowMs: 10 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

export function checkRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();

  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    cleanup(now);
    lastCleanup = now;
  }

  const bucket = buckets.get(key) ?? { timestamps: [] };
  const cutoff = now - rule.windowMs;

  // Drop timestamps that have slid out of the window.
  const recent = bucket.timestamps.filter((t) => t > cutoff);

  if (recent.length >= rule.limit) {
    const oldest = recent[0] ?? now;
    buckets.set(key, { timestamps: recent });
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + rule.windowMs - now),
    };
  }

  recent.push(now);
  buckets.set(key, { timestamps: recent });

  return { allowed: true, remaining: rule.limit - recent.length, retryAfterMs: 0 };
}

function cleanup(now: number): void {
  const longestWindow = Math.max(...Object.values(RATE_LIMITS).map((r) => r.windowMs));
  for (const [key, bucket] of buckets) {
    const recent = bucket.timestamps.filter((t) => t > now - longestWindow);
    if (recent.length === 0) buckets.delete(key);
    else buckets.set(key, { timestamps: recent });
  }
}

/** Reset all counters. Test-only. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Derive a rate-limit key from a request.
 * Falls back to a constant when no forwarding header is present, which is deliberately
 * conservative: an unidentifiable caller shares one bucket rather than escaping the limit.
 */
export function rateLimitKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}
