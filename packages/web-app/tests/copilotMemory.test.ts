import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

// Single isolated DB for all tests in this file — far faster than wiping per
// test, and each test scopes its data by a unique customer_id so there's no
// interference. Cleanup runs once at the end.
const DB_DIR = resolve(process.cwd(), "data-test");
const DB_PATH = resolve(DB_DIR, `copilot-test-${process.pid}.db`);
process.env.TURSO_DATABASE_URL = `file:${DB_PATH}`;

import {
  appendTurn,
  getDailyUsage,
  getOrCreateActive,
  incrementUsage,
  listThreads,
  loadHistory,
  loadHistoryAsApiMessages,
  loadHistoryForDisplay,
  startNewThread,
  type Scope,
} from "@/lib/copilotMemory";

beforeAll(() => {
  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
});

afterAll(() => {
  // best-effort cleanup — libsql may still hold a file handle, which is fine.
  try {
    if (existsSync(DB_DIR)) rmSync(DB_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function freshScope(): Scope {
  return { customerId: `cust-${randomUUID()}`, userId: `user-${randomUUID()}` };
}

describe("copilotMemory", () => {
  it("startNewThread creates + getOrCreateActive returns the same thread", async () => {
    const scope = freshScope();
    const id = await startNewThread(scope);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const resolved = await getOrCreateActive(scope);
    expect(resolved).toBe(id);
  });

  it("appendTurn persists text + blocks + titles from first user turn", async () => {
    const scope = freshScope();
    const convId = await getOrCreateActive(scope);
    await appendTurn(convId, scope, [
      { role: "user", content: "What happens in a hurricane?" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Running apply_event..." },
          {
            type: "tool_use",
            id: "tu_1",
            name: "apply_event",
            input: { events: [] },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu_1",
            content: '{"revenue":1234}',
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "final answer" }],
      },
    ]);

    const rows = await loadHistory(convId, scope);
    expect(rows).toHaveLength(4);
    expect(rows[0].contentFormat).toBe("text");
    expect(rows[1].contentFormat).toBe("blocks");
    expect(rows[2].contentFormat).toBe("blocks");
    expect(rows[3].contentFormat).toBe("blocks");

    const threads = await listThreads(scope);
    expect(threads[0].title).toBe("What happens in a hurricane?");
    expect(threads[0].messageCount).toBe(4);
  });

  it("loadHistoryAsApiMessages round-trips tool_use blocks including id", async () => {
    const scope = freshScope();
    const convId = await getOrCreateActive(scope);
    await appendTurn(convId, scope, [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "thinking" },
          {
            type: "tool_use",
            id: "tu_42",
            name: "snapshot",
            input: { eventIds: [] },
          },
        ],
      },
    ]);

    const replay = await loadHistoryAsApiMessages(convId, scope);
    expect(replay).toHaveLength(2);
    const assistantContent = replay[1].content as Array<Record<string, unknown>>;
    expect(assistantContent[1].type).toBe("tool_use");
    expect(assistantContent[1].id).toBe("tu_42");
    expect(assistantContent[1].name).toBe("snapshot");
  });

  it("loadHistoryForDisplay flattens blocks to text for UI rendering", async () => {
    const scope = freshScope();
    const convId = await getOrCreateActive(scope);
    await appendTurn(convId, scope, [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "hello!" },
          { type: "tool_use", id: "x", name: "snapshot", input: {} },
        ],
      },
    ]);
    const display = await loadHistoryForDisplay(convId, scope);
    expect(display[0].text).toBe("hi");
    expect(display[1].text).toBe("hello!");
  });

  it("different customers are isolated — one can't read the other's conversations", async () => {
    const scopeA = freshScope();
    const scopeB = { ...freshScope(), userId: scopeA.userId };
    const idA = await startNewThread(scopeA);
    await appendTurn(idA, scopeA, [{ role: "user", content: "cust A" }]);

    const threadsB = await listThreads(scopeB);
    expect(threadsB).toHaveLength(0);

    const historyB = await loadHistory(idA, scopeB);
    expect(historyB).toHaveLength(0);
  });

  it("usage_daily counters increment atomically per customer+user", async () => {
    const scope = freshScope();
    const otherScope = freshScope();
    await incrementUsage(scope, 0.05);
    await incrementUsage(scope, 0.03);
    const usage = await getDailyUsage(scope);
    expect(usage.turnCount).toBe(2);
    expect(usage.costUsd).toBeCloseTo(0.08, 4);

    const usageOther = await getDailyUsage(otherScope);
    expect(usageOther.turnCount).toBe(0);
  });
});
