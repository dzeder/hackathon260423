"use client";

import { useState } from "react";
import type { CopilotResponse } from "@/lib/copilot";

type Props = {
  scenarioId: string;
  appliedEventIds: string[];
};

const SUGGESTIONS = [
  "What happens to EBITDA if Iron Bowl weekend lands?",
  "Walk me through revenue for this scenario",
  "What's the biggest downside risk?",
];

export function CopilotPanel({ scenarioId, appliedEventIds }: Props) {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<CopilotResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(rawPrompt: string) {
    const finalPrompt = rawPrompt.trim();
    if (!finalPrompt) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: finalPrompt,
          scenarioId,
          appliedEventIds,
        }),
      });
      if (!res.ok) throw new Error(`Copilot failed: ${res.status}`);
      const json = (await res.json()) as CopilotResponse;
      setResponse(json);
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPending(false);
    }
  }

  return (
    <aside
      className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800/40 p-4"
      data-testid="copilot-panel"
    >
      <header>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          Copilot
        </h2>
        <p className="text-xs text-slate-400">
          Ask about this scenario. Grounded in the baseline + applied events.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(prompt);
        }}
        className="flex flex-col gap-2"
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask about EBITDA, revenue, or specific events…"
          className="min-h-[80px] rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-ohfy-accent focus:outline-none"
          data-testid="copilot-prompt"
        />
        <button
          type="submit"
          disabled={pending || !prompt.trim()}
          className="rounded bg-ohfy-accent px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-emerald-400 disabled:opacity-40"
          data-testid="copilot-submit"
        >
          {pending ? "Thinking…" : "Ask copilot"}
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void submit(s)}
            disabled={pending}
            className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-40"
            data-testid="copilot-suggestion"
          >
            {s}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded border border-red-500/50 bg-red-500/10 p-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      {response ? (
        <article
          className="rounded border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-100"
          data-testid="copilot-response"
        >
          <p>{response.text}</p>
          {response.bullets.length ? (
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-300">
              {response.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : null}
          {response.citations.length ? (
            <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-500">
              Sources: {response.citations.join(" · ")}
            </p>
          ) : null}
        </article>
      ) : null}
    </aside>
  );
}
