import { callApexRest, isSalesforceConfigured } from "@/lib/salesforceClient";
import { logError } from "@/lib/copilotLog";

/*
 * Copilot memory store — Salesforce-native via OhfyPlanMemoryStore Apex REST.
 *
 * The customer's Salesforce org is the source of truth for conversation
 * memory. The web app calls back via the same Connected App used for
 * /plan/soql; data lives in Plan_Conversation__c, Plan_Message__c, and
 * Plan_Usage_Daily__c.
 *
 * Why Salesforce-as-memory:
 *   - Customer data residency stays inside their org.
 *   - One vendor (no separate database service to provision).
 *   - SF admin tools (audit, retention, GDPR delete) work natively.
 *
 * Tradeoff: each memory operation is a Vercel→SF round-trip (~200-400ms)
 * vs. a local DB query (~5ms). Acceptable for a thoughtful CFO copilot.
 */

const MEMORY_ENDPOINT = "/plan/memory";

export type Role = "user" | "assistant";
export type ContentFormat = "text" | "blocks";

export type Conversation = {
  id: string;
  customerId: string;
  userId: string;
  title: string | null;
  lastActivityAt: number;
};

export type StoredMessage = {
  id: string;
  conversationId: string;
  customerId: string;
  seq: number;
  role: Role;
  contentFormat: ContentFormat;
  content: string;
  createdAt: number;
};

export type ApiMessage = {
  role: Role;
  content: string | Array<Record<string, unknown>>;
};

export type ThreadSummary = {
  id: string;
  title: string | null;
  lastActivityAt: number;
  messageCount: number;
};

export type TurnEntry = {
  role: Role;
  content: string | Array<Record<string, unknown>>;
};

export type Scope = {
  customerId: string;
  userId: string;
};

/**
 * Returns true when the Connected App is configured. When false, the route
 * skips persistence and serves stateless turns. Mirrors the same predicate
 * the SOQL tool uses, so a missing SF_CUSTOMER_KEY also disables memory.
 */
export function isPersistenceAvailable(): boolean {
  return isSalesforceConfigured();
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

async function callMemory<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const envelope = await callApexRest<Envelope<T>>(MEMORY_ENDPOINT, {
    action,
    ...payload,
  });
  if (!envelope.ok) {
    throw new Error(`memory.${action} failed: ${envelope.error}`);
  }
  return envelope.data;
}

// ---- conversations ----

export async function startNewThread(scope: Scope): Promise<string> {
  const data = await callMemory<{ conversationId: string }>("startNewThread", scope);
  return data.conversationId;
}

export async function getOrCreateActive(scope: Scope): Promise<string> {
  const data = await callMemory<{ conversationId: string }>("getOrCreateActive", scope);
  return data.conversationId;
}

export async function listThreads(scope: Scope, limit = 25): Promise<ThreadSummary[]> {
  type Row = {
    id: string;
    title: string | null;
    lastActivityAt: number | null;
    messageCount: number;
  };
  const data = await callMemory<{ threads: Row[] }>("listThreads", {
    ...scope,
    limitN: limit,
  });
  return data.threads.map((t) => ({
    id: t.id,
    title: t.title,
    lastActivityAt: t.lastActivityAt ?? 0,
    messageCount: t.messageCount,
  }));
}

// ---- messages ----

export async function loadHistory(
  conversationId: string,
  scope: Scope,
  limit = 100,
): Promise<StoredMessage[]> {
  type Row = {
    id: string;
    conversationId: string;
    customerId: string;
    seq: number;
    role: string;
    contentFormat: string;
    content: string;
    createdAt: number;
  };
  const data = await callMemory<{ messages: Row[] }>("loadHistory", {
    customerId: scope.customerId,
    conversationId,
    limitN: limit,
  });
  return data.messages.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    customerId: m.customerId,
    seq: m.seq,
    role: m.role as Role,
    contentFormat: m.contentFormat as ContentFormat,
    content: m.content,
    createdAt: m.createdAt,
  }));
}

/**
 * Returns history in Anthropic Messages API shape with content always an
 * array of blocks. text-format rows are wrapped as a single text block.
 * Corrupt blocks rows degrade to a text block instead of failing the turn.
 */
export async function loadHistoryAsApiMessages(
  conversationId: string,
  scope: Scope,
  limit = 30,
): Promise<ApiMessage[]> {
  const history = await loadHistory(conversationId, scope, limit);
  return history.map((m) => {
    if (m.contentFormat === "blocks") {
      try {
        const parsed = JSON.parse(m.content);
        if (Array.isArray(parsed)) return { role: m.role, content: parsed };
      } catch {
        // fall through
      }
    }
    return {
      role: m.role,
      content: [{ type: "text", text: m.content }],
    };
  });
}

/**
 * Text-only projection for rendering in the UI. Blocks rows are flattened
 * to their text blocks (e.g. assistant prose without the tool_use noise).
 */
export async function loadHistoryForDisplay(
  conversationId: string,
  scope: Scope,
  limit = 100,
): Promise<Array<{ id: string; role: Role; text: string; createdAt: number }>> {
  const history = await loadHistory(conversationId, scope, limit);
  return history.map((m) => {
    if (m.contentFormat === "blocks") {
      try {
        const parsed = JSON.parse(m.content);
        if (Array.isArray(parsed)) {
          return {
            id: m.id,
            role: m.role,
            text: extractTextFromBlocks(parsed),
            createdAt: m.createdAt,
          };
        }
      } catch {
        // fall through
      }
    }
    return { id: m.id, role: m.role, text: m.content, createdAt: m.createdAt };
  });
}

/**
 * Bulk-append a turn's new messages. The Apex side does the batch insert in
 * one transaction so either the whole turn lands or none of it; titles the
 * conversation from the first user turn if it was empty before.
 */
export async function appendTurn(
  conversationId: string,
  scope: Scope,
  entries: TurnEntry[],
): Promise<void> {
  if (!entries.length) return;
  const wireEntries = entries.map((e) => {
    const isArray = Array.isArray(e.content);
    return {
      role: e.role,
      contentFormat: isArray ? "blocks" : "text",
      content: isArray ? JSON.stringify(e.content) : (e.content as string),
    };
  });
  try {
    await callMemory<{ inserted: number }>("appendTurn", {
      customerId: scope.customerId,
      conversationId,
      entries: wireEntries,
    });
  } catch (err) {
    // Persistence failures don't kill the user's turn — log and move on so
    // the response still comes back. The price of statefulness is best-effort.
    logError("memory_appendTurn_failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    throw err;
  }
}

// ---- usage (rate-limit + cost counters) ----

export type DailyUsage = { turnCount: number; costUsd: number };

export async function getDailyUsage(scope: Scope): Promise<DailyUsage> {
  return callMemory<DailyUsage>("getDailyUsage", scope);
}

export async function incrementUsage(scope: Scope, costUsd: number): Promise<void> {
  await callMemory<{ ok: true }>("incrementUsage", {
    ...scope,
    costUsd,
  });
}

// ---- helpers ----

function extractTextFromBlocks(blocks: Array<Record<string, unknown>>): string {
  return blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}
