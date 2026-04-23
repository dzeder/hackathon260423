"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ForecastMonth } from "@/data/baseline";

type Props = {
  baseline: ForecastMonth[];
  scenario: ForecastMonth[];
};

function marginPct(m: ForecastMonth) {
  return m.revenue ? (m.gm / m.revenue) * 100 : 0;
}

export function MarginChart({ baseline, scenario }: Props) {
  const data = baseline.map((b, i) => ({
    month: b.month,
    baseline: +marginPct(b).toFixed(2),
    scenario: +marginPct(scenario[i] ?? b).toFixed(2),
  }));

  return (
    <div className="h-60 w-full" data-testid="margin-chart">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <defs>
            <linearGradient id="marginGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="marginBase" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#64748b" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#64748b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
          <YAxis stroke="#94a3b8" fontSize={11} domain={["auto", "auto"]} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 6,
              color: "#f1f5f9",
              fontSize: 12,
            }}
            formatter={(v: number) => [`${v.toFixed(2)}%`, ""]}
          />
          <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="baseline"
            stroke="#94a3b8"
            strokeDasharray="4 4"
            fill="url(#marginBase)"
            name="Baseline GM%"
          />
          <Area
            type="monotone"
            dataKey="scenario"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#marginGrad)"
            name="Scenario GM%"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
