import { describe, it, expect, beforeEach, vi } from "vitest";

// Memory lives in Salesforce now. We mock the salesforceClient module so the
// memory tests assert on the request shape and exercise the response-handling
// logic without needing a live SF org.

vi.mock("@/lib/salesforceClient", () => ({
  isSalesforceConfigured: () => true,
  callApexRest: vi.fn(),
}));

import { callApexRest } from "@/lib/salesforceClient";
import {
  appendTurn,
  getDailyUsage,
  getOrCreateActive,
  incrementUsage,
  isPersistenceAvailable,
  listThreads,
  loadHistory,
  loadHistoryAsApiMessages,
  loadHistoryForDisplay,
  startNewThread,
  type Scope,
} from "@/lib/copilotMemory";

const mockedCall = callApexRest as unknown as ReturnType<typeof vi.fn>;

const scope: Scope = { customerId: "cust-test", userId: "user-1" };

beforeEach(() => {
  mockedCall.mockReset();
});

describe("copilotMemory (Salesforce-backed)", () => {
  it("isPersistenceAvailable proxies to isSalesforceConfigured", () => {
    expect(isPersistenceAvailable()).toBe(true);
  });

  it("startNewThread sends action=startNewThread and returns conversation id", async () => {
    mockedCall.mockResolvedValue({
      ok: true,
      data: { conversationId: "conv-1" },
    });
    const id = await startNewThread(scope);
    expect(id).toBe("conv-1");
    expect(mockedCall).toHaveBeenCalledWith("/plan/memory", {
      action: "startNewThread",
      customerId: "cust-test",
      userId: "user-1",
    });
  });

  it("getOrCreateActive sends correct action", async () => {
    mockedCall.mockResolvedValue({
      ok: true,
      data: { conversationId: "conv-existing" },
    });
    const id = await getOrCreateActive(scope);
    expect(id).toBe("conv-existing");
    expect(mockedCall.mock.calls[0][1]).toMatchObject({
      action: "getOrCreateActive",
      customerId: "cust-test",
      userId: "user-1",
    });
  });

  it("listThreads passes limit through and shapes response", async () => {
    mockedCall.mockResolvedValue({
      ok: true,
      data: {
        threads: [
          {
            id: "t1",
            title: "first",
            lastActivityAt: 1000,
            messageCount: 4,
          },
          {
            id: "t2",
            title: null,
            lastActivityAt: null,
            messageCount: 0,
          },
        ],
      },
    });
    const out = await listThreads(scope, 50);
    expect(mockedCall.mock.calls[0][1]).toMatchObject({
      action: "listThreads",
      limitN: 50,
    });
    expect(out).toHaveLength(2);
    expect(out[1].lastActivityAt).toBe(0);
  });

  it("loadHistory shapes Salesforce rows into StoredMessage", async () => {
    mockedCall.mockResolvedValue({
      ok: true,
      data: {
        messages: [
          {
            id: "m1",
            conversationId: "c1",
            customerId: "cust-test",
            seq: 1,
            role: "user",
            contentFormat: "text",
            content: "hi",
            createdAt: 100,
          },
          {
            id: "m2",
            conversationId: "c1",
            customerId: "cust-test",
            seq: 2,
            role: "assistant",
            contentFormat: "blocks",
            content: '[{"type":"text","text":"hello"}]',
            createdAt: 101,
          },
        ],
      },
    });
    const out = await loadHistory("c1", scope);
    expect(out).toHaveLength(2);
    expect(out[0].role).toBe("user");
    expect(out[1].contentFormat).toBe("blocks");
  });

  it("loadHistoryAsApiMessages round-trips tool_use blocks including id", async () => {
    mockedCall.mockResolvedValue({
      ok: true,
      data: {
        messages: [
          {
            id: "m1",
            conversationId: "c1",
            customerId: "cust-test",
            seq: 1,
            role: "user",
            contentFormat: "text",
            content: "hi",
            createdAt: 100,
          },
          {
            id: "m2",
            conversationId: "c1",
            customerId: "cust-test",
            seq: 2,
            role: "assistant",
            contentFormat: "blocks",
            content: JSON.stringify([
              { type: "text", text: "thinking" },
              {
                type: "tool_use",
                id: "tu_42",
                name: "snapshot",
                input: { eventIds: [] },
              },
            ]),
            createdAt: 101,
          },
        ],
      },
    });
    const replay = await loadHistoryAsApiMessages("c1", scope);
    const assistantContent = replay[1].content as Array<Record<string, unknown>>;
    expect(assistantContent[1].type).toBe("tool_use");
    expect(assistantContent[1].id).toBe("tu_42");
    expect(assistantContent[1].name).toBe("snapshot");
  });

  it("loadHistoryAsApiMessages degrades corrupt blocks to text", async () => {
    mockedCall.mockResolvedValue({
      ok: true,
      data: {
        messages: [
          {
            id: "m1",
            conversationId: "c1",
            customerId: "cust-test",
            seq: 1,
            role: "assistant",
            contentFormat: "blocks",
            content: "not valid json",
            createdAt: 1,
          },
        ],
      },
    });
    const replay = await loadHistoryAsApiMessages("c1", scope);
    const content = replay[0].content as Array<Record<string, unknown>>;
    expect(content[0].type).toBe("text");
    expect(content[0].text).toBe("not valid json");
  });

  it("loadHistoryForDisplay flattens block arrays to text", async () => {
    mockedCall.mockResolvedValue({
      ok: true,
      data: {
        messages: [
          {
            id: "m1",
            conversationId: "c1",
            customerId: "cust-test",
            seq: 1,
            role: "assistant",
            contentFormat: "blocks",
            content: JSON.stringify([
              { type: "text", text: "hello!" },
              { type: "tool_use", id: "x", name: "snapshot", input: {} },
            ]),
            createdAt: 1,
          },
        ],
      },
    });
    const display = await loadHistoryForDisplay("c1", scope);
    expect(display[0].text).toBe("hello!");
  });

  it("appendTurn serializes block content as JSON before shipping", async () => {
    mockedCall.mockResolvedValue({ ok: true, data: { inserted: 2 } });
    await appendTurn("c1", scope, [
      { role: "user", content: "what if" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "running" },
          { type: "tool_use", id: "tu_1", name: "snapshot", input: {} },
        ],
      },
    ]);
    const sent = mockedCall.mock.calls[0][1] as {
      entries: Array<{ contentFormat: string; content: string }>;
    };
    expect(sent.entries[0].contentFormat).toBe("text");
    expect(sent.entries[0].content).toBe("what if");
    expect(sent.entries[1].contentFormat).toBe("blocks");
    const parsed = JSON.parse(sent.entries[1].content);
    expect(parsed[1].type).toBe("tool_use");
  });

  it("appendTurn surfaces server errors", async () => {
    mockedCall.mockResolvedValue({ ok: false, error: "bad payload" });
    await expect(
      appendTurn("c1", scope, [{ role: "user", content: "x" }]),
    ).rejects.toThrow(/appendTurn failed: bad payload/);
  });

  // Cross-customer isolation: every memory operation must thread the scope's
  // customerId through to the Apex side. A regression here (e.g. a refactor
  // that drops the field, or a hard-coded fallback) would let one customer's
  // Vercel process write into another customer's bucket.
  describe("cross-customer isolation", () => {
    it("every operation embeds scope.customerId in the Apex payload", async () => {
      const otherScope: Scope = { customerId: "cust-other", userId: "user-9" };
      mockedCall.mockResolvedValue({ ok: true, data: { conversationId: "c", inserted: 0, threads: [], messages: [], turnCount: 0, costUsd: 0 } });

      await startNewThread(otherScope);
      await getOrCreateActive(otherScope);
      await listThreads(otherScope, 10);
      await loadHistory("c1", otherScope);
      await appendTurn("c1", otherScope, [{ role: "user", content: "hi" }]);
      await getDailyUsage(otherScope);
      await incrementUsage(otherScope, 0.01);

      const everyCallCarriesCustomerId = mockedCall.mock.calls.every((call) => {
        const payload = call[1] as Record<string, unknown>;
        return payload.customerId === "cust-other";
      });
      expect(everyCallCarriesCustomerId).toBe(true);
    });

    it("surfaces the Apex bind-rejection error to the caller", async () => {
      // Simulates OhfyPlanMemoryStore rejecting a request because the
      // configured Customer_Id__c does not match what the web app sent.
      mockedCall.mockResolvedValue({
        ok: false,
        error: "customerId does not match this org's bound customer",
      });
      await expect(
        appendTurn("c1", scope, [{ role: "user", content: "leak" }]),
      ).rejects.toThrow(/does not match/);
    });

    it("never silently substitutes a default customerId on a missing scope field", async () => {
      // Defense against a regression where someone defaults customerId in
      // copilotMemory. The Scope type makes customerId required, so the
      // call should propagate whatever (even an empty string) was given.
      mockedCall.mockResolvedValue({ ok: true, data: { conversationId: "c" } });
      const blankScope = { customerId: "", userId: "u" } as Scope;
      await startNewThread(blankScope);
      const sent = mockedCall.mock.calls[0][1] as Record<string, unknown>;
      expect(sent.customerId).toBe("");
      // The Apex side then enforces the non-blank check; this test guards
      // the web-app contract that we never invent an id.
    });
  });

  it("getDailyUsage / incrementUsage hit the right actions", async () => {
    mockedCall.mockResolvedValueOnce({
      ok: true,
      data: { ok: true },
    });
    await incrementUsage(scope, 0.05);
    expect(mockedCall.mock.calls[0][1]).toMatchObject({
      action: "incrementUsage",
      costUsd: 0.05,
    });

    mockedCall.mockResolvedValueOnce({
      ok: true,
      data: { turnCount: 3, costUsd: 0.12 },
    });
    const usage = await getDailyUsage(scope);
    expect(mockedCall.mock.calls[1][1]).toMatchObject({
      action: "getDailyUsage",
    });
    expect(usage.turnCount).toBe(3);
    expect(usage.costUsd).toBeCloseTo(0.12, 4);
  });
});
