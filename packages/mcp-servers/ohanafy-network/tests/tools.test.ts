import { describe, expect, it } from "vitest";
import {
  getCategoryTrendTool,
  queryPeerSignalsTool,
  TOOL_REGISTRY,
} from "../src/tools.js";

describe("ohanafy-network tool handlers", () => {
  it("exposes the two expected tools", () => {
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([
      "get_category_trend",
      "query_peer_signals",
    ]);
  });

  it("query_peer_signals returns on-premise 13w delta non-redacted", async () => {
    const out = await queryPeerSignalsTool({ segmentId: "on_premise", window: "13w" });
    expect(out.count).toBe(1);
    expect(out.signals[0].redacted).toBe(false);
    expect(out.signals[0].trend.volumeDeltaPct).toBeCloseTo(2.2, 5);
  });

  it("query_peer_signals without a filter returns all segments", async () => {
    const out = await queryPeerSignalsTool({ window: "4w" });
    expect(out.count).toBeGreaterThanOrEqual(3);
  });

  it("query_peer_signals rejects invalid window via Zod", async () => {
    await expect(queryPeerSignalsTool({ window: "99d" })).rejects.toThrow();
  });

  it("get_category_trend returns energy-drink ytd volume delta", async () => {
    const out = await getCategoryTrendTool({ skuFamily: "energy-drink", window: "ytd" });
    expect(out.signal.volumeDeltaPct).toBeCloseTo(6.2, 5);
    expect(out.signal.redacted).toBe(false);
  });

  it("get_category_trend rejects empty skuFamily via Zod", async () => {
    await expect(getCategoryTrendTool({ skuFamily: "", window: "13w" })).rejects.toThrow();
  });
});
