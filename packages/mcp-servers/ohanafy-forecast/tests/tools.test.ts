import { describe, expect, it } from "vitest";
import {
  applyEventTool,
  runThreeStatementTool,
  snapshotTool,
  TOOL_REGISTRY,
} from "../src/tools.js";

const TENANT = "cust-yellowhammer";

describe("ohanafy-forecast tool handlers", () => {
  it("exposes the three expected tools", () => {
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([
      "apply_event",
      "run_three_statement",
      "snapshot",
    ]);
  });

  it("apply_event returns a 6-month forecast and preserves event count", async () => {
    const out = await applyEventTool({
      customerId: TENANT,
      scenarioId: "demo",
      events: [{ id: "iron-bowl-2026", month: "2026-10", revenueDeltaPct: 9.5 }],
    });
    expect(out.forecast).toHaveLength(6);
    expect(out.eventCount).toBe(1);
  });

  it("apply_event rejects invalid month format via Zod", async () => {
    await expect(
      applyEventTool({
        customerId: TENANT,
        scenarioId: "bad",
        events: [{ id: "x", month: "October 2026", revenueDeltaPct: 1 }],
      }),
    ).rejects.toThrow();
  });

  it("apply_event rejects missing customerId via Zod", async () => {
    await expect(
      applyEventTool({
        scenarioId: "demo",
        events: [{ id: "iron-bowl-2026", month: "2026-10", revenueDeltaPct: 1 }],
      }),
    ).rejects.toThrow(/customerId/);
  });

  it("run_three_statement works on empty event list (returns baseline statements)", async () => {
    const out = await runThreeStatementTool({ customerId: TENANT, scenarioId: "base", events: [] });
    expect(out.income.totals.revenue).toBeGreaterThan(0);
    expect(out.balance.equity).toBeGreaterThan(0);
  });

  it("snapshot bundles forecast + three-statement", async () => {
    const out = await snapshotTool({
      customerId: TENANT,
      scenarioId: "combo",
      events: [
        { id: "iron-bowl-2026", month: "2026-10", revenueDeltaPct: 9.5 },
        { id: "heat-wave-july", month: "2026-07", revenueDeltaPct: 3.1 },
      ],
    });
    expect(out.eventCount).toBe(2);
    expect(out.forecast).toHaveLength(6);
    expect(out.threeStatement.income.totals.revenue).toBeGreaterThan(0);
  });
});
