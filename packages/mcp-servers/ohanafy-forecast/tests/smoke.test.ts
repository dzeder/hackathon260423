import { describe, expect, it } from "vitest";
import { describeServer, server } from "../src/index.js";

describe("ohanafy-forecast MCP scaffold", () => {
  it("exports a server descriptor with expected tools", () => {
    expect(describeServer()).toMatchObject({
      name: "ohanafy-plan-mcp-forecast",
      tools: expect.arrayContaining(["apply_event", "run_three_statement"]),
    });
  });

  it("has a stable version string", () => {
    expect(typeof server.version).toBe("string");
  });
});
