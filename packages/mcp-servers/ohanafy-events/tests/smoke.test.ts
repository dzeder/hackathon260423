import { describe, expect, it } from "vitest";
import { describeServer, server } from "../src/index.js";

describe("ohanafy-events MCP scaffold", () => {
  it("exports a server descriptor with expected tools", () => {
    expect(describeServer()).toMatchObject({
      name: "ohanafy-plan-mcp-events",
      tools: expect.arrayContaining(["search_events", "get_event"]),
    });
  });

  it("has a stable version string", () => {
    expect(typeof server.version).toBe("string");
  });
});
