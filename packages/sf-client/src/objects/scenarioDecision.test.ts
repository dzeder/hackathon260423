import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { recordPlanScenarioDecision } from "./scenarioDecision";

function fakeConn(createResult: { success: boolean; id?: string; errors?: unknown[] }) {
  const create = vi.fn(async (_payload: Record<string, unknown>) => createResult);
  const sobject = vi.fn((_name: string) => ({ create }));
  return {
    conn: { sobject } as unknown as Parameters<typeof recordPlanScenarioDecision>[0],
    sobject,
    create,
  };
}

describe("recordPlanScenarioDecision", () => {
  const original = process.env.OHFY_PLAN_NS_PREFIX;
  beforeEach(() => {
    delete process.env.OHFY_PLAN_NS_PREFIX;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.OHFY_PLAN_NS_PREFIX;
    else process.env.OHFY_PLAN_NS_PREFIX = original;
  });

  it("inserts with hashed userId and joined applied event ids", async () => {
    const f = fakeConn({ success: true, id: "a01000000000001" });
    const out = await recordPlanScenarioDecision(f.conn, {
      scenarioId: "yellowhammer-stress",
      decisionType: "accept",
      rationale: "approved by CFO",
      appliedEventIds: ["iron-bowl-2026", "heat-wave-july"],
      userId: "u-dan",
    });
    expect(out.sfId).toBe("a01000000000001");
    expect(out.decisionId).toMatch(/^[0-9a-f-]{36}$/);

    const payload = f.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.Scenario_Id__c).toBe("yellowhammer-stress");
    expect(payload.Decision_Type__c).toBe("accept");
    expect(payload.Applied_Event_Ids__c).toBe("iron-bowl-2026,heat-wave-july");
    expect(payload.User_Id_Hash__c).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.User_Id_Hash__c).not.toBe("u-dan");
  });

  it("applies the namespace prefix to fields and SObject when set", async () => {
    process.env.OHFY_PLAN_NS_PREFIX = "ohfy__";
    const f = fakeConn({ success: true, id: "a01" });
    await recordPlanScenarioDecision(f.conn, {
      scenarioId: "s1",
      decisionType: "reject",
      rationale: "no",
    });
    expect(f.sobject.mock.calls[0]![0]).toBe("ohfy__Plan_Scenario_Decision__c");
    const payload = f.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toHaveProperty("ohfy__Decision_Id__c");
    expect(payload).toHaveProperty("ohfy__Scenario_Id__c");
  });

  it("throws on insert failure", async () => {
    const f = fakeConn({
      success: false,
      errors: [{ statusCode: "FIELD_CUSTOM_VALIDATION_EXCEPTION", message: "bad" }],
    });
    await expect(
      recordPlanScenarioDecision(f.conn, {
        scenarioId: "s1",
        decisionType: "accept",
        rationale: "x",
      }),
    ).rejects.toThrow(/insert failed/);
  });

  it("rejects empty scenarioId", async () => {
    const f = fakeConn({ success: true, id: "x" });
    await expect(
      recordPlanScenarioDecision(f.conn, {
        scenarioId: "",
        decisionType: "accept",
        rationale: "x",
      }),
    ).rejects.toThrow(/scenarioId/);
  });
});
