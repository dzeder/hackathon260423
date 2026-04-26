import Anthropic from "@anthropic-ai/sdk";
import type { ApiMessage } from "@/lib/copilotMemory";
import { withSpan } from "@/lib/copilotLog";
import {
  dispatch,
  toAnthropicTools,
  type AnthropicTool,
} from "@/lib/copilotTools";

/*
 * Claude orchestrator for the copilot.
 *
 * Turn shape, one invocation:
 *   - loads prior-turn history from SQLite (caller supplies it)
 *   - runs a ReAct loop up to MAX_ITERATIONS (tool_use -> tool_result -> ...)
 *   - returns the finalText + the tail of new messages to persist + token
 *     usage including cache-read / cache-creation
 *
 * Prompt caching:
 *   - `system` is emitted as an array of blocks. Block 0 (static role +
 *     principles + format rules) carries `cache_control: ephemeral`. Block 1
 *     (dynamic scope / recall) does NOT, so cache hits stay high.
 *   - `tools` array has cache_control on the last schema — the whole tools
 *     block is cached as a stable prefix.
 *   - The last content block of the last message is marked on the first
 *     iteration so multi-iter ReAct and follow-up turns get cache hits.
 */

// Default to Sonnet 4.6 for cost. It handles tool-using agent workflows on par
// with Opus 4.7 for this use case at ~5x lower cost. Callers can override by
// passing `model` explicitly (e.g. opus for a flagged-hard scenario).
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_ITERATIONS = 5;
const MAX_TOKENS = 1500;
const TIMEOUT_MS = 45_000;

// Anthropic pricing per 1M tokens (updated 2026). Numbers are approximate;
// use only for in-app cost-cap enforcement, not billing. Source of truth is
// the invoice. Cache reads bill at 0.10x base input; writes at 1.25x.
const MODEL_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  "claude-opus-4-7": { inputPerM: 15, outputPerM: 75 },
  "claude-sonnet-4-6": { inputPerM: 3, outputPerM: 15 },
  "claude-haiku-4-5-20251001": { inputPerM: 1, outputPerM: 5 },
};
const CACHE_READ_MULT = 0.1;
const CACHE_WRITE_MULT = 1.25;

export function estimateTurnCostUsd(
  model: string,
  usage: OrchestratorUsage,
): number {
  const price = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4-6"];
  const inCost = (usage.inputTokens * price.inputPerM) / 1_000_000;
  const readCost =
    (usage.cacheReadTokens * price.inputPerM * CACHE_READ_MULT) / 1_000_000;
  const writeCost =
    (usage.cacheCreationTokens * price.inputPerM * CACHE_WRITE_MULT) / 1_000_000;
  const outCost = (usage.outputTokens * price.outputPerM) / 1_000_000;
  return Math.round((inCost + readCost + writeCost + outCost) * 10_000) / 10_000;
}

export type OrchestratorInput = {
  userText: string;
  priorHistory: ApiMessage[]; // block-form already
  recallBlock: string | null; // dynamic system-prompt addendum
  scenarioContext: string | null; // dynamic scope ("scenario id X, events A/B/C")
  model?: string;
};

export type OrchestratorUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

export type ToolCallTrace = {
  name: string;
  inputJson: string;
  outputJson: string;
  ok: boolean;
  elapsedMs: number;
};

export type OrchestratorResult = {
  finalText: string;
  newMessages: ApiMessage[]; // the turn tail to persist, starting with {role:user, ...} for userText
  usage: OrchestratorUsage;
  toolCalls: ToolCallTrace[];
  stopReason: string;
  iterations: number;
  model: string;
  costUsd: number;
  costCapHit: boolean;
};

export type OrchestratorTurnOptions = {
  /** Hard per-turn spending cap. Turn aborts mid-loop if cumulative cost exceeds this. */
  maxCostUsd?: number;
};

// ---- system prompt ----

