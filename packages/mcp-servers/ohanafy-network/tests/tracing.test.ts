import { describe, expect, it, vi, afterEach } from "vitest";
import { hashCustomer, log, traceTool } from "../src/tracing.js";

describe("ohanafy-network tracing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wraps tool calls and emits tool_complete with tool_name + customer hash", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => {});
    const out = await traceTool("query_peer_signals", { customerId: "c3" }, async () => null);
    expect(out).toBeNull();
    const [fields] = info.mock.calls[0]!;
    expect(fields).toMatchObject({
      mcp_event: "tool_complete",
      tool_name: "query_peer_signals",
      customer_id_hash: hashCustomer("c3"),
    });
  });
});
