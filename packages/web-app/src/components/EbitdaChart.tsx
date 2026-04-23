"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

export function EbitdaChart({ baseline, scenario }: Props) {
  const data = baseline.map((b, i) => {
    const s = scenario[i]?.ebitda ?? b.ebitda;
    return {
      month: b.month,
      baseline: b.ebitda,
      scenario: s,
      delta: s - b.ebitda,
    };
  });

  return (
    <div className="h-60 w-full" data-testid="ebitda-chart">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
          <YAxis stroke="#94a3b8" fontSize={11} />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 6,
              color: "#f1f5f9",
              fontSize: 12,
            }}
            formatter={(v: number) => [`$${v.toLocaleString()}k`, ""]}
          />
          <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
          <Bar dataKey="baseline" fill="#475569" name="Baseline" radius={[4, 4, 0, 0]} />
          <Bar dataKey="scenario" name="Scenario" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.delta >= 0 ? "#22c55e" : "#f43f5e"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
