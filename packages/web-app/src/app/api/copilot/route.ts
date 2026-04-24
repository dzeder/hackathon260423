import { NextResponse } from "next/server";
import { z } from "zod";
import { baselineForecast } from "@/data/baseline";
import { applyEvents } from "@/lib/applyEvents";
import { respond } from "@/lib/copilot";
import { eventsCatalog } from "@/lib/eventsCatalog";
import { runThreeStatement } from "@/lib/threeStatement";
import { runCopilotTurn } from "@/lib/copilotClaude";
import {
  appendTurn,
  getOrCreateActive,
  listThreads,
  loadHistoryAsApiMessages,
  loadHistoryForDisplay,
  startNewThread,
} from "@/lib/copilotMemory";
import { formatRecallForPrompt, recallForUser } from "@/lib/copilotRecall";

export const runtime = "nodejs";

// GET /api/copilot?userId=demo[&conversationId=...]
//
// Returns {conversationId, messages:[{id,role,text,createdAt}], threads:[...]}
// Used by the LWC / CopilotPanel on mount to rehydrate the chat thread without
// running a turn. If no conversationId is given we pick the user's most recent
// (soft rollover).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "demo";
  const startNew = url.searchParams.get("startNew") === "1";
  let conversationId = url.searchParams.get("conversationId");
  if (startNew) {
    conversationId = startNewThread(userId);
  } else if (!conversationId) {
    conversationId = getOrCreateActive(userId);
  }
  const messages = loadHistoryForDisplay(conversationId, 100);
  const threads = listThreads(userId, 15);
  return NextResponse.json({ conversationId, messages, threads });
}

const Body = z.object({
  prompt: z.string().min(1).max(2000),
  scenarioId: z.string().min(1),
  appliedEventIds: z.array(z.string()).default([]),
  // when absent, we use the user's most recent thread (soft rollover)
  conversationId: z.string().optional(),
  // when true, start a fresh thread regardless of existing history
  newThread: z.boolean().optional(),
  // Single-user demo — in prod this comes from the session
  userId: z.string().default("demo"),
});

const MAX_HISTORY_FOR_REPLAY = 30;

export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid body" },
      { status: 400 },
    );
  }

  // Build the dynamic scenario context block — this is the scope the model
  // needs to ground numbers for THIS scenario without a snapshot call.
  const scenarioContext = buildScenarioContext(parsed);

  // Conversation resolution — done up front so both the live and canned
  // paths persist into SQLite and memory is visible even without an API key.
  let conversationId = parsed.conversationId ?? null;
  if (parsed.newThread || !conversationId) {
    conversationId = parsed.newThread
      ? startNewThread(parsed.userId)
      : getOrCreateActive(parsed.userId);
  }

  // No API key -> canned response (still persisted so the thread UI works).
  if (!process.env.ANTHROPIC_API_KEY) {
    const canned = respondCanned(parsed);
    try {
      appendTurn(conversationId, [
        {
          role: "user",
          content: [{ type: "text", text: parsed.prompt }],
        },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                text: canned.text,
                bullets: canned.bullets,
                citations: canned.citations,
              }),
            },
          ],
        },
      ]);
    } catch (persistErr) {
      console.warn(
        "copilot: canned persist failed",
        persistErr instanceof Error ? persistErr.message : persistErr,
      );
    }
    return NextResponse.json({ ...canned, source: "canned", conversationId });
  }

  // Prior history (block form) + cross-conversation recall.
  const priorHistory = loadHistoryAsApiMessages(conversationId, MAX_HISTORY_FOR_REPLAY);
  let recallBlock: string | null = null;
  try {
    const recalled = await recallForUser(parsed.userId, conversationId, parsed.prompt);
    recallBlock = formatRecallForPrompt(recalled);
  } catch (err) {
    console.warn("copilot: recall failed", err instanceof Error ? err.message : err);
  }

  try {
    const turn = await runCopilotTurn({
      userText: parsed.prompt,
      priorHistory,
      recallBlock,
      scenarioContext,
    });

    // Persist the turn tail: new user turn + any tool iterations + final text.
    try {
      appendTurn(conversationId, turn.newMessages);
    } catch (persistErr) {
      console.warn(
        "copilot: persist failed",
        persistErr instanceof Error ? persistErr.message : persistErr,
      );
    }

    // Final assistant text is JSON per the system-prompt contract. Parse it
    // into the CopilotResponse shape the UI expects. If parsing fails, wrap
    // the raw text in a minimal shape so the UI still renders.
    const shaped = coerceCopilotShape(turn.finalText);

    return NextResponse.json({
      ...shaped,
      source: "live",
      conversationId,
      toolCalls: turn.toolCalls.map((c) => ({
        name: c.name,
        ok: c.ok,
        elapsedMs: c.elapsedMs,
      })),
      usage: turn.usage,
      iterations: turn.iterations,
    });
  } catch (err) {
    console.warn(
      "copilot: live turn failed, falling back to canned",
      err instanceof Error ? err.message : err,
    );
    const canned = respondCanned(parsed);
    return NextResponse.json({
      ...canned,
      source: "canned",
      conversationId,
      error: err instanceof Error ? err.message : "unknown error",
    });
  }
}

