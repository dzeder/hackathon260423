import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/copilot/route";
import { PROMPT_VERSION, TOOL_SCHEMA_VERSION } from "@/lib/versions";

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/copilot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/copilot response envelope", () => {
  it("stamps promptVersion and toolSchemaVersion on the canned response", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await POST(
        postReq({
          prompt: "what happens if there is a hurricane?",
          scenarioId: "demo",
          appliedEventIds: [],
        }),
      );
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.source).toBe("canned");
      expect(json.promptVersion).toBe(PROMPT_VERSION);
      expect(json.toolSchemaVersion).toBe(TOOL_SCHEMA_VERSION);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("returns 400 for an invalid body", async () => {
    const res = await POST(postReq({ prompt: "", scenarioId: "" }));
    expect(res.status).toBe(400);
  });
});
