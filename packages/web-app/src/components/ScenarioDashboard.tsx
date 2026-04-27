"use client";

import { useMemo, useState } from "react";
import type { ForecastMonth } from "@/data/baseline";
import { customerProfile } from "@/data/baseline";
import { applyEvents } from "@/lib/applyEvents";
import type { EventTemplate } from "@/lib/eventsCatalog";
import { runThreeStatement } from "@/lib/threeStatement";
import { BaselineChart } from "./BaselineChart";
import { CopilotPanel } from "./CopilotPanel";
import { EbitdaChart } from "./EbitdaChart";
import { EventPicker } from "./EventPicker";
import { IcMemoButton } from "./IcMemoButton";
import { MarginChart } from "./MarginChart";
import { ThreeStatementTable } from "./ThreeStatementTable";

const SCENARIO_ID = "yellowhammer-6mo";

function sum(months: { [k: string]: number | string }[], key: string): number {
  return months.reduce((acc, m) => acc + (m[key] as number), 0);
}

function fmt$(n: number) {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}k`;
}

function pctDelta(a: number, b: number): { label: string; positive: boolean } {
  if (!b) return { label: "—", positive: true };
  const d = ((a - b) / b) * 100;
  const sign = d > 0 ? "+" : "";
  return { label: `${sign}${d.toFixed(1)}%`, positive: d >= 0 };
}

export function ScenarioDashboard({
  baseline,
  events,
}: {
  baseline: ForecastMonth[];
  events: EventTemplate[];
}) {
  const [appliedIds, setAppliedIds] = useState<string[]>([]);

  const appliedEvents = useMemo(
    () => events.filter((e) => appliedIds.includes(e.id)),
    [events, appliedIds],
  );

  const scenarioMonths = useMemo(
    () => applyEvents(baseline, appliedEvents),
    [baseline, appliedEvents],
  );

  const threeStatement = useMemo(
    () => runThreeStatement(scenarioMonths),
    [scenarioMonths],
  );

  const baselineRevenue = sum(baseline, "revenue");
  const scenarioRevenue = sum(scenarioMonths, "revenue");
  const baselineEbitda = sum(baseline, "ebitda");
  const scenarioEbitda = sum(scenarioMonths, "ebitda");
  const baselineGm = sum(baseline, "gm");
  const scenarioGm = sum(scenarioMonths, "gm");

  const revenueDelta = pctDelta(scenarioRevenue, baselineRevenue);
  const ebitdaDelta = pctDelta(scenarioEbitda, baselineEbitda);
  const gmDelta = pctDelta(scenarioGm, baselineGm);

  function toggle(id: string) {
    setAppliedIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <div className="hidden w-72 shrink-0 lg:block">
        <EventPicker
          catalog={events}
          appliedIds={appliedIds}
          onToggle={toggle}
          onReset={() => setAppliedIds([])}
        />
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/90 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ohfy-accent/15 text-ohfy-accent">
              <LogoMark />
            </div>
            <div>
              <h1
                className="text-base font-semibold text-slate-50"
                data-testid="dashboard-heading"
              >
                {customerProfile.name} · Scenario planner
              </h1>
              <p className="text-xs text-slate-400">
                {customerProfile.hq} — 6-month horizon (May–Oct 2026) · USD thousands
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="hidden rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 sm:inline-block">
              <span className="text-slate-500">Scenario:</span>{" "}
              <span className="font-medium text-slate-200">{SCENARIO_ID}</span>
            </span>
            <span
              className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1"
              data-testid="kpi-event-count-wrapper"
            >
              <span className="text-slate-500">Events:</span>{" "}
              <span className="font-medium text-slate-200" data-testid="kpi-event-count">
                {appliedIds.length}
              </span>
            </span>
          </div>
        </header>

        <div className="flex flex-col gap-5 p-6">
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              label="Revenue (6mo)"
              value={fmt$(scenarioRevenue)}
              delta={revenueDelta.label}
              positive={revenueDelta.positive}
              testId="kpi-revenue-delta"
              sub={`Baseline ${fmt$(baselineRevenue)}`}
            />
            <KpiCard
              label="EBITDA (6mo)"
              value={fmt$(scenarioEbitda)}
              delta={ebitdaDelta.label}
              positive={ebitdaDelta.positive}
              testId="kpi-ebitda-delta"
              sub={`Baseline ${fmt$(baselineEbitda)}`}
            />
            <KpiCard
              label="Gross margin"
              value={fmt$(scenarioGm)}
              delta={gmDelta.label}
              positive={gmDelta.positive}
              sub={`Baseline ${fmt$(baselineGm)}`}
            />
          </section>

          <Card title="Revenue — baseline vs scenario" subtitle="Monthly, $ thousands">
            <BaselineChart baseline={baseline} scenario={scenarioMonths} />
          </Card>

          <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="EBITDA per month" subtitle="Red bars = below baseline">
              <EbitdaChart baseline={baseline} scenario={scenarioMonths} />
            </Card>
            <Card title="Gross margin %" subtitle="Scenario vs baseline">
              <MarginChart baseline={baseline} scenario={scenarioMonths} />
            </Card>
          </section>

          <ThreeStatementTable
            threeStatement={threeStatement}
            baselineEbitda={baselineEbitda}
          />

          <IcMemoButton scenarioId={SCENARIO_ID} appliedEventIds={appliedIds} />
        </div>
      </main>

      <CopilotPanel scenarioId={SCENARIO_ID} appliedEventIds={appliedIds} />
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  positive,
  testId,
  sub,
}: {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  testId?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-semibold text-slate-50">{value}</span>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
            positive
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/40 bg-rose-500/10 text-rose-300"
          }`}
          data-testid={testId}
        >
          {delta}
        </span>
      </div>
      {sub ? <p className="mt-1 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        {subtitle ? (
          <p className="text-[11px] uppercase tracking-wider text-slate-500">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function LogoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 6-6" />
    </svg>
  );
}
