import { randomUUID } from "node:crypto";
import { ensureMigrations, getDb } from "@/lib/copilotDb";

/*
 * Copilot memory store — libSQL/Turso.
 *
 * Stores full Anthropic-shape conversation history so tool_use and tool_result
 * blocks round-trip across turns. Without this, a "make it a Cat 3 instead"
 * follow-up has no record of the original tool calls and silently re-derives
 * baseline numbers. Block fidelity is the single biggest thing that makes a
 * multi-turn chat feel continuous.
 *
 * Every row carries `customer_id`. For single-customer deployments, callers
 * pass a constant derived from the deploy env (SF_CUSTOMER_ID). For multi-
 * tenant later, the same code path works — just vary the customerId per call.
 */

export type Role = "user" | "assistant";
export type ContentFormat = "text" | "blocks";

export type Conversation = {
  id: string;
  customerId: string;
  userId: string;
  title: string | null;
  createdAt: number;
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

// ---- conversations ----

export async function startNewThread(scope: Scope): Promise<string> {
  await ensureMigrations();
  const id = randomUUID();
  const now = Date.now();
  await getDb().execute({
    sql: "INSERT INTO conversations (id, customer_id, user_id, title, created_at, last_activity_at) VALUES (?, ?, ?, NULL, ?, ?)",
    args: [id, scope.customerId, scope.userId, now, now],
  });
  return id;
}

// Soft rollover: always return the user's most recent thread for this
// customer. "Start new chat" is a visible action on the UI.
export async function getOrCreateActive(scope: Scope): Promise<string> {
  await ensureMigrations();
  const res = await getDb().execute({
    sql: "SELECT id FROM conversations WHERE customer_id = ? AND user_id = ? ORDER BY last_activity_at DESC LIMIT 1",
    args: [scope.customerId, scope.userId],
  });
  const row = res.rows[0];
  if (row && typeof row.id === "string") return row.id;
  return startNewThread(scope);
}

export async function listThreads(scope: Scope, limit = 25): Promise<ThreadSummary[]> {
  await ensureMigrations();
  const res = await getDb().execute({
    sql: `SELECT c.id, c.title, c.last_activity_at,
                 (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count
          FROM conversations c
          WHERE c.customer_id = ? AND c.user_id = ?
          ORDER BY c.last_activity_at DESC
          LIMIT ?`,
    args: [scope.customerId, scope.userId, limit],
  });
  return res.rows.map((r) => ({
    id: String(r.id),
    title: r.title == null ? null : String(r.title),
    lastActivityAt: Number(r.last_activity_at),
    messageCount: Number(r.message_count ?? 0),
  }));
}

// ---- messages ----

export async function loadHistory(
  conversationId: string,
  scope: Scope,
  limit = 100,
): Promise<StoredMessage[]> {
  await ensureMigrations();
  const res = await getDb().execute({
    sql: `SELECT id, conversation_id, customer_id, seq, role, content_format, content, created_at
          FROM messages
          WHERE conversation_id = ? AND customer_id = ?
          ORDER BY seq ASC
          LIMIT ?`,
    args: [conversationId, scope.customerId, limit],
  });
  return res.rows.map((r) => ({
    id: String(r.id),
    conversationId: String(r.conversation_id),
    customerId: String(r.customer_id),
    seq: Number(r.seq),
    role: String(r.role) as Role,
    contentFormat: String(r.content_format) as ContentFormat,
    content: String(r.content),
    createdAt: Number(r.created_at),
  }));
}

// Returns history in Anthropic Messages API shape. `content` is always an
// array of blocks so tool_use/tool_result round-trip cleanly. Text rows are
// wrapped as a single text block. Corrupt blocks rows degrade to a text
// block instead of failing the whole request.
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

// Text-only projection for rendering in the UI. Blocks rows are flattened
// to their text blocks.
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

// Bulk-append a turn's new messages. Done in one libSQL batch so either
// the whole turn lands or none of it. Titles the conversation from the
// first user turn if the thread was previously empty.
export async function appendTurn(
  conversationId: string,
  scope: Scope,
  entries: TurnEntry[],
): Promise<void> {
  if (!entries.length) return;
  await ensureMigrations();
  const db = getDb();
  const now = Date.now();

  // Read max seq first — libSQL doesn't give us a single-statement way to
  // auto-increment within a batch the way SQL Server would.
  const seqRow = await db.execute({
    sql: "SELECT COALESCE(MAX(seq), 0) as max_seq FROM messages WHERE conversation_id = ? AND customer_id = ?",
    args: [conversationId, scope.customerId],
  });
  const startingSeq = Number(seqRow.rows[0]?.max_seq ?? 0);
  let nextSeq = startingSeq + 1;

  const batch: Array<{ sql: string; args: Array<string | number | null> }> = [];
  let firstUserText: string | null = null;
  for (const entry of entries) {
    const isArray = Array.isArray(entry.content);
    const format: ContentFormat = isArray ? "blocks" : "text";
    const content = isArray
      ? JSON.stringify(entry.content)
      : (entry.content as string);
    batch.push({
      sql: `INSERT INTO messages (id, conversation_id, customer_id, seq, role, content_format, content, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        conversationId,
        scope.customerId,
        nextSeq,
        entry.role,
        format,
        content,
        now,
      ],
    });
    if (
      firstUserText === null &&
      entry.role === "user" &&
      startingSeq === 0 &&
      nextSeq === 1
    ) {
      firstUserText = isArray
        ? extractTextFromBlocks(entry.content as Array<Record<string, unknown>>)
        : (entry.content as string);
    }
    nextSeq += 1;
  }

  // Touch the conversation: bump last_activity_at and set title if empty.
  if (firstUserText && firstUserText.length > 0) {
    batch.push({
      sql: "UPDATE conversations SET last_activity_at = ?, title = COALESCE(title, ?) WHERE id = ? AND customer_id = ?",
      args: [now, firstUserText.slice(0, 80), conversationId, scope.customerId],
    });
  } else {
    batch.push({
      sql: "UPDATE conversations SET last_activity_at = ? WHERE id = ? AND customer_id = ?",
      args: [now, conversationId, scope.customerId],
    });
  }

  await db.batch(batch, "write");
}

// ---- usage (rate-limit + cost counters) ----

export type DailyUsage = { turnCount: number; costUsd: number };

export async function getDailyUsage(scope: Scope): Promise<DailyUsage> {
  await ensureMigrations();
  const day = todayUtc();
  const res = await getDb().execute({
    sql: "SELECT turn_count, cost_usd_micros FROM usage_daily WHERE customer_id = ? AND user_id = ? AND day = ?",
    args: [scope.customerId, scope.userId, day],
  });
  const row = res.rows[0];
  if (!row) return { turnCount: 0, costUsd: 0 };
  const micros = Number(row.cost_usd_micros ?? 0);
  return {
    turnCount: Number(row.turn_count ?? 0),
    costUsd: micros / 1_000_000,
  };
}

export async function incrementUsage(
  scope: Scope,
  costUsd: number,
): Promise<void> {
  await ensureMigrations();
  const day = todayUtc();
  const micros = Math.round(costUsd * 1_000_000);
  // Upsert: libSQL supports ON CONFLICT.
  await getDb().execute({
    sql: `INSERT INTO usage_daily (customer_id, user_id, day, turn_count, cost_usd_micros)
          VALUES (?, ?, ?, 1, ?)
          ON CONFLICT(customer_id, user_id, day) DO UPDATE SET
            turn_count = turn_count + 1,
            cost_usd_micros = cost_usd_micros + excluded.cost_usd_micros`,
    args: [scope.customerId, scope.userId, day, micros],
  });
}

// ---- helpers ----

function extractTextFromBlocks(
  blocks: Array<Record<string, unknown>>,
): string {
  return blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
