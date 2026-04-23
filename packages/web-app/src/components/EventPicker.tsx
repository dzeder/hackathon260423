"use client";

import type { EventTemplate } from "@/lib/eventsCatalog";

type Props = {
  catalog: EventTemplate[];
  appliedIds: string[];
  onToggle: (id: string) => void;
  onReset: () => void;
};

const categoryColor: Record<EventTemplate["category"], string> = {
  sports: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  weather: "bg-sky-500/20 text-sky-200 border-sky-500/40",
  holiday: "bg-pink-500/20 text-pink-200 border-pink-500/40",
  macro: "bg-slate-500/30 text-slate-200 border-slate-500/40",
  supplier: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
};

export function EventPicker({ catalog, appliedIds, onToggle, onReset }: Props) {
  const applied = new Set(appliedIds);
  return (
    <aside
      className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800/40 p-4"
      data-testid="event-picker"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          Events
        </h2>
        <button
          type="button"
          onClick={onReset}
          className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40"
          disabled={appliedIds.length === 0}
          data-testid="reset-events"
        >
          Reset
        </button>
      </header>

      <ul className="flex flex-col gap-2">
        {catalog.map((event) => {
          const isOn = applied.has(event.id);
          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onToggle(event.id)}
                className={`w-full rounded border p-2 text-left text-sm transition ${
                  isOn
                    ? "border-ohfy-accent bg-ohfy-accent/10"
                    : "border-slate-700 bg-slate-900/60 hover:border-slate-500"
                }`}
                data-testid={`event-${event.id}`}
                data-applied={isOn}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-100">{event.label}</span>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${categoryColor[event.category]}`}
                  >
                    {event.category}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                  <span>{event.month}</span>
                  <span>Δrev {event.revenueDeltaPct?.toFixed(1)}%</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
