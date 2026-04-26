import { describe, expect, it, vi, afterEach } from "vitest";
import { hashCustomer, log, traceTool } from "../src/tracing.js";

describe("ohanafy-memory tracing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wraps tool calls and emits tool_complete with tool_name + customer hash", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => {});
    const out = await traceTool("record_decision", { customerId: "c2" }, async () => "ok");
    expect(out).toBe("ok");
    const [fields] = info.mock.calls[0]!;
    expect(fields).toMatchObject({
      mcp_event: "tool_complete",
      tool_name: "record_decision",
      customer_id_hash: hashCustomer("c2"),
    });
  });
});
