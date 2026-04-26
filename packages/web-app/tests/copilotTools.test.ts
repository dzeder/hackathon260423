import { describe, it, expect, beforeEach } from "vitest";
import { TOOL_REGISTRY, dispatch, toAnthropicTools } from "@/lib/copilotTools";

describe("copilotTools", () => {
  beforeEach(() => {
    // Ensure SF client is NOT configured so query_salesforce returns canned.
    delete process.env.SF_LOGIN_URL;
    delete process.env.SF_CONSUMER_KEY;
    delete process.env.SF_CONSUMER_SECRET;
  });

  it("exports an Anthropic-shaped tool schema for every tool", () => {
    const schemas = toAnthropicTools();
    const names = schemas.map((s) => s.name);
    expect(names).toContain("snapshot");
    expect(names).toContain("apply_event");
    expect(names).toContain("search_events");
    expect(names).toContain("query_salesforce");
    for (const s of schemas) {
      expect(typeof s.description).toBe("string");
      expect(s.input_schema).toBeDefined();
      expect(typeof s.input_schema).toBe("object");
    }
  });

  it("registry exposes the same tool names as the Anthropic schema list", () => {
    const registryKeys = Object.keys(TOOL_REGISTRY).sort();
    const schemaNames = toAnthropicTools()
      .map((s) => s.name)
      .sort();
    expect(registryKeys).toEqual(schemaNames);
  });

  it("dispatch('snapshot') with no events returns baseline totals", async () => {
    const result = await dispatch("snapshot", { eventIds: [] });
    expect(result.ok).toBe(true);
    const body = JSON.parse(result.contentJson);
    expect(body.baseline).toBeDefined();
    expect(body.scenario).toBeDefined();
    expect(body.scenario.revenue).toEqual(body.baseline.revenue);
  });

  it("dispatch('search_events') filters by category", async () => {
    const result = await dispatch("search_events", { category: "sports" });
    expect(result.ok).toBe(true);
    const body = JSON.parse(result.contentJson);
    expect(Array.isArray(body.events)).toBe(true);
    for (const e of body.events) {
      expect(e.category).toBe("sports");
    }
  });

  it("dispatch('get_event') returns error for unknown id", async () => {
    const result = await dispatch("get_event", { id: "nope-not-here" });
    expect(result.ok).toBe(true); // Graceful error is a success from dispatch's POV
    const body = JSON.parse(result.contentJson);
    expect(body.error).toMatch(/not found/);
    expect(Array.isArray(body.availableIds)).toBe(true);
  });

  it("dispatch('query_salesforce') returns canned fixtures when SF not configured", async () => {
    const result = await dispatch("query_salesforce", {
      soql: "SELECT Id, Name FROM Account LIMIT 5",
    });
    expect(result.ok).toBe(true);
    const body = JSON.parse(result.contentJson);
    expect(body.stubbed).toBe(true);
    expect(Array.isArray(body.records)).toBe(true);
    expect(body.records.length).toBeGreaterThan(0);
  });

  it("dispatch of unknown tool returns graceful error", async () => {
    const result = await dispatch("rm_rf_slash", {});
    expect(result.ok).toBe(false);
    const body = JSON.parse(result.contentJson);
    expect(body.error).toMatch(/unknown tool/);
  });

  it("dispatch returns graceful error on Zod validation failure", async () => {
    const result = await dispatch("snapshot", { eventIds: "not-an-array" });
    expect(result.ok).toBe(false);
    const body = JSON.parse(result.contentJson);
    expect(body.error).toBeDefined();
  });
});
