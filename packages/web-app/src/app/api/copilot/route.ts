import { NextResponse } from "next/server";
import { z } from "zod";
import { baselineForecast } from "@/data/baseline";
import { applyEvents } from "@/lib/applyEvents";
import { respond } from "@/lib/copilot";
import { eventsCatalog } from "@/lib/eventsCatalog";
import { runThreeStatement } from "@/lib/threeStatement";
import { runCopilotTurn } from "@/lib/copilotClaude";
import { checkAuth } from "@/lib/copilotAuth";
import {
  appendTurn,
  getDailyUsage,
  getOrCreateActive,
  incrementUsage,
  listThreads,
  loadHistoryAsApiMessages,
  loadHistoryForDisplay,
  startNewThread,
  type Scope,
} from "@/lib/copilotMemory";
import { formatRecallForPrompt, recallForUser } from "@/lib/copilotRecall";

export const runtime = "nodejs";

const Body = z.object({
  prompt: z.string().min(1).max(2000),
  scenarioId: z.string().min(1),
  appliedEventIds: z.array(z.string()).default([]),
  conversationId: z.string().optional(),
  newThread: z.boolean().optional(),
  userId: z.string().optional(),
  // Optional model override — useful for flagged-hard turns to use Opus.
  model: z.string().optional(),
});

const MAX_HISTORY_FOR_REPLAY = 30;

// Per-user-per-day hard cap. Configurable via env so different customers can
// buy different ceilings without a code change.
const MAX_TURNS_PER_DAY = Number(process.env.COPILOT_MAX_TURNS_PER_DAY ?? "200");
const MAX_COST_USD_PER_DAY = Number(process.env.COPILOT_MAX_COST_USD_PER_DAY ?? "25");
const MAX_COST_USD_PER_TURN = Number(process.env.COPILOT_MAX_COST_USD_PER_TURN ?? "0.30");

function scopeFromRequest(userIdFromBody: string | undefined): Scope {
  return {
    customerId: process.env.SF_CUSTOMER_ID ?? "yellowhammer",
    userId: userIdFromBody ?? "demo",
  };
}

// GET /api/copilot?userId=...[&conversationId=...][&startNew=1]
export async function GET(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "demo";
  const scope = scopeFromRequest(userId);
  const startNew = url.searchParams.get("startNew") === "1";
  let conversationId = url.searchParams.get("conversationId");
  if (startNew) {
    conversationId = await startNewThread(scope);
  } else if (!conversationId) {
    conversationId = await getOrCreateActive(scope);
  }
  const [messages, threads] = await Promise.all([
    loadHistoryForDisplay(conversationId, scope, 100),
    listThreads(scope, 15),
  ]);
  return NextResponse.json({ conversationId, messages, threads });
}

export async function POST(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid body" },
      { status: 400 },
    );
  }

  const scope = scopeFromRequest(parsed.userId);
  const scenarioContext = buildScenarioContext(parsed);

  // Conversation resolution up front so all code paths share one id.
  let conversationId = parsed.conversationId ?? null;
  if (parsed.newThread || !conversationId) {
    conversationId = parsed.newThread
      ? await startNewThread(scope)
      : await getOrCreateActive(scope);
  }

  // Rate / cost guardrails.
  const usage = await getDailyUsage(scope);
  if (usage.turnCount >= MAX_TURNS_PER_DAY) {
    return NextResponse.json(
      {
        error: "rate_limit_exceeded",
        detail: `Daily turn cap reached (${MAX_TURNS_PER_DAY}). Resets 00:00 UTC.`,
        conversationId,
      },
      { status: 429 },
    );
  }
  if (usage.costUsd >= MAX_COST_USD_PER_DAY) {
    return NextResponse.json(
      {
        error: "cost_cap_exceeded",
        detail: `Daily spend cap reached ($${usage.costUsd.toFixed(2)} of $${MAX_COST_USD_PER_DAY.toFixed(2)}). Resets 00:00 UTC.`,
        conversationId,
      },
      { status: 429 },
    );
  }

  // No API key -> canned path (still persists so the thread UI shows continuity).
  if (!process.env.ANTHROPIC_API_KEY) {
    const canned = respondCanned(parsed);
    try {
      await appendTurn(conversationId, scope, [
        { role: "user", content: [{ type: "text", text: parsed.prompt }] },
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
    await incrementUsage(scope, 0);
    return NextResponse.json({ ...canned, source: "canned", conversationId });
  }

  // Live turn.
  const priorHistory = await loadHistoryAsApiMessages(
    conversationId,
    scope,
    MAX_HISTORY_FOR_REPLAY,
  );
  let recallBlock: string | null = null;
  try {
    const recalled = await recallForUser(scope, conversationId, parsed.prompt);
    recallBlock = formatRecallForPrompt(recalled);
  } catch (err) {
    console.warn("copilot: recall failed", err instanceof Error ? err.message : err);
  }

  try {
    const turn = await runCopilotTurn(
      {
        userText: parsed.prompt,
        priorHistory,
        recallBlock,
        scenarioContext,
        model: parsed.model,
      },
      { maxCostUsd: MAX_COST_USD_PER_TURN },
    );

    try {
      await appendTurn(conversationId, scope, turn.newMessages);
    } catch (persistErr) {
      console.warn(
        "copilot: persist failed",
        persistErr instanceof Error ? persistErr.message : persistErr,
      );
    }
    await incrementUsage(scope, turn.costUsd);

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
      model: turn.model,
      costUsd: turn.costUsd,
      costCapHit: turn.costCapHit,
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
      // fall through
    }
  }
  return { text: raw.trim(), bullets: [], citations: [] };
}
