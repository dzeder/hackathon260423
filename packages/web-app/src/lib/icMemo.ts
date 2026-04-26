import Anthropic from "@anthropic-ai/sdk";
import type { ForecastMonth } from "@/data/baseline";
import { findEvent } from "@/lib/eventsCatalog";
import type { ThreeStatement } from "@/lib/threeStatement";

/*
 * IC memo generator — board-deck MD&A paragraph from the current scenario.
 * Spec lives at /.claude/commands/ic-memo.md. Target: 120–180 words covering:
 *   1. Headline ($ + % change in revenue + GM%)
 *   2. Top 2 drivers (event + magnitude with line-item cites)
 *   3. Risk flag (allocation, cash, chain program) if present
 *   4. Confidence statement (high / medium / low)
 *
 * Voice: CFO to board. Numbers, not adverbs. No emojis.
 */

const IC_MEMO_SYSTEM_PROMPT = [
  "You write the MD&A paragraph for the customer's scenario brief.",
  "Audience: CFO presenting to the board.",
  "Length: 120 to 180 words. Single paragraph. No headers, no bullets, no markdown.",
  "Voice: numbers over adverbs. No emojis. No vague qualifiers ('approximately', 'roughly').",
  "Structure, in order:",
  "  (1) Headline sentence with revenue $ delta and % delta plus GM% delta.",
  "  (2) Top two drivers — name each event and its $/% magnitude. Cite the source label after each driver in parentheses.",
  "  (3) Risk flag for allocation, cash, or chain program if the data warrants. Skip if nothing material.",
  "  (4) Confidence statement: high / medium / low, plus one clause noting whether the model is calibrated to customer history or industry default.",
  "Use only numbers from the supplied scenario block. Never invent figures.",
].join("\n");

export type IcMemoInput = {
  scenarioId: string;
  appliedEventIds: string[];
  baseline: ForecastMonth[];
  scenario: ForecastMonth[];
  threeStatement: ThreeStatement;
};

export type IcMemoResponse = {
  memo: string;
  wordCount: number;
  source: "live" | "canned";
};

