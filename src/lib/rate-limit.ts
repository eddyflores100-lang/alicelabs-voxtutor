type RateLimitStore = Map<string, number[]>;

const MAX_RATE_LIMIT_KEYS = 5_000;

/**
 * Best-effort per-process limiter. Production deployments should also apply
 * provider/edge-level limits because serverless instances do not share memory.
 */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const root = globalThis as typeof globalThis & { __voxtutorRateLimits?: RateLimitStore };
  const buckets = (root.__voxtutorRateLimits ??= new Map<string, number[]>());
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);

  if (recent.length >= limit) {
    buckets.set(key, recent);
    return true;
  }

  recent.push(now);
  buckets.set(key, recent);

  if (buckets.size > MAX_RATE_LIMIT_KEYS) {
    for (const [candidate, timestamps] of buckets) {
      const lastHit = timestamps[timestamps.length - 1] ?? 0;
      if (now - lastHit >= windowMs) buckets.delete(candidate);
      if (buckets.size <= MAX_RATE_LIMIT_KEYS) break;
    }
    while (buckets.size > MAX_RATE_LIMIT_KEYS) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  }

  return false;
}
