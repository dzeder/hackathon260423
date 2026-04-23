"use client";

import { useMemo, useState } from "react";
import type { EventTemplate } from "@/lib/eventsCatalog";

type Props = {
  catalog: EventTemplate[];
  appliedIds: string[];
  onToggle: (id: string) => void;
  onReset: () => void;
};

type SortKey = "impact" | "month" | "name";
type CategoryFilter = "all" | EventTemplate["category"];

const CATEGORY_META: { id: CategoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sports", label: "Sports" },
  { id: "weather", label: "Weather" },
  { id: "holiday", label: "Holiday" },
  { id: "macro", label: "Macro" },
  { id: "supplier", label: "Supplier" },
];

const categoryColor: Record<EventTemplate["category"], string> = {
  sports: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  weather: "bg-sky-500/15 text-sky-200 border-sky-500/30",
  holiday: "bg-pink-500/15 text-pink-200 border-pink-500/30",
  macro: "bg-slate-500/20 text-slate-200 border-slate-500/30",
  supplier: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
};

export function EventPicker({ catalog, appliedIds, onToggle, onReset }: Props) {
  const applied = new Set(appliedIds);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sort, setSort] = useState<SortKey>("impact");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = catalog.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (q && !e.label.toLowerCase().includes(q)) return false;
      return true;
    });
    const sorted = [...filtered];
    if (sort === "impact") {
      sorted.sort((a, b) => Math.abs(b.revenueDeltaPct ?? 0) - Math.abs(a.revenueDeltaPct ?? 0));
    } else if (sort === "month") {
      sorted.sort((a, b) => a.month.localeCompare(b.month));
    } else {
      sorted.sort((a, b) => a.label.localeCompare(b.label));
    }
    return sorted;
  }, [catalog, query, category, sort]);

  return (
    <aside
      className="flex h-full flex-col gap-3 border-r border-slate-800 bg-slate-950/60 p-4"
      data-testid="event-picker"
    >
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Filters
          </h2>
          <p className="text-sm font-semibold text-slate-100">Event library</p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="rounded border border-slate-700 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 disabled:opacity-30"
          disabled={appliedIds.length === 0}
          data-testid="reset-events"
        >
          Reset
        </button>
      </header>

      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events…"
          className="w-full rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-ohfy-accent focus:outline-none"
          data-testid="event-search"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {CATEGORY_META.map((c) => {
          const active = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                active
                  ? "border-ohfy-accent bg-ohfy-accent/15 text-emerald-200"
                  : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500">
        Sort
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="flex-1 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs normal-case tracking-normal text-slate-200 focus:border-ohfy-accent focus:outline-none"
        >
          <option value="impact">Highest impact</option>
          <option value="month">Month</option>
          <option value="name">Name (A→Z)</option>
        </select>
      </label>

      <div className="mt-1 text-[11px] text-slate-500">
        {visible.length} of {catalog.length} • {appliedIds.length} applied
      </div>

      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {visible.map((event) => {
          const isOn = applied.has(event.id);
          const delta = event.revenueDeltaPct ?? 0;
          const deltaColor =
            delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-slate-400";
          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onToggle(event.id)}
                className={`group flex w-full flex-col gap-1.5 rounded-lg border p-2.5 text-left transition ${
                  isOn
                    ? "border-ohfy-accent bg-ohfy-accent/10 shadow-[0_0_0_1px_rgba(34,197,94,0.25)]"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                }`}
                data-testid={`event-${event.id}`}
                data-applied={isOn}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium leading-tight text-slate-100">
                    {event.label}
                  </span>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${categoryColor[event.category]}`}
                  >
                    {event.category}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">{event.month}</span>
                  <span className={`font-mono font-medium ${deltaColor}`}>
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(1)}% rev
                  </span>
                </div>
              </button>
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li className="rounded border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
            No events match these filters.
          </li>
        ) : null}
      </ul>
    </aside>
  );
}
