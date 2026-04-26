import { afterEach, describe, expect, it } from "vitest";
import { __resetRateLimitForTest, consume } from "@/lib/rateLimit";

afterEach(() => __resetRateLimitForTest());

describe("consume", () => {
  it("always allows when perHourLimit is null", () => {
    for (let i = 0; i < 10_000; i++) {
      const d = consume("c1", "apply_event", null);
      expect(d.allowed).toBe(true);
    }
  });

  it("always allows when perHourLimit is 0 or negative", () => {
    expect(consume("c1", "t", 0).allowed).toBe(true);
    expect(consume("c1", "t", -5).allowed).toBe(true);
  });

  it("debits one token per call and blocks when the bucket empties", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      const d = consume("c1", "t", 5, t0);
      expect(d.allowed).toBe(true);
    }
    const next = consume("c1", "t", 5, t0);
    expect(next.allowed).toBe(false);
    expect(next.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("isolates buckets per (customerId, toolName)", () => {
    const t0 = 1_000_000;
    // Drain c1/t
    for (let i = 0; i < 3; i++) consume("c1", "t", 3, t0);
    expect(consume("c1", "t", 3, t0).allowed).toBe(false);
    // c2/t is independent
    expect(consume("c2", "t", 3, t0).allowed).toBe(true);
    // c1/other-tool is independent
    expect(consume("c1", "other", 3, t0).allowed).toBe(true);
  });

  it("refills tokens over time at capacity/3600 per second", () => {
    const t0 = 1_000_000;
    // Capacity 3600 → 1 token per second.
    for (let i = 0; i < 3600; i++) consume("c1", "t", 3600, t0);
    expect(consume("c1", "t", 3600, t0).allowed).toBe(false);
    // Advance 10 seconds → 10 tokens available.
    expect(consume("c1", "t", 3600, t0 + 10_000).allowed).toBe(true);
  });

  it("reports retryAfter ≥ 1 when empty and >0 capacity", () => {
    const t0 = 1_000_000;
    consume("c1", "t", 1, t0);
    const denied = consume("c1", "t", 1, t0);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("resets the bucket when the configured capacity changes", () => {
    const t0 = 1_000_000;
    consume("c1", "t", 2, t0);
    consume("c1", "t", 2, t0);
    expect(consume("c1", "t", 2, t0).allowed).toBe(false);
    // Capacity raised to 10 → fresh bucket.
    expect(consume("c1", "t", 10, t0).allowed).toBe(true);
  });
});