const STATIC_SYSTEM_TEXT = [
  "== ROLE ==",
  "You are the Ohanafy Plan copilot for Yellowhammer Beverage — a beer + Red Bull wholesaler in Birmingham, AL. Your audience is the CFO and senior finance team. Ground every number in tool output. Never invent numbers the tools did not return.",
  "",
  "== CORE PRINCIPLES ==",
  "1. QUANTIFY, NEVER HAND-WAVE. Lead with specific dollar figures produced by `snapshot` or `apply_event`. Avoid vague phrasing like 'approximately 2-3x'.",
  "2. USE TOOLS DECISIVELY. Do not ask clarifying questions when a reasonable interpretation exists. Call `snapshot` early to get baseline + scenario totals. Call `search_events` to find relevant templates before asking the user for event ids.",
  "3. COMPARISONS RUN BOTH SIDES. For 'A vs B' / 'what's better' / 'should we do X or Y', call `snapshot` or `apply_event` for BOTH options and lead with 'Option A: $X · Option B: $Y · Gap: $Z (winner: ___)'.",
  "4. CITE SOURCES. Use short labels (e.g. 'CFBD calendar', 'NOAA outlook', 'three-statement model', 'event:iron-bowl-2026'). Every bullet gets a citation if it claims a fact.",
  "5. NO EMOJIS. Audience is CFO.",
  "",
  "== OUTPUT FORMAT ==",
  "Your FINAL assistant turn (after all tool calls finish) must be a single JSON object and nothing else:",
  '{"text": "<2-3 sentences leading with the headline dollar delta>", "bullets": ["<bullet>", ...], "citations": ["<label>", ...]}',
  "No markdown fences. No prose outside the JSON.",
  "",
  "== FOLLOW-UP TURNS ==",
  "If the prior assistant turn already ran `snapshot`, treat the new user message as a REFINEMENT: call `apply_event` or `snapshot` again with tweaked events and report the NEW delta vs the prior result. Do not re-call `search_events` unless the refinement introduces a NEW pattern.",
].join("\n");

function buildSystemBlocks(
  scenarioContext: string | null,
  recallBlock: string | null,
): Array<Record<string, unknown>> {
  const dynamicLines: string[] = [];
  if (scenarioContext) {
    dynamicLines.push("== CURRENT SCENARIO CONTEXT ==", scenarioContext);
  }
  if (recallBlock) {
    dynamicLines.push("", "---", recallBlock);
  }
  const dynamicText = dynamicLines.length ? dynamicLines.join("\n") : "(no dynamic context this turn)";

  return [
    {
      type: "text",
      text: STATIC_SYSTEM_TEXT,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: dynamicText,
    },
  ];
}

// ---- cache_control on tools + messages ----

function withToolsCaching(tools: AnthropicTool[]): AnthropicTool[] {
  if (tools.length === 0) return tools;
  const last = tools[tools.length - 1];
  return [
    ...tools.slice(0, -1),
    {
      ...last,
      // Anthropic accepts cache_control as a top-level field on tool entries.
      ...({ cache_control: { type: "ephemeral" } } as Record<string, unknown>),
    },
  ];
}

// Mark the last content block of the last message for caching. Upgrades
// string-typed content to an array-of-text-block form when needed.
function applyCacheControlToLastMessage(messages: ApiMessage[]): void {
  if (messages.length === 0) return;
  const last = messages[messages.length - 1];
  if (typeof last.content === "string") {
    const block = { type: "text", text: last.content, cache_control: { type: "ephemeral" } };
    last.content = [block];
    return;
  }
  if (Array.isArray(last.content) && last.content.length > 0) {
    const tail = last.content[last.content.length - 1] as Record<string, unknown>;
    tail.cache_control = { type: "ephemeral" };
  }
}

// ---- main entry ----

const DEFAULT_MAX_COST_USD = 0.30;

