import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../src/store.js";
import {
  CompareScenariosInput,
  TOOL_REGISTRY,
  compareScenariosTool,
  makeHandlers,
} from "../src/tools.js";

function freshStore() {
  const dir = mkdtempSync(join(tmpdir(), "ohfy-memory-test-"));
  return new MemoryStore(join(dir, "memory.json"));
}

const TENANT = "cust-yellowhammer";

describe("ohanafy-memory tool handlers", () => {
  it("exposes the three expected tools", () => {
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([
      "compare_scenarios",
      "list_decisions",
      "record_decision",
    ]);
  });

  describe("with an injected fresh store", () => {
    let store: MemoryStore;
    let handlers: ReturnType<typeof makeHandlers>;
    beforeEach(() => {
      store = freshStore();
      handlers = makeHandlers({ store });
    });

    it("record_decision persists a note and returns the new id", async () => {
      const out = await handlers.recordDecision({
        customerId: TENANT,
        scenarioId: "iron-bowl",
        note: "Approve 9.5% lift; chain programs already locked",
        author: "dan.whitlow",
        tags: ["cfo", "approved"],
      });
      expect(out.decision.id).toMatch(/^dec_/);
      expect(out.decision.tags).toContain("cfo");
      expect(store.list()).toHaveLength(1);
    });

    it("list_decisions filters by scenario and sorts newest-first", async () => {
      await handlers.recordDecision({ customerId: TENANT, scenarioId: "a", note: "first" });
      await new Promise((r) => setTimeout(r, 5));
      await handlers.recordDecision({ customerId: TENANT, scenarioId: "a", note: "second" });
      await handlers.recordDecision({ customerId: TENANT, scenarioId: "b", note: "other" });

      const out = await handlers.listDecisions({ customerId: TENANT, scenarioId: "a" });
      expect(out.count).toBe(2);
      expect(out.decisions[0].note).toBe("second");
    });

    it("record_decision Zod-rejects empty notes", async () => {
      await expect(
        handlers.recordDecision({ customerId: TENANT, scenarioId: "a", note: "" }),
      ).rejects.toThrow();
    });

    it("record_decision Zod-rejects missing customerId", async () => {
      await expect(
        handlers.recordDecision({ scenarioId: "a", note: "x" }),
      ).rejects.toThrow(/customerId/);
    });
  });

  describe("compare_scenarios (stateless)", () => {
    it("returns deltas and a verdict when A beats B on EBITDA", async () => {
      const out = await compareScenariosTool({
        customerId: TENANT,
        a: {
          scenarioId: "with-events",
          totals: { revenue: 12000, cogs: 7800, opex: 2000, gm: 4200, ebitda: 2200 },
        },
        b: {
          scenarioId: "baseline",
          totals: { revenue: 10000, cogs: 6800, opex: 1900, gm: 3200, ebitda: 1300 },
        },
      });
      expect(out.verdict).toBe("a_better_ebitda");
      expect(out.deltaAbs.revenue).toBe(2000);
    });

    it("Zod-rejects missing totals fields", () => {
      expect(() =>
        CompareScenariosInput.parse({
          customerId: TENANT,
          a: { scenarioId: "x", totals: { revenue: 1 } },
          b: { scenarioId: "y", totals: { revenue: 1 } },
        }),
      ).toThrow();
    });
  });
});
