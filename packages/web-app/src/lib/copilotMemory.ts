import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

/*
 * Copilot memory store — SQLite via better-sqlite3.
 *
 * Stores full Anthropic-shape conversation history so tool_use and tool_result
 * blocks round-trip across turns. Without this, a "make it a Cat 3 instead"
 * follow-up has no record of the original tool calls and silently re-derives
 * baseline numbers. Block fidelity is the single biggest thing that makes a
 * multi-turn chat feel continuous.
 *
 * Content format:
 *   - "text"   — `content` is a plain string (legacy / simple user turns)
 *   - "blocks" — `content` is a JSON-serialized Anthropic block array
 *                e.g. [{type:'text',...}, {type:'tool_use',...}]
 */

const DB_PATH =
  process.env.COPILOT_DB_PATH ??
  resolve(process.cwd(), "data/copilot.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.exec(SCHEMA);
  return _db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  content_format TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_seq ON messages(conversation_id, seq);
CREATE INDEX IF NOT EXISTS idx_convos_user_activity ON conversations(user_id, last_activity_at DESC);
`;

export type Role = "user" | "assistant";
export type ContentFormat = "text" | "blocks";

export type Conversation = {
  id: string;
  userId: string;
  title: string | null;
  createdAt: number;
  lastActivityAt: number;
};

export type StoredMessage = {
  id: string;
  conversationId: string;
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

export function startNewThread(userId: string): string {
  const id = randomUUID();
  const now = Date.now();
  getDb()
    .prepare(
      "INSERT INTO conversations (id, user_id, title, created_at, last_activity_at) VALUES (?, ?, NULL, ?, ?)",
    )
    .run(id, userId, now, now);
  return id;
}

// Soft rollover: always return the most recent thread for this user. "Start new
// chat" is a visible action on the UI — continuity is the default.
export function getOrCreateActive(userId: string): string {
  const row = getDb()
    .prepare(
      "SELECT id FROM conversations WHERE user_id = ? ORDER BY last_activity_at DESC LIMIT 1",
    )
    .get(userId) as { id: string } | undefined;
  if (row) return row.id;
  return startNewThread(userId);
}

export function listThreads(userId: string, limit = 25): ThreadSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.title, c.last_activity_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count
       FROM conversations c
       WHERE c.user_id = ?
       ORDER BY c.last_activity_at DESC
       LIMIT ?`,
    )
    .all(userId, limit) as Array<{
    id: string;
    title: string | null;
    last_activity_at: number;
    message_count: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    lastActivityAt: r.last_activity_at,
    messageCount: r.message_count,
  }));
}

export function loadHistory(conversationId: string, limit = 100): StoredMessage[] {
  const rows = getDb()
    .prepare(
      `SELECT id, conversation_id, seq, role, content_format, content, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY seq ASC
       LIMIT ?`,
    )
    .all(conversationId, limit) as Array<{
    id: string;
    conversation_id: string;
    seq: number;
    role: string;
    content_format: string;
    content: string;
    created_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    seq: r.seq,
    role: r.role as Role,
    contentFormat: r.content_format as ContentFormat,
    content: r.content,
    createdAt: r.created_at,
  }));
}

// Returns history in Anthropic Messages API shape. `content` is always an
// array of blocks so tool_use/tool_result round-trip cleanly. Text rows are
// wrapped as a single text block. Corrupt blocks rows degrade to a text block
// instead of failing the whole request.
export function loadHistoryAsApiMessages(
  conversationId: string,
  limit = 30,
): ApiMessage[] {
  const history = loadHistory(conversationId, limit);
  return history.map((m) => {
    if (m.contentFormat === "blocks") {
      try {
        const parsed = JSON.parse(m.content);
        if (Array.isArray(parsed)) return { role: m.role, content: parsed };
      } catch {
        // fall through to text fallback
      }
      return {
        role: m.role,
        content: [{ type: "text", text: m.content }],
      };
    }
    return {
      role: m.role,
      content: [{ type: "text", text: m.content }],
    };
  });
}

// Bulk-append a turn's new messages. Done as a single transaction so either
// the whole turn lands or none of it. Titles the conversation from the first
// user turn if it was previously empty.
export function appendTurn(conversationId: string, entries: TurnEntry[]): void {
  if (!entries.length) return;
  const db = getDb();
  const now = Date.now();
  const txn = db.transaction(() => {
    const seqRow = db
      .prepare(
        "SELECT COALESCE(MAX(seq), 0) as max_seq FROM messages WHERE conversation_id = ?",
      )
      .get(conversationId) as { max_seq: number };
    let nextSeq = seqRow.max_seq + 1;

    const insert = db.prepare(
      `INSERT INTO messages (id, conversation_id, seq, role, content_format, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    let firstUserText: string | null = null;
    for (const entry of entries) {
      const isArray = Array.isArray(entry.content);
      const format: ContentFormat = isArray ? "blocks" : "text";
      const content = isArray
        ? JSON.stringify(entry.content)
        : (entry.content as string);
      insert.run(
        randomUUID(),
        conversationId,
        nextSeq,
        entry.role,
        format,
        content,
        now,
      );
      if (
        firstUserText === null &&
        entry.role === "user" &&
        seqRow.max_seq === 0 &&
        nextSeq === 1
      ) {
        firstUserText = isArray
          ? extractTextFromBlocks(entry.content as Array<Record<string, unknown>>)
          : (entry.content as string);
      }
      nextSeq += 1;
    }

    // Title from first user message if the thread was empty before this turn.
    const titleSql = firstUserText
      ? "UPDATE conversations SET last_activity_at = ?, title = COALESCE(title, ?) WHERE id = ?"
      : "UPDATE conversations SET last_activity_at = ? WHERE id = ?";
    if (firstUserText) {
      db.prepare(titleSql).run(
        now,
        firstUserText.slice(0, 80),
        conversationId,
      );
    } else {
      db.prepare(titleSql).run(now, conversationId);
    }
  });
  txn();
}

function extractTextFromBlocks(
  blocks: Array<Record<string, unknown>>,
): string {
  return blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}

// Text-only projection for rendering in the UI. Blocks-format rows are
// flattened to their text content.
export function loadHistoryForDisplay(conversationId: string, limit = 100): Array<{
  id: string;
  role: Role;
  text: string;
  createdAt: number;
}> {
  return loadHistory(conversationId, limit).map((m) => {
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
