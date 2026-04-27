import type { ForecastMonth } from "@/data/baseline";
import { findEvent, type EventTemplate } from "@/lib/eventsCatalog";
import type { ThreeStatement } from "@/lib/threeStatement";

export type CopilotQuery = {
  prompt: string;
  scenarioId: string;
  appliedEventIds: string[];
  baseline: ForecastMonth[];
  scenario: ForecastMonth[];
  threeStatement: ThreeStatement;
  /** Active event-template catalog (from getEventsCatalog() upstream). */
  catalog: EventTemplate[];
};

export type CopilotResponse = {
  text: string;
  bullets: string[];
  citations: string[];
  source?: "live" | "canned";
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

function fmtUsdK(n: number) {
  return `$${Math.round(n).toLocaleString()}k`;
}

function fmtPct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function respond(q: CopilotQuery): CopilotResponse {
  const lower = q.prompt.toLowerCase();
  const b = totals(q.baseline);
  const s = totals(q.scenario);
  const dRev = b.revenue ? ((s.revenue - b.revenue) / b.revenue) * 100 : 0;
  const dEbitda = b.ebitda ? ((s.ebitda - b.ebitda) / b.ebitda) * 100 : 0;
  const events = q.appliedEventIds.map((id) => findEvent(q.catalog, id)).filter(Boolean);

  if (lower.includes("iron bowl") || lower.includes("football") || lower.includes("cfp")) {
    const e = findEvent(q.catalog, "iron-bowl-2026");
    return {
      text: `Iron Bowl weekend is a consistent October driver for on-premise and chain programs. Historically we model +${e?.revenueDeltaPct}% revenue with +${e?.cogsDeltaPct}% COGS and a small opex bump for additional routing.`,
      bullets: [
        `Event month: ${e?.month}`,
        `Revenue delta: ${fmtPct(e?.revenueDeltaPct ?? 0)}`,
        `COGS delta: ${fmtPct(e?.cogsDeltaPct ?? 0)}`,
        `Source: ${e?.source}`,
      ],
      citations: ["CFBD college football calendar", "customer profile"],
    };
  }

  if (lower.includes("ebitda") || lower.includes("margin") || lower.includes("profit")) {
    return {
      text: `Scenario EBITDA is ${fmtUsdK(s.ebitda)} vs a baseline of ${fmtUsdK(b.ebitda)} (${fmtPct(dEbitda)}). The biggest swing factors are the ${events.length} applied event(s). Cash from operations is running ${fmtUsdK(q.threeStatement.cash.operating)} on the 6-month horizon.`,
      bullets: [
        `Baseline EBITDA (6mo): ${fmtUsdK(b.ebitda)}`,
        `Scenario EBITDA (6mo): ${fmtUsdK(s.ebitda)}`,
        `Delta: ${fmtPct(dEbitda)}`,
        `Operating cash: ${fmtUsdK(q.threeStatement.cash.operating)}`,
      ],
      citations: ["three-statement model §15.2", `${events.length} applied events`],
    };
  }

  if (lower.includes("revenue") || lower.includes("top line") || lower.includes("sales")) {
    return {
      text: `Baseline revenue is ${fmtUsdK(b.revenue)} across the 6-month horizon. With ${q.appliedEventIds.length} event(s) applied, scenario revenue is ${fmtUsdK(s.revenue)} (${fmtPct(dRev)}).`,
      bullets: [
        `Baseline 6mo revenue: ${fmtUsdK(b.revenue)}`,
        `Scenario 6mo revenue: ${fmtUsdK(s.revenue)}`,
        `Delta: ${fmtPct(dRev)}`,
      ],
      citations: ["baseline forecast (seed)"],
    };
  }

  if (lower.includes("risk") || lower.includes("downside") || lower.includes("hurricane")) {
    const e = findEvent(q.catalog, "gulf-hurricane-cat-3");
    return {
      text: `The Mobile hurricane scenario is the largest modeled downside: ${fmtPct(e?.revenueDeltaPct ?? 0)} revenue with opex up ${fmtUsdK(e?.opexDeltaAbs ?? 0)} due to emergency routing and DC downtime.`,
      bullets: [
        `Event month: ${e?.month}`,
        `Revenue delta: ${fmtPct(e?.revenueDeltaPct ?? 0)}`,
        `Opex delta: +${fmtUsdK(e?.opexDeltaAbs ?? 0)}`,
        `Source: ${e?.source}`,
      ],
      citations: ["NOAA hurricane track", "Mobile DC contingency plan"],
    };
  }

  return {
    text: `I can answer questions about EBITDA, revenue, specific events from the catalog, or downside risks. You have ${q.appliedEventIds.length} event(s) applied to scenario '${q.scenarioId}'.`,
    bullets: [
      `Applied events: ${q.appliedEventIds.length ? q.appliedEventIds.join(", ") : "none"}`,
      `Baseline EBITDA (6mo): ${fmtUsdK(b.ebitda)}`,
      `Scenario EBITDA (6mo): ${fmtUsdK(s.ebitda)}`,
    ],
    citations: ["Ohanafy Plan demo kernel"],
  };
}
