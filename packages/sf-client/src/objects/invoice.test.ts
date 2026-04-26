import { describe, it, expect, vi } from "vitest";
import { getMonthlyInvoiceRollup } from "./invoice";

function fakeConn(records: unknown[]) {
  return {
    query: vi.fn(async () => ({ records, totalSize: records.length, done: true })),
    oauth2: { refreshToken: vi.fn() },
    refreshToken: "x",
  } as unknown as Parameters<typeof getMonthlyInvoiceRollup>[0];
}

describe("getMonthlyInvoiceRollup", () => {
  it("formats month as YYYY-MM and coalesces null sums to 0", async () => {
    const conn = fakeConn([
      { yr: 2026, mth: 5, rev: 4_820_000, cases: 66_944.44 },
      { yr: 2026, mth: 6, rev: null, cases: null },
    ]);
    const rows = await getMonthlyInvoiceRollup(conn, "2026-05-01", "2026-06-30");
    expect(rows).toEqual([
      { month: "2026-05", revenueUsd: 4_820_000, caseEquivalents: 66_944.44 },
      { month: "2026-06", revenueUsd: 0, caseEquivalents: 0 },
    ]);
  });

  it("zero-pads single-digit months", async () => {
    const conn = fakeConn([{ yr: 2026, mth: 7, rev: 1000, cases: 10 }]);
    const rows = await getMonthlyInvoiceRollup(conn, "2026-07-01", "2026-07-31");
    expect(rows[0].month).toBe("2026-07");
  });

  it("includes the date range in the SOQL", async () => {
    const conn = fakeConn([]);
    await getMonthlyInvoiceRollup(conn, "2026-05-01", "2026-10-31");
    const soql = (conn.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(soql).toContain("ohfy__Invoice_Date__c >= 2026-05-01");
    expect(soql).toContain("ohfy__Invoice_Date__c <= 2026-10-31");
  });
});
