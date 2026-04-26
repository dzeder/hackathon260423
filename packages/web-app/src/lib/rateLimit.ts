/**
 * Token-bucket rate limiter keyed on (customerId, toolName).
 *
 * - Capacity = per-hour limit from Plan_Agent_Config__mdt.
 * - Refill rate = capacity / 3600 tokens per second, continuous.
 * - In-process only for v1. Fine for a single-region Vercel deployment;
 *   swap to Upstash Redis or similar when we go multi-region.
 * - LRU-capped at MAX_BUCKETS keys so a flood of unique tenants can't
 *   balloon memory.
 */

interface Bucket {
  tokens: number;
  capacity: number;
  refillPerSec: number;
  lastRefillMs: number;
}

const MAX_BUCKETS = 10_000;

/** LRU implemented as an insertion-ordered Map: on hit, delete+re-insert. */
const buckets = new Map<string, Bucket>();

function keyFor(customerId: string, toolName: string): string {
  return `${customerId}|${toolName}`;
}

function touch(key: string, bucket: Bucket): void {
  buckets.delete(key);
  buckets.set(key, bucket);
  if (buckets.size > MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest !== undefined) buckets.delete(oldest);
  }
}

function refill(bucket: Bucket, nowMs: number): void {
  const elapsedMs = Math.max(0, nowMs - bucket.lastRefillMs);
  if (elapsedMs === 0) return;
  const added = (elapsedMs / 1000) * bucket.refillPerSec;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + added);
  bucket.lastRefillMs = nowMs;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Tokens left after this decision (informational). */
  remaining: number;
  /** Seconds the caller should wait before retrying, rounded up. Set only when allowed=false. */
  retryAfterSec?: number;
}

/**
 * Check and debit one token for (customerId, toolName). If the per-hour
 * limit is null the call is always allowed. Caller should return 429 with
 * Retry-After: <retryAfterSec> when allowed is false.
 */
export function consume(
  customerId: string,
  toolName: string,
  perHourLimit: number | null,
  nowMs: number = Date.now(),
): RateLimitDecision {
  if (perHourLimit === null || perHourLimit <= 0) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY };
  }
  const key = keyFor(customerId, toolName);
  let bucket = buckets.get(key);
  if (!bucket || bucket.capacity !== perHourLimit) {
    bucket = {
      tokens: perHourLimit,
      capacity: perHourLimit,
      refillPerSec: perHourLimit / 3600,
      lastRefillMs: nowMs,
    };
  } else {
    refill(bucket, nowMs);
  }
  touch(key, bucket);
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens) };
  }
  const needed = 1 - bucket.tokens;
  const retryAfterSec = Math.max(1, Math.ceil(needed / bucket.refillPerSec));
  return { allowed: false, remaining: 0, retryAfterSec };
}

/** Reset for tests. Not exported from the public surface. */
export function __resetRateLimitForTest(): void {
  buckets.clear();
}
