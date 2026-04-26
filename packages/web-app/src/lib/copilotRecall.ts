import Anthropic from "@anthropic-ai/sdk";
import {
  listThreads,
  loadHistoryForDisplay,
  type Scope,
} from "@/lib/copilotMemory";

/*
 * Relevance-ranked cross-conversation recall.
 *
 * On each turn we pull the user's last N thread headers, ship a compact index
 * (title + id) to Haiku, and let Haiku return the ids of the up-to-K threads
 * whose prior analysis is most likely useful for the current question. We then
 * fetch those threads' final user/assistant exchange and inline them into the
 * system prompt as a "prior work" block.
 *
 * Recency is a lousy proxy for relevance in this domain — a CFO asking about
 * a hurricane doesn't want to hear about last week's IRR analysis on new SKUs.
 *
 * Failure modes all degrade silently to recency ranking so a Haiku outage or
 * missing API key never breaks the main turn.
 */

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HAIKU_MAX_TOKENS = 300;
const HAIKU_TIMEOUT_MS = 8_000;

const THREAD_INDEX_SIZE = 20;
const DEFAULT_CAP = 3;
const RECALL_CACHE_TTL_MS = 5 * 60_000;

export type Recalled = {
  conversationId: string;
  title: string | null;
  userPrompt: string;
  assistantResponse: string;
  occurredAtMs: number;
};

const recallCache = new Map<string, { at: number; ids: string[] }>();

export async function recallForUser(
  scope: Scope,
  excludeConversationId: string | null,
  currentQuestion: string,
  cap = DEFAULT_CAP,
): Promise<Recalled[]> {
  const threads = (await listThreads(scope, THREAD_INDEX_SIZE)).filter(
    (t) => t.id !== excludeConversationId && t.messageCount >= 2,
  );
  if (threads.length === 0) return [];

  if (process.env.ANTHROPIC_API_KEY && currentQuestion.trim().length > 0) {
    try {
      const ids = await pickRelevantThreadIds(scope, currentQuestion, threads, cap);
      if (ids.length > 0) return materialize(ids, scope);
    } catch (err) {
      console.warn(
        "copilotRecall: Haiku retriever failed, falling back to recency",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return materialize(
    threads.slice(0, cap).map((t) => t.id),
    scope,
  );
}

async function pickRelevantThreadIds(
  scope: Scope,
  question: string,
  threads: Array<{ id: string; title: string | null }>,
  cap: number,
): Promise<string[]> {
  const cacheKey = `${scope.customerId}|${scope.userId}|${hash(question)}`;
  const cached = recallCache.get(cacheKey);
  if (cached && Date.now() - cached.at < RECALL_CACHE_TTL_MS) return cached.ids;

  const indexLines = threads
    .map((t, i) => `${i + 1}. id=${t.id} — ${t.title ?? "(untitled)"}`)
    .join("\n");

  const system =
    "You are a retrieval helper. Given a CURRENT QUESTION and a list of PRIOR THREADS for this user " +
    `(each with an id and a short title snippet), pick up to ${cap} threads whose prior analysis is most likely to contain ` +
    "reusable context for the current question (same event type / same supplier / same timeframe / same financial driver). " +
    "If NO threads are relevant, return an empty list. Do not force matches. " +
    'Output ONLY a single JSON object — no markdown, no prose — exactly: {"thread_ids":["<id>", ...]}.';

  const userPayload = `CURRENT QUESTION:\n${question}\n\nPRIOR THREADS:\n${indexLines}\n\nReturn JSON.`;

  const client = new Anthropic({ timeout: HAIKU_TIMEOUT_MS });
  const resp = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: HAIKU_MAX_TOKENS,
    system,
    messages: [{ role: "user", content: userPayload }],
  });

  const text = resp.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return [];
  const parsed = extractJsonObject(text.text);
  if (!parsed || !Array.isArray(parsed.thread_ids)) return [];
  const valid = threads.map((t) => t.id);
  const ids = (parsed.thread_ids as unknown[])
    .filter((v): v is string => typeof v === "string" && valid.includes(v))
    .slice(0, cap);

  recallCache.set(cacheKey, { at: Date.now(), ids });
  return ids;
}

async function materialize(ids: string[], scope: Scope): Promise<Recalled[]> {
  const out: Recalled[] = [];
  for (const id of ids) {
    const msgs = await loadHistoryForDisplay(id, scope, 200);
    if (msgs.length < 2) continue;
    let lastAssistant: (typeof msgs)[number] | null = null;
    let lastUser: (typeof msgs)[number] | null = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (!lastAssistant && msgs[i].role === "assistant") {
        lastAssistant = msgs[i];
        continue;
      }
      if (lastAssistant && msgs[i].role === "user") {
        lastUser = msgs[i];
        break;
      }
    }
    if (!lastUser || !lastAssistant) continue;
    out.push({
      conversationId: id,
      title: null,
      userPrompt: trim(lastUser.text, 240),
      assistantResponse: trim(lastAssistant.text, 320),
      occurredAtMs: lastAssistant.createdAt,
    });
  }
  out.sort((a, b) => b.occurredAtMs - a.occurredAtMs);
  return out;
}

export function formatRecallForPrompt(items: Recalled[]): string | null {
  if (items.length === 0) return null;
  const lines: string[] = [
    "Relevant prior conversations with this user (selected by topical overlap, not recency — use only if directly relevant, never repeat verbatim):",
  ];
  items.forEach((r, i) => {
    const stamp = new Date(r.occurredAtMs).toISOString().slice(0, 10);
    lines.push(`${i + 1}. [${stamp}] User asked: "${r.userPrompt}"`);
    lines.push(`   Prior answer summary: ${r.assistantResponse}`);
  });
  return lines.join("\n");
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function trim(v: string, max: number): string {
  const clean = v.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
