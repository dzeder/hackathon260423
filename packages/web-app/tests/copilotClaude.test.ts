import { afterEach, beforeEach, describe, it, expect } from "vitest";
import {
  _resetCopilotPersonaCache,
  estimateTurnCostUsd,
  getCopilotPersona,
} from "@/lib/copilotClaude";

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

describe("getCopilotPersona", () => {
  let originalPersona: string | undefined;

  beforeEach(() => {
    originalPersona = process.env.COPILOT_PERSONA;
    _resetCopilotPersonaCache();
  });

  afterEach(() => {
    if (originalPersona === undefined) {
      delete process.env.COPILOT_PERSONA;
    } else {
      process.env.COPILOT_PERSONA = originalPersona;
    }
    _resetCopilotPersonaCache();
  });

  it("returns a customer-agnostic default when COPILOT_PERSONA is unset", () => {
    delete process.env.COPILOT_PERSONA;
    const persona = getCopilotPersona();
    expect(persona).not.toMatch(/yellowhammer/i);
    expect(persona).not.toMatch(/birmingham/i);
    expect(persona).toMatch(/Ohanafy Plan copilot/);
    expect(persona).toMatch(/CFO/);
  });

  it("returns the COPILOT_PERSONA env value when set", () => {
    process.env.COPILOT_PERSONA =
      "You are the Ohanafy Plan copilot for Acme Wines — a Napa wholesaler.";
    const persona = getCopilotPersona();
    expect(persona).toContain("Acme Wines");
    expect(persona).toContain("Napa");
  });

  it("treats an empty/whitespace COPILOT_PERSONA as unset", () => {
    process.env.COPILOT_PERSONA = "   ";
    const persona = getCopilotPersona();
    expect(persona).toMatch(/Ohanafy Plan copilot/);
  });

  it("memoizes per-process so cache_control still hits across turns", () => {
    process.env.COPILOT_PERSONA = "first";
    expect(getCopilotPersona()).toBe("first");
    process.env.COPILOT_PERSONA = "second";
    // Same process, no reset — should still return the first value.
    expect(getCopilotPersona()).toBe("first");
  });
});
