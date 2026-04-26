import { describe, expect, it, vi, afterEach } from "vitest";
import { hashCustomer, log, traceTool } from "../src/tracing.js";

describe("ohanafy-events tracing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wraps tool calls and emits tool_complete with tool_name + customer hash", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => {});
    const out = await traceTool("search_events", { customerId: "c1" }, async () => 42);
    expect(out).toBe(42);
    const [fields] = info.mock.calls[0]!;
    expect(fields).toMatchObject({
      mcp_event: "tool_complete",
      tool_name: "search_events",
      customer_id_hash: hashCustomer("c1"),
    });
  });
});
