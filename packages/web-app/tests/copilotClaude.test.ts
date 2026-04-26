import { describe, it, expect } from "vitest";
import { estimateTurnCostUsd } from "@/lib/copilotClaude";

describe("estimateTurnCostUsd", () => {
  it("Sonnet: input billed at $3/MTok, output at $15/MTok", () => {
    const cost = estimateTurnCostUsd("claude-sonnet-4-6", {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(cost).toBeCloseTo(3.0, 2);
  });

  it("Opus output at $75/MTok", () => {
    const cost = estimateTurnCostUsd("claude-opus-4-7", {
      inputTokens: 0,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(cost).toBeCloseTo(75.0, 2);
  });

  it("cache reads billed at ~10% of base input", () => {
    const cost = estimateTurnCostUsd("claude-sonnet-4-6", {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 0,
    });
    // 1M * 3 * 0.10 = 0.30
    expect(cost).toBeCloseTo(0.3, 2);
  });

  it("cache writes billed at ~125% of base input", () => {
    const cost = estimateTurnCostUsd("claude-sonnet-4-6", {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 1_000_000,
    });
    // 1M * 3 * 1.25 = 3.75
    expect(cost).toBeCloseTo(3.75, 2);
  });

  it("Haiku is an order of magnitude cheaper than Opus", () => {
    const haiku = estimateTurnCostUsd("claude-haiku-4-5-20251001", {
      inputTokens: 100_000,
      outputTokens: 1000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    const opus = estimateTurnCostUsd("claude-opus-4-7", {
      inputTokens: 100_000,
      outputTokens: 1000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(haiku).toBeLessThan(opus / 10);
  });

  it("unknown model falls back to Sonnet pricing", () => {
    const cost = estimateTurnCostUsd("claude-made-up", {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(cost).toBeCloseTo(3.0, 2);
  });
});
