import { describe, expect, it } from "vitest";
import { describeServer, server } from "../src/index.js";

describe("ohanafy-memory MCP scaffold", () => {
  it("exports a server descriptor with expected tools", () => {
    expect(describeServer()).toMatchObject({
      name: "ohanafy-plan-mcp-memory",
      tools: expect.arrayContaining(["record_decision", "list_decisions"]),
    });
  });

  it("has a stable version string", () => {
    expect(typeof server.version).toBe("string");
  });
});
