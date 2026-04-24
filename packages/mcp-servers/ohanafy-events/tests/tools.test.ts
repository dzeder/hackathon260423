import { describe, expect, it } from "vitest";
import {
  getEventTool,
  searchEventsTool,
  suggestEventsTool,
  TOOL_REGISTRY,
} from "../src/tools.js";

const TENANT = "cust-yellowhammer";

describe("ohanafy-events tool handlers", () => {
  it("exposes the four expected tools", () => {
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([
      "classify_scenario",
      "get_event",
      "search_events",
      "suggest_events",
    ]);
  });

  it("search_events without filters returns the full catalog", async () => {
    const out = await searchEventsTool({ customerId: TENANT });
    expect(out.count).toBeGreaterThan(5);
    expect(out.events.every((e) => typeof e.id === "string")).toBe(true);
  });

  it("search_events by category narrows to that class", async () => {
    const out = await searchEventsTool({ customerId: TENANT, category: "sports" });
    expect(out.events.every((e) => e.category === "sports")).toBe(true);
  });

  it("get_event returns the iron-bowl template", async () => {
    const out = await getEventTool({ customerId: TENANT, id: "iron-bowl-2026" });
    expect(out.event.label).toMatch(/Iron Bowl/);
  });

  it("get_event throws for unknown id", async () => {
    await expect(
      getEventTool({ customerId: TENANT, id: "does-not-exist" }),
    ).rejects.toThrow(/not found/);
  });

  it("suggest_events ranks 2026-10 events first for an October-heavy horizon", async () => {
    const out = await suggestEventsTool({
      customerId: TENANT,
      months: ["2026-10"],
      avgRevenue: 4800,
      region: "AL",
      limit: 3,
    });
    expect(out.count).toBeGreaterThan(0);
    expect(out.suggestions[0].event.month).toBe("2026-10");
  });

  it("suggest_events rejects malformed month via Zod", async () => {
    await expect(
      suggestEventsTool({ customerId: TENANT, months: ["Oct 2026"], avgRevenue: 100 }),
    ).rejects.toThrow();
  });

  it("search_events rejects missing customerId", async () => {
    await expect(searchEventsTool({})).rejects.toThrow(/customerId/);
  });
});