function buildScenarioContext(body: z.infer<typeof Body>): string {
  const appliedEvents = eventsCatalog.filter((e) =>
    body.appliedEventIds.includes(e.id),
  );
  const scenario = applyEvents(baselineForecast, appliedEvents);
  const threeStatement = runThreeStatement(scenario);

  const bTot = totals(baselineForecast);
  const sTot = totals(scenario);
  const dRev = bTot.revenue ? ((sTot.revenue - bTot.revenue) / bTot.revenue) * 100 : 0;
  const dEbitda = bTot.ebitda ? ((sTot.ebitda - bTot.ebitda) / bTot.ebitda) * 100 : 0;

  const eventLines = appliedEvents
    .map(
      (e) =>
        `  - ${e.id} (${e.month}, ${e.category}): Δrev ${e.revenueDeltaPct}%, ΔCOGS ${e.cogsDeltaPct}%, Δopex $${e.opexDeltaAbs}k. Source: ${e.source}`,
    )
    .join("\n");

  return [
    `Scenario id: ${body.scenarioId}`,
    "Horizon: 6 months (May–Oct 2026). Units: USD thousands for money, cases for volume.",
    `Baseline 6mo totals: revenue $${Math.round(bTot.revenue)}k · COGS $${Math.round(bTot.cogs)}k · opex $${Math.round(bTot.opex)}k · EBITDA $${Math.round(bTot.ebitda)}k.`,
    `Scenario 6mo totals: revenue $${Math.round(sTot.revenue)}k · EBITDA $${Math.round(sTot.ebitda)}k (Δrev ${dRev.toFixed(1)}%, ΔEBITDA ${dEbitda.toFixed(1)}%).`,
    `Cash from operations (6mo): $${Math.round(threeStatement.cash.operating)}k.`,
    `Applied event ids: [${body.appliedEventIds.join(", ") || "(none)"}]`,
    appliedEvents.length ? "Applied event detail:" : "",
    eventLines,
  ]
    .filter(Boolean)
    .join("\n");
}

function totals(forecast: typeof baselineForecast) {
  return forecast.reduce(
    (acc, m) => ({
      revenue: acc.revenue + m.revenue,
      cogs: acc.cogs + m.cogs,
      opex: acc.opex + m.opex,
      gm: acc.gm + m.gm,
      ebitda: acc.ebitda + m.ebitda,
    }),
    { revenue: 0, cogs: 0, opex: 0, gm: 0, ebitda: 0 },
  );
}

function respondCanned(body: z.infer<typeof Body>) {
  const appliedEvents = eventsCatalog.filter((e) =>
    body.appliedEventIds.includes(e.id),
  );
  const scenario = applyEvents(baselineForecast, appliedEvents);
  const threeStatement = runThreeStatement(scenario);
  return respond({
    prompt: body.prompt,
    scenarioId: body.scenarioId,
    appliedEventIds: body.appliedEventIds,
    baseline: baselineForecast,
    scenario,
    threeStatement,
  });
}

type CopilotShape = { text: string; bullets: string[]; citations: string[] };

function coerceCopilotShape(raw: string): CopilotShape {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (
        parsed &&
        typeof parsed.text === "string" &&
        Array.isArray(parsed.bullets) &&
        Array.isArray(parsed.citations)
      ) {
        return {
          text: parsed.text,
          bullets: parsed.bullets.filter((b: unknown) => typeof b === "string"),
          citations: parsed.citations.filter((c: unknown) => typeof c === "string"),
        };
      }
    } catch {
      // fall through to raw-text wrap
    }
  }
  return { text: raw.trim(), bullets: [], citations: [] };
}
