import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { query } from "./query";

const schema = z.object({ Id: z.string(), Amount: z.number() });

function fakeConn(records: unknown[], opts: { failFirstWith?: string } = {}) {
  let calls = 0;
  return {
    query: vi.fn(async (_soql: string) => {
      calls += 1;
      if (calls === 1 && opts.failFirstWith) {
        const e: Error & { errorCode?: string } = new Error("session expired");
        e.errorCode = opts.failFirstWith;
        throw e;
      }
      return { records, totalSize: records.length, done: true };
    }),
    oauth2: {
      refreshToken: vi.fn(async () => ({ accessToken: "new-token" })),
    },
    refreshToken: "stored-refresh-token",
  } as unknown as Parameters<typeof query>[0];
}

describe("query", () => {
  it("validates rows against the Zod schema and returns parsed objects", async () => {
    const conn = fakeConn([
      { Id: "001x", Amount: 42 },
      { Id: "001y", Amount: 7 },
    ]);
    const rows = await query(conn, "SELECT Id, Amount FROM Foo", schema);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ Id: "001x", Amount: 42 });
  });

  it("retries once on INVALID_SESSION_ID and refreshes the token", async () => {
    const conn = fakeConn([{ Id: "001z", Amount: 1 }], {
      failFirstWith: "INVALID_SESSION_ID",
    });
    const rows = await query(conn, "SELECT Id, Amount FROM Foo", schema);
    expect(rows).toHaveLength(1);
    // queryFn called twice: failure then success
    expect((conn.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    expect(
      (conn.oauth2.refreshToken as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(1);
  });

  it("propagates non-session errors", async () => {
    const conn = fakeConn([], { failFirstWith: "INVALID_FIELD" });
    await expect(query(conn, "SELECT bad FROM Foo", schema)).rejects.toThrow(
      /session expired/,
    );
  });

  it("rejects rows that don't match the schema", async () => {
    const conn = fakeConn([{ Id: "001a", Amount: "not-a-number" }]);
    await expect(query(conn, "SELECT Id, Amount FROM Foo", schema)).rejects.toThrow();
  });
});
