"use client";

import { useState } from "react";

type Props = {
  scenarioId: string;
  appliedEventIds: string[];
};

type IcMemoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; memo: string; wordCount: number; source: "live" | "canned" }
  | { status: "error"; message: string };

export function IcMemoButton({ scenarioId, appliedEventIds }: Props) {
  const [state, setState] = useState<IcMemoState>({ status: "idle" });

  async function generate() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/ic-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, appliedEventIds }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        memo: string;
        wordCount: number;
        source: "live" | "canned";
      };
      setState({
        status: "ready",
        memo: data.memo,
        wordCount: data.wordCount,
        source: data.source,
      });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return (
    <section
      className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
      data-testid="ic-memo-card"
    >
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-100">IC memo (board MD&amp;A)</h2>
        <p className="text-[11px] uppercase tracking-wider text-slate-500">
          120–180 words · CFO voice
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={generate}
          disabled={state.status === "loading"}
          className="rounded-lg bg-ohfy-accent px-3 py-1.5 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="ic-memo-button"
        >
          {state.status === "loading" ? "Generating…" : "Generate IC memo"}
        </button>
        {state.status === "ready" ? (
          <span className="text-[11px] text-slate-500">
            {state.wordCount} words · {state.source}
          </span>
        ) : null}
        {state.status === "error" ? (
          <span className="text-[11px] text-rose-400" data-testid="ic-memo-error">
            {state.message}
          </span>
        ) : null}
      </div>
      {state.status === "ready" ? (
        <p
          className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-200"
          data-testid="ic-memo-output"
        >
          {state.memo}
        </p>
      ) : null}
    </section>
  );
}
