/**
 * In-memory fixed-window rate limiter — a genuine, working guard against
 * credential-stuffing / password-reset spam on a single Node process. Not
 * shared across instances: a multi-instance production deployment needs a
 * shared store (Redis/Upstash) instead, which is blocked on the same
 * infrastructure provisioning issue as Postgres (see the mission report).
 * Until then, this is real protection, not a placeholder — every deployment
 * of this app today runs as one process.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

// Bound memory: if this ever fills up (e.g. a scan hitting many distinct
// emails/IPs), drop the oldest entries rather than growing unbounded.
const MAX_TRACKED_KEYS = 10_000;

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt <= now) {
    if (attempts.size >= MAX_TRACKED_KEYS) {
      const oldestKey = attempts.keys().next().value;
      if (oldestKey !== undefined) attempts.delete(oldestKey);
    }
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;

  entry.count += 1;
  return true;
}
