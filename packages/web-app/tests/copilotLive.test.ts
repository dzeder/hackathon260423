import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnthropicKeyMissingError, respondLive } from "@/lib/copilotLive";
import { baselineForecast } from "@/data/baseline";

const sampleQuery = {
  prompt: "what if a hurricane hits?",
  scenarioId: "demo",
  appliedEventIds: [],
  baseline: baselineForecast,
  scenario: baselineForecast,
  threeStatement: {
    income: { totals: { revenue: 1, cogs: 1, opex: 1, gm: 0, ebitda: 0 } },
    balance: { assets: 0, liabilities: 0, equity: 0 },
    cash: { operating: 0, investing: 0, financing: 0, net: 0 },
  } as never,
};

describe("respondLive key assertion", () => {
  const original = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (original !== undefined) {
      process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("throws AnthropicKeyMissingError when the key is absent", async () => {
    await expect(respondLive(sampleQuery)).rejects.toBeInstanceOf(
      AnthropicKeyMissingError,
    );
  });

  it("throws when the key is whitespace-only", async () => {
    process.env.ANTHROPIC_API_KEY = "   ";
    await expect(respondLive(sampleQuery)).rejects.toBeInstanceOf(
      AnthropicKeyMissingError,
    );
  });

  it("error message never leaks the key value", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-SECRET-DO-NOT-LEAK";
    try {
      // We expect this to throw (network/401), but the error we catch
      // must not include the key.
      await respondLive(sampleQuery);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain("sk-ant-SECRET-DO-NOT-LEAK");
    }
  });
});
