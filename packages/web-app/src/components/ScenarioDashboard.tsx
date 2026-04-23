"use client";

import { useMemo, useState } from "react";
import { baselineForecast, yellowhammerProfile } from "@/data/baseline";
import { applyEvents } from "@/lib/applyEvents";
import { eventsCatalog } from "@/lib/eventsCatalog";
import { runThreeStatement } from "@/lib/threeStatement";
import { BaselineChart } from "./BaselineChart";
import { CopilotPanel } from "./CopilotPanel";
import { EventPicker } from "./EventPicker";
import { ThreeStatementTable } from "./ThreeStatementTable";

const SCENARIO_ID = "yellowhammer-6mo";

function totalRevenue(months: { revenue: number }[]) {
  return months.reduce((acc, m) => acc + m.revenue, 0);
}

function totalEbitda(months: { ebitda: number }[]) {
  return months.reduce((acc, m) => acc + m.ebitda, 0);
}

export function ScenarioDashboard() {
  const [appliedIds, setAppliedIds] = useState<string[]>([]);

  const appliedEvents = useMemo(
    () => eventsCatalog.filter((e) => appliedIds.includes(e.id)),
    [appliedIds],
  );

  const scenarioMonths = useMemo(
    () => applyEvents(baselineForecast, appliedEvents),
    [appliedEvents],
  );

  const threeStatement = useMemo(
    () => runThreeStatement(scenarioMonths),
    [scenarioMonths],
  );

  const baselineEbitda = totalEbitda(baselineForecast);
  const scenarioEbitda = totalEbitda(scenarioMonths);
  const baselineRevenue = totalRevenue(baselineForecast);
  const scenarioRevenue = totalRevenue(scenarioMonths);

  function toggle(id: string) {
    setAppliedIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)_340px]">
      <EventPicker
        catalog={eventsCatalog}
        appliedIds={appliedIds}
        onToggle={toggle}
        onReset={() => setAppliedIds([])}
      />

      <section className="flex flex-col gap-6">
        <header className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-50" data-testid="dashboard-heading">
              {yellowhammerProfile.name} · Scenario planner
            </h1>
            <p className="text-sm text-slate-400">
              {yellowhammerProfile.hq} — 6-month demo horizon (May–Oct 2026). USD thousands.
            </p>
          </div>
          <div className="flex gap-4 text-xs text-slate-300">
            <KPI
              label="Revenue Δ"
              value={`${(((scenarioRevenue - baselineRevenue) / baselineRevenue) * 100).toFixed(1)}%`}
              testId="kpi-revenue-delta"
            />
            <KPI
              label="EBITDA Δ"
              value={`${(((scenarioEbitda - baselineEbitda) / baselineEbitda) * 100).toFixed(1)}%`}
              testId="kpi-ebitda-delta"
            />
            <KPI
              label="Events applied"
              value={String(appliedIds.length)}
              testId="kpi-event-count"
            />
          </div>
        </header>

        <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
            Revenue — baseline vs scenario
          </h2>
          <BaselineChart baseline={baselineForecast} scenario={scenarioMonths} />
        </div>

        <ThreeStatementTable
          threeStatement={threeStatement}
          baselineEbitda={baselineEbitda}
        />
      </section>

      <CopilotPanel scenarioId={SCENARIO_ID} appliedEventIds={appliedIds} />
    </div>
  );
}

function KPI({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="text-lg font-semibold text-slate-100" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}
