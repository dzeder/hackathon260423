import { describe, expect, it, vi, afterEach } from "vitest";
import { hashCustomer, log, traceTool } from "../src/tracing.js";

describe("tracing.traceTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the handler result and emits a tool_complete log with hashed customer id", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => {});
    const out = await traceTool(
      "apply_event",
      { customerId: "cust-yellowhammer" },
      async () => ({ ok: true }),
    );
    expect(out).toEqual({ ok: true });
    expect(info).toHaveBeenCalledTimes(1);
    const [fields, msg] = info.mock.calls[0]!;
    expect(msg).toBe("mcp tool");
    expect(fields).toMatchObject({
      mcp_event: "tool_complete",
      tool_name: "apply_event",
      ok: true,
    });
    expect((fields as { customer_id_hash: string }).customer_id_hash).toBe(
      hashCustomer("cust-yellowhammer"),
    );
  });

  it("logs unknown when customerId is missing", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => {});
    await traceTool("apply_event", {}, async () => 1);
    const [fields] = info.mock.calls[0]!;
    expect((fields as { customer_id_hash: string }).customer_id_hash).toBe("unknown");
  });

  it("propagates errors and emits a tool_error log", async () => {
    const error = vi.spyOn(log, "error").mockImplementation(() => {});
    await expect(
      traceTool("apply_event", { customerId: "x" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow(/boom/);
    expect(error).toHaveBeenCalledTimes(1);
    const [fields, msg] = error.mock.calls[0]!;
    expect(msg).toBe("mcp tool error");
    expect(fields).toMatchObject({ mcp_event: "tool_error", ok: false });
  });
});

describe("tracing.hashCustomer", () => {
  it("is deterministic and 16 hex chars", () => {
    expect(hashCustomer("cust-yellowhammer")).toBe(hashCustomer("cust-yellowhammer"));
    expect(hashCustomer("cust-yellowhammer")).toMatch(/^[a-f0-9]{16}$/);
  });
});