export async function runCopilotTurn(
  input: OrchestratorInput,
  options: OrchestratorTurnOptions = {},
): Promise<OrchestratorResult> {
  const model = input.model ?? DEFAULT_MODEL;
  const maxCost = options.maxCostUsd ?? DEFAULT_MAX_COST_USD;
  const client = new Anthropic({ timeout: TIMEOUT_MS });

  const systemBlocks = buildSystemBlocks(input.scenarioContext, input.recallBlock);
  const toolSchemas = withToolsCaching(toAnthropicTools());

  // Starts with prior history + the new user turn. We track everything appended
  // after that point as the turn-tail to persist.
  const apiMessages: ApiMessage[] = [
    ...input.priorHistory,
    {
      role: "user",
      content: [{ type: "text", text: input.userText }],
    },
  ];
  const persistStartIdx = input.priorHistory.length; // persist from new user turn onward

  // Cache the last message of prior+current on the initial call. Saves turn 2+
  // from re-shipping the whole transcript uncached.
  applyCacheControlToLastMessage(apiMessages);

  const usage: OrchestratorUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  const toolCalls: ToolCallTrace[] = [];
  let finalText = "";
  let stopReason = "";
  let iter = 0;

  for (iter = 0; iter < MAX_ITERATIONS; iter++) {
    const resp = await withSpan(
      "copilot.claude.call",
      {
        model,
        iteration: iter,
        message_count: apiMessages.length,
        tool_schema_count: toolSchemas.length,
      },
      () =>
        client.messages.create({
          model,
          max_tokens: MAX_TOKENS,
          system: systemBlocks as unknown as Anthropic.TextBlockParam[],
          tools: toolSchemas as unknown as Anthropic.Tool[],
          messages: apiMessages as unknown as Anthropic.MessageParam[],
        }),
    );

    // SDK 0.30.x types `usage` without the cache-token fields; they are
    // present in the actual JSON response since prompt caching went GA.
    const rawUsage = resp.usage as unknown as {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    usage.inputTokens += rawUsage.input_tokens ?? 0;
    usage.outputTokens += rawUsage.output_tokens ?? 0;
    usage.cacheReadTokens += rawUsage.cache_read_input_tokens ?? 0;
    usage.cacheCreationTokens += rawUsage.cache_creation_input_tokens ?? 0;

    // Per-turn cost cap. If we've spent enough to exceed maxCost, break out
    // and return a terminal-style response so the caller's persistence path
    // captures whatever tool work we did manage.
    const runningCost = estimateTurnCostUsd(model, usage);
    if (runningCost > maxCost) {
      finalText = JSON.stringify({
        text: `[Cost cap hit at $${runningCost.toFixed(4)} — stopping before another Claude call. Try narrowing the question.]`,
        bullets: [],
        citations: ["cost-cap"],
      });
      stopReason = "cost_cap";
      break;
    }

    stopReason = resp.stop_reason ?? "";

    // Capture any text block this turn — it becomes the final text if the
    // model ends without further tool use.
    const textChunks: string[] = [];
    for (const block of resp.content) {
      if (block.type === "text") textChunks.push(block.text);
    }
    if (textChunks.length > 0) finalText = textChunks.join("\n");

    if (stopReason === "end_turn" || stopReason === "stop_sequence") {
      break;
    }

    if (stopReason === "tool_use") {
      // Append assistant turn with the raw block content (text + tool_use
      // blocks). Block fidelity is what makes follow-up turns work.
      const assistantContent = resp.content.map((b) => ({ ...b })) as Array<
        Record<string, unknown>
      >;
      apiMessages.push({ role: "assistant", content: assistantContent });

      // Dispatch every tool_use block in order, collect tool_result blocks.
      const toolResults: Array<Record<string, unknown>> = [];
      for (const block of resp.content) {
        if (block.type !== "tool_use") continue;
        const t0 = Date.now();
        const result = await withSpan(
          "copilot.tool.dispatch",
          { "tool.name": block.name, "tool.use_id": block.id },
          () => dispatch(block.name, block.input),
        );
        const elapsed = Date.now() - t0;
        toolCalls.push({
          name: block.name,
          inputJson: JSON.stringify(block.input),
          outputJson: result.contentJson,
          ok: result.ok,
          elapsedMs: elapsed,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.contentJson,
        });
      }
      apiMessages.push({ role: "user", content: toolResults });
      continue;
    }

    // Unknown stop reason — treat as terminal to avoid runaway.
    break;
  }

  // If we didn't get a text turn at the end (rare), synthesize a placeholder
  // so the UI has something to show. Still persisted as an assistant turn.
  if (!finalText) {
    finalText =
      '{"text": "The copilot finished without producing a narrative response. Try rephrasing the question.", "bullets": [], "citations": []}';
  }

  // Build the list of NEW messages this turn produced, to be persisted.
  // Includes the new user turn + any iterations + a final assistant text
  // block. We synthesize the final assistant turn (even though the last loop
  // iteration's text is captured in `finalText`) so persistence is always
  // shaped as [..., assistant(final_text)] regardless of stop reason.
  const newMessages = apiMessages.slice(persistStartIdx);
  newMessages.push({
    role: "assistant",
    content: [{ type: "text", text: finalText }],
  });

  return {
    finalText,
    newMessages,
    usage,
    toolCalls,
    stopReason,
    iterations: iter + 1,
    model,
    costUsd: estimateTurnCostUsd(model, usage),
    costCapHit: stopReason === "cost_cap",
  };
}
