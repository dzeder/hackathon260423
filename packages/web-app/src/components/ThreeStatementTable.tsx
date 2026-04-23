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
    <div
      className="grid grid-cols-1 gap-5 lg:grid-cols-3"
      data-testid="three-statement-table"
    >
      <TableCard title="Income statement" subtitle="6mo totals">
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
      </TableCard>

      <TableCard title="Balance sheet" subtitle="Closing">
        <Row label="Cash" value={fmt(balance.closingCashBalance)} />
        <Row label="Accounts receivable" value={fmt(balance.accountsReceivable)} />
        <Row label="Inventory" value={fmt(balance.inventory)} />
        <Row label="Accounts payable" value={fmt(balance.accountsPayable)} />
        <Row label="Equity" value={fmt(balance.equity)} emphasis />
      </TableCard>

      <TableCard title="Cash flow" subtitle="6mo">
        <Row label="Operating" value={fmt(cash.operating)} />
        <Row label="Investing" value={fmt(cash.investing)} />
        <Row label="Financing" value={fmt(cash.financing)} />
        <Row label="Net change" value={fmt(cash.netChange)} emphasis />
      </TableCard>
    </div>
  );
}

function TableCard({
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
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        {subtitle ? (
          <span className="text-[11px] uppercase tracking-wider text-slate-500">
            {subtitle}
          </span>
        ) : null}
      </header>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </section>
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
      className={`flex items-baseline justify-between ${
        emphasis ? "border-t border-slate-800 pt-2 text-slate-50" : "text-slate-300"
      }`}
    >
      <dt className={emphasis ? "font-semibold" : ""}>{label}</dt>
      <dd className={emphasis ? "font-semibold" : ""} data-testid={testId}>
        <span className="font-mono">{value}</span>
        {extra ? (
          <span className="ml-2 text-xs font-normal text-ohfy-accent">{extra}</span>
        ) : null}
      </dd>
    </div>
  );
}
