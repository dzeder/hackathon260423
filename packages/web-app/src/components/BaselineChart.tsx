"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

export function BaselineChart({ baseline, scenario }: Props) {
  const data = baseline.map((b, i) => ({
    month: b.month,
    baseline: b.revenue,
    scenario: scenario[i]?.revenue ?? b.revenue,
  }));

  return (
    <div className="h-72 w-full" data-testid="revenue-chart">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
          <YAxis stroke="#94a3b8" fontSize={12} />
          <Tooltip
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }}
            formatter={(v: number) => [`$${v.toLocaleString()}k`, ""]}
          />
          <Legend wrapperStyle={{ color: "#cbd5e1" }} />
          <Line
            type="monotone"
            dataKey="baseline"
            stroke="#64748b"
            strokeDasharray="5 5"
            dot={false}
            name="Baseline"
          />
          <Line
            type="monotone"
            dataKey="scenario"
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ r: 3 }}
            name="Scenario"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
