// Simple in-memory fixed-window rate limiter.
//
// Sufficient for demo / single-warm-instance scale: it bounds abuse of the
// expensive AI endpoints per user. On a horizontally-scaled deployment each
// instance keeps its own window, so for strict global limits swap the Map for
// a shared store (e.g. Upstash Redis) behind the same interface.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets (0 when allowed). */
  retryAfter: number;
}

/**
 * Allow up to `limit` calls per `windowMs` for a given `key`.
 * `now` is injectable for deterministic tests.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true, retryAfter: 0 };
}

/** Test-only: clear all rate-limit state. */
export function __resetRateLimits(): void {
  buckets.clear();
}
