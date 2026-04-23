"use client";

import type { ThreeStatement } from "@/lib/threeStatement";

type Props = {
  threeStatement: ThreeStatement;
  baselineEbitda: number;
};

function fmt(n: number) {
  return `$${Math.round(n).toLocaleString()}k`;
}

function pct(a: number, b: number): string {
  if (!b) return "—";
  const d = ((a - b) / b) * 100;
  const sign = d >= 0 ? "+" : "";
  return `${sign}${d.toFixed(1)}%`;
}

export function ThreeStatementTable({ threeStatement, baselineEbitda }: Props) {
  const { income, balance, cash } = threeStatement;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" data-testid="three-statement-table">
      <section className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-300">
          Income statement (6mo totals)
        </h3>
        <dl className="space-y-1.5 text-sm">
          <Row label="Revenue" value={fmt(income.totals.revenue)} />
          <Row label="COGS" value={fmt(income.totals.cogs)} />
          <Row label="Gross margin" value={fmt(income.totals.gm)} />
          <Row label="Opex" value={fmt(income.totals.opex)} />
          <Row
            label="EBITDA"
            value={fmt(income.totals.ebitda)}
            extra={pct(income.totals.ebitda, baselineEbitda)}
            emphasis
            testId="ebitda-total"
          />
        </dl>
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-300">
          Balance sheet (closing)
        </h3>
        <dl className="space-y-1.5 text-sm">
          <Row label="Cash" value={fmt(balance.closingCashBalance)} />
          <Row label="Accounts receivable" value={fmt(balance.accountsReceivable)} />
          <Row label="Inventory" value={fmt(balance.inventory)} />
          <Row label="Accounts payable" value={fmt(balance.accountsPayable)} />
          <Row label="Equity" value={fmt(balance.equity)} emphasis />
        </dl>
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-300">
          Cash flow
        </h3>
        <dl className="space-y-1.5 text-sm">
          <Row label="Operating" value={fmt(cash.operating)} />
          <Row label="Investing" value={fmt(cash.investing)} />
          <Row label="Financing" value={fmt(cash.financing)} />
          <Row label="Net change" value={fmt(cash.netChange)} emphasis />
        </dl>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  extra,
  emphasis,
  testId,
}: {
  label: string;
  value: string;
  extra?: string;
  emphasis?: boolean;
  testId?: string;
}) {
  return (
    <div
      className={`flex items-baseline justify-between ${emphasis ? "border-t border-slate-700 pt-1.5 text-slate-50" : "text-slate-200"}`}
    >
      <dt className={emphasis ? "font-semibold" : ""}>{label}</dt>
      <dd className={emphasis ? "font-semibold" : ""} data-testid={testId}>
        {value}
        {extra ? (
          <span className="ml-2 text-xs font-normal text-ohfy-accent">{extra}</span>
        ) : null}
      </dd>
    </div>
  );
}
