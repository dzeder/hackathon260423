import { afterEach, describe, expect, it } from "vitest";
import {
  __resetAgentConfigCacheForTest,
  getRateLimit,
  isToolEnabled,
  listToolConfigs,
} from "@/lib/agentConfig";

afterEach(() => __resetAgentConfigCacheForTest());

describe("agentConfig", () => {
  it("returns all 11 default ALLOWED_TOOLS rows", () => {
    const rows = listToolConfigs();
    const tools = rows.map((r) => r.toolName).sort();
    expect(tools).toEqual([
      "apply_event",
      "compare_scenarios",
      "get_category_trend",
      "get_event",
      "list_decisions",
      "query_peer_signals",
      "record_decision",
      "run_three_statement",
      "search_events",
      "snapshot",
      "suggest_events",
    ]);
  });

  it("every seeded tool is enabled by default", () => {
    for (const row of listToolConfigs()) {
      expect(row.enabled).toBe(true);
    }
  });

  it("default-allows unknown tools (matches Apex behavior)", () => {
    expect(isToolEnabled("not_a_real_tool")).toBe(true);
  });

  it("returns null rate limit for unconfigured seeds", () => {
    expect(getRateLimit("apply_event")).toBeNull();
  });
});
