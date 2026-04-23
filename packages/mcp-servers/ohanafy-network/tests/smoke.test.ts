import { describe, expect, it } from "vitest";
import { describeServer, server } from "../src/index.js";

describe("ohanafy-network MCP scaffold", () => {
  it("exports a server descriptor with expected tools", () => {
    expect(describeServer()).toMatchObject({
      name: "ohanafy-plan-mcp-network",
      tools: expect.arrayContaining(["query_peer_signals", "get_category_trend"]),
    });
  });

  it("has a stable version string", () => {
    expect(typeof server.version).toBe("string");
  });
});
