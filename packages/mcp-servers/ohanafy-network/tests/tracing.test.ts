import { describe, expect, it, vi, afterEach } from "vitest";
import { hashCustomer, log, traceTool } from "../src/tracing.js";

const SERVICE_NAME = "ohanafy-plan-mcp-network";
const TOOL_NAME = "query_peer_signals";

describe("ohanafy-network tracing.traceTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the handler result and emits a tool_complete log with hashed customer id", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => {});
    const out = await traceTool(TOOL_NAME, { customerId: "c3" }, async () => null);
    expect(out).toBeNull();
    expect(info).toHaveBeenCalledTimes(1);
    const [fields, msg] = info.mock.calls[0]!;
    expect(msg).toBe("mcp tool");
    expect(fields).toMatchObject({
      mcp_event: "tool_complete",
      tool_name: TOOL_NAME,
      customer_id_hash: hashCustomer("c3"),
      ok: true,
    });
  });

  it("logs unknown when customerId is missing", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => {});
    await traceTool(TOOL_NAME, {}, async () => 1);
    const [fields] = info.mock.calls[0]!;
    expect((fields as { customer_id_hash: string }).customer_id_hash).toBe("unknown");
  });

  it("propagates errors and emits a tool_error log", async () => {
    const error = vi.spyOn(log, "error").mockImplementation(() => {});
    await expect(
      traceTool(TOOL_NAME, { customerId: "x" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow(/boom/);
    expect(error).toHaveBeenCalledTimes(1);
    const [fields, msg] = error.mock.calls[0]!;
    expect(msg).toBe("mcp tool error");
    expect(fields).toMatchObject({ mcp_event: "tool_error", ok: false });
  });

  it("emits a non-negative ms duration on the tool_complete log", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => {});
    await traceTool(TOOL_NAME, { customerId: "x" }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      return 0;
    });
    const [fields] = info.mock.calls[0]!;
    const ms = (fields as { ms: number }).ms;
    expect(typeof ms).toBe("number");
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});

describe("ohanafy-network tracing.log base fields", () => {
  it("logger is configured with this MCP server's service name", () => {
    const bindings = log.bindings();
    expect(bindings.service).toBe(SERVICE_NAME);
    expect(bindings.track).toBe("B");
  });
});

describe("ohanafy-network tracing.hashCustomer", () => {
  it("is deterministic and 16 hex chars", () => {
    expect(hashCustomer("cust-yellowhammer")).toBe(hashCustomer("cust-yellowhammer"));
    expect(hashCustomer("cust-yellowhammer")).toMatch(/^[a-f0-9]{16}$/);
  });
});