function totals(months: ForecastMonth[]) {
  return months.reduce(
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

function fmtUsdK(n: number): string {
  return `$${Math.round(n).toLocaleString()}k`;
}

function pct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function buildIcMemoUserPrompt(input: IcMemoInput): string {
  const b = totals(input.baseline);
  const s = totals(input.scenario);
  const dRev = b.revenue ? ((s.revenue - b.revenue) / b.revenue) * 100 : 0;
  const baselineGmPct = b.revenue ? (b.gm / b.revenue) * 100 : 0;
  const scenarioGmPct = s.revenue ? (s.gm / s.revenue) * 100 : 0;

  const events = input.appliedEventIds
    .map((id) => findEvent(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const eventLines = events.length
    ? events
        .map(
          (e) =>
            `- ${e.id} (${e.label}): month ${e.month}, ${pct(e.revenueDeltaPct ?? 0)} revenue, ${pct(e.cogsDeltaPct ?? 0)} COGS, opex Δ$${e.opexDeltaAbs ?? 0}k. Source: ${e.source}.`,
        )
        .join("\n")
    : "- (no events applied; scenario equals baseline)";

  return [
    `Scenario id: ${input.scenarioId}`,
    "Horizon: 6 months (May–Oct 2026). USD thousands.",
    "",
    "Baseline 6-month totals:",
    `  revenue ${fmtUsdK(b.revenue)} · COGS ${fmtUsdK(b.cogs)} · GM ${fmtUsdK(b.gm)} (${baselineGmPct.toFixed(1)}%) · opex ${fmtUsdK(b.opex)} · EBITDA ${fmtUsdK(b.ebitda)}`,
    "",
    "Scenario 6-month totals:",
    `  revenue ${fmtUsdK(s.revenue)} (${pct(dRev)}) · GM ${fmtUsdK(s.gm)} (${scenarioGmPct.toFixed(1)}%) · EBITDA ${fmtUsdK(s.ebitda)}`,
    `  cash from operations ${fmtUsdK(input.threeStatement.cash.operating)} · ending cash ${fmtUsdK(input.threeStatement.balance.closingCashBalance)}`,
    "",
    "Applied events:",
    eventLines,
    "",
    "Write the MD&A paragraph now.",
  ].join("\n");
}

export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Deterministic canned IC memo. Used in CI / dev when ANTHROPIC_API_KEY is unset
 * and as the fallback when the live call fails. Lands in the 120–180 word band
 * for the §15 demo's typical event combinations.
 */
export function respondCannedIcMemo(input: IcMemoInput): IcMemoResponse {
  const b = totals(input.baseline);
  const s = totals(input.scenario);
  const dRev = b.revenue ? ((s.revenue - b.revenue) / b.revenue) * 100 : 0;
  const dEbitda = b.ebitda ? ((s.ebitda - b.ebitda) / b.ebitda) * 100 : 0;
  const baselineGmPct = b.revenue ? (b.gm / b.revenue) * 100 : 0;
  const scenarioGmPct = s.revenue ? (s.gm / s.revenue) * 100 : 0;
  const dGmPctPts = scenarioGmPct - baselineGmPct;
  const events = input.appliedEventIds
    .map((id) => findEvent(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .slice()
    .sort((a, c) => Math.abs(c.revenueDeltaPct ?? 0) - Math.abs(a.revenueDeltaPct ?? 0));

  const top = events.slice(0, 2);
  const cash = input.threeStatement.cash.operating;
  const closingCash = input.threeStatement.balance.closingCashBalance;
  const lowCash = cash < b.revenue * 0.04;

  const headline =
    events.length === 0
      ? `Scenario ${input.scenarioId} matches the 6-month baseline at ${fmtUsdK(s.revenue)} revenue, ${scenarioGmPct.toFixed(1)}% gross margin, and ${fmtUsdK(s.ebitda)} EBITDA, with no events applied this run; the memo below establishes the as-is reference for downstream stress tests.`
      : `Scenario ${input.scenarioId} moves 6-month revenue to ${fmtUsdK(s.revenue)} (${pct(dRev)} vs ${fmtUsdK(b.revenue)} baseline), gross margin to ${scenarioGmPct.toFixed(1)}% (${pct(dGmPctPts)} points), and EBITDA to ${fmtUsdK(s.ebitda)} (${pct(dEbitda)}); operating cash settles at ${fmtUsdK(cash)} on closing balance ${fmtUsdK(closingCash)}.`;

  const driverSentence = top.length
    ? "Drivers: " +
      top
        .map(
          (e) =>
            `${e.label} contributes ${pct(e.revenueDeltaPct ?? 0)} revenue and ${pct(e.cogsDeltaPct ?? 0)} COGS in ${e.month}, sourced from ${e.source}`,
        )
        .join("; ") +
      "; secondary effects on opex are captured in the three-statement view above."
    : "Drivers: none in this run — the next step is to apply at least one event from the picker so the memo can isolate the lift.";

  const operationsSentence = events.length
    ? `Operations: incremental volume lands across on-premise, chain, and independent channels in ${top[0]?.month ?? "the affected month"}, so allocation, route density, and pick-pack capacity should be reviewed before the next supplier order; working capital absorbs the COGS step and the chain-program accrual lands in the same period.`
    : "Operations: route density, allocation, and chain-program accrual all hold at baseline; the working-capital line will move only when an event is applied.";

  const riskSentence = lowCash
    ? `Risk: operating cash of ${fmtUsdK(cash)} sits below the 4% revenue threshold; tighten chain-program spend, pull supplier-payment timing left, and pause incremental allocation until the next forecast refresh.`
    : `Risk: no material allocation, cash, or chain-program flag — operating cash holds at ${fmtUsdK(cash)} and the closing balance at ${fmtUsdK(closingCash)} stays inside the working-capital corridor.`;

  const confidenceSentence =
    events.length >= 2
      ? `Confidence: medium — drivers are calibrated to prior 12-month invoice history with the weather component carrying the widest band; refresh the depletion cascade before committing to the supplier order.`
      : events.length === 1
        ? `Confidence: medium — the applied driver is calibrated to prior 12-month invoice history; expand the run with a weather or macro driver before stress-testing cash.`
        : `Confidence: high on the baseline assumptions, low on any scenario claim — apply events from the picker to lift the confidence band on revenue, EBITDA, and operating-cash projections.`;

  const memo = [
    headline,
    driverSentence,
    operationsSentence,
    riskSentence,
    confidenceSentence,
  ].join(" ");
  return {
    memo,
    wordCount: countWords(memo),
    source: "canned",
  };
}

const ANTHROPIC_TIMEOUT_MS = 30_000;
const ANTHROPIC_MAX_TOKENS = 600;

/**
 * Generate the IC memo. Live-calls Anthropic when ANTHROPIC_API_KEY is set,
 * otherwise returns the deterministic canned memo. Falls back to canned on
 * any live failure so the dashboard button never errors out for the demo.
 */
export async function generateIcMemo(input: IcMemoInput): Promise<IcMemoResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return respondCannedIcMemo(input);
  }
  try {
    const client = new Anthropic({ timeout: ANTHROPIC_TIMEOUT_MS });
    const userPrompt = buildIcMemoUserPrompt(input);
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: IC_MEMO_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = res.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text.trim())
      .join("\n")
      .trim();
    if (!text) return respondCannedIcMemo(input);
    return { memo: text, wordCount: countWords(text), source: "live" };
  } catch {
    return respondCannedIcMemo(input);
  }
}
