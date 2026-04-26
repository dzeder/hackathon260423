import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPlanEventTemplates } from "./eventTemplate";

function fakeConn(records: unknown[]) {
  return {
    query: vi.fn(async () => ({ records, totalSize: records.length, done: true })),
    oauth2: { refreshToken: vi.fn() },
    refreshToken: "x",
  } as unknown as Parameters<typeof getPlanEventTemplates>[0];
}

describe("getPlanEventTemplates", () => {
  const original = process.env.OHFY_PLAN_NS_PREFIX;
  beforeEach(() => {
    delete process.env.OHFY_PLAN_NS_PREFIX;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.OHFY_PLAN_NS_PREFIX;
    else process.env.OHFY_PLAN_NS_PREFIX = original;
  });

  it("maps unprefixed columns to the camelCase shape", async () => {
    const conn = fakeConn([
      {
        Event_Id__c: "iron-bowl-2026",
        Label__c: "Iron Bowl",
        Category__c: "sports",
        Region__c: "AL",
        Season__c: "fall",
        Month__c: "2026-10",
        Revenue_Delta_Pct__c: 9.5,
        COGS_Delta_Pct__c: 1.0,
        OpEx_Delta_Abs__c: 5_000,
        Source__c: "CFBD",
        Notes__c: null,
      },
    ]);
    const rows = await getPlanEventTemplates(conn);
    expect(rows).toEqual([
      {
        id: "iron-bowl-2026",
        label: "Iron Bowl",
        category: "sports",
        region: "AL",
        season: "fall",
        month: "2026-10",
        revenueDeltaPct: 9.5,
        cogsDeltaPct: 1.0,
        opexDeltaAbs: 5_000,
        source: "CFBD",
        notes: null,
      },
    ]);
  });

  it("applies the namespace prefix to both SELECT and FROM when set", async () => {
    process.env.OHFY_PLAN_NS_PREFIX = "ohfy__";
    const conn = fakeConn([]);
    await getPlanEventTemplates(conn);
    const soql = (conn.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(soql).toContain("FROM ohfy__Plan_Event_Template__c");
    expect(soql).toContain("ohfy__Event_Id__c");
    expect(soql).toContain("ohfy__Revenue_Delta_Pct__c");
  });

  it("adds region/category WHERE clauses with escaped literals", async () => {
    const conn = fakeConn([]);
    await getPlanEventTemplates(conn, { region: "AL", category: "sports" });
    const soql = (conn.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(soql).toContain("Region__c = 'AL'");
    expect(soql).toContain("Category__c = 'sports'");
  });
});
