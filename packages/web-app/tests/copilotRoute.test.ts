import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/copilot/route";
import { PROMPT_VERSION, TOOL_SCHEMA_VERSION } from "@/lib/versions";

function postReq(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/copilot", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("/api/copilot response envelope", () => {
  let originalCustomerId: string | undefined;

  beforeEach(() => {
    originalCustomerId = process.env.SF_CUSTOMER_ID;
    process.env.SF_CUSTOMER_ID = "test-customer";
  });

  afterEach(() => {
    if (originalCustomerId === undefined) {
      delete process.env.SF_CUSTOMER_ID;
    } else {
      process.env.SF_CUSTOMER_ID = originalCustomerId;
    }
  });

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

describe("/api/copilot customer id resolution", () => {
  let originalCustomerId: string | undefined;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalCustomerId = process.env.SF_CUSTOMER_ID;
    originalApiKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.SF_CUSTOMER_ID;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalCustomerId === undefined) {
      delete process.env.SF_CUSTOMER_ID;
    } else {
      process.env.SF_CUSTOMER_ID = originalCustomerId;
    }
    if (originalApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    }
  });

  it("returns 503 when neither x-customer-id header nor SF_CUSTOMER_ID is set", async () => {
    const res = await POST(
      postReq({
        prompt: "hello",
        scenarioId: "demo",
        appliedEventIds: [],
      }),
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as Record<string, unknown>;
    expect(String(json.error)).toMatch(/customer id missing/i);
  });

  it("accepts the x-customer-id header when env is unset", async () => {
    const res = await POST(
      postReq(
        { prompt: "hello", scenarioId: "demo", appliedEventIds: [] },
        { "x-customer-id": "header-customer" },
      ),
    );
    expect(res.status).toBe(200);
  });

  it("falls back to SF_CUSTOMER_ID when no header is present", async () => {
    process.env.SF_CUSTOMER_ID = "env-customer";
    const res = await POST(
      postReq({
        prompt: "hello",
        scenarioId: "demo",
        appliedEventIds: [],
      }),
    );
    expect(res.status).toBe(200);
  });

  it("does not silently default to a yellowhammer bucket", async () => {
    const res = await POST(
      postReq({
        prompt: "hello",
        scenarioId: "demo",
        appliedEventIds: [],
      }),
    );
    expect(res.status).not.toBe(200);
  });
});
