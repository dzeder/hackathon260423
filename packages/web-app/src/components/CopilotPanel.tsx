"use client";

import { useEffect, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<CopilotResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-ohfy-accent px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-400"
        data-testid="copilot-open"
        aria-label="Open copilot"
      >
        <ChatBubbleIcon />
        Ask copilot
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <section
            role="dialog"
            aria-label="Copilot chat"
            className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/95 p-5 shadow-2xl shadow-slate-950/60 backdrop-blur"
            data-testid="copilot-panel"
          >
            <header className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Copilot
                </h2>
                <p className="text-sm font-semibold text-slate-100">Ask about this scenario</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Grounded in baseline + {appliedEventIds.length} applied event{appliedEventIds.length === 1 ? "" : "s"}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-100"
                aria-label="Close copilot"
                data-testid="copilot-close"
              >
                <CloseIcon />
              </button>
            </header>

            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void submit(s)}
                  disabled={pending}
                  className="rounded-full border border-slate-800 bg-slate-950/40 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-slate-600 hover:text-slate-100 disabled:opacity-40"
                  data-testid="copilot-suggestion"
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              {error ? (
                <div className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
                  {error}
                </div>
              ) : null}

              {!response && !error ? (
                <p className="m-auto text-center text-xs text-slate-500">
                  Ask a question or pick a suggestion to get started.
                </p>
              ) : null}

              {response ? (
                <article className="text-sm text-slate-100" data-testid="copilot-response">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                        response.source === "live"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                          : "border-slate-700 bg-slate-800 text-slate-300"
                      }`}
                    >
                      {response.source === "live" ? "Claude live" : "Demo response"}
                    </span>
                  </div>
                  <p className="leading-relaxed">{response.text}</p>
                  {response.bullets.length ? (
                    <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
                      {response.bullets.map((b, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-[5px] block h-1.5 w-1.5 shrink-0 rounded-full bg-ohfy-accent" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {response.citations.length ? (
                    <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-500">
                      Sources: {response.citations.join(" · ")}
                    </p>
                  ) : null}
                </article>
              ) : null}
            </div>

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
                className="min-h-[72px] resize-none rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-ohfy-accent focus:outline-none"
                data-testid="copilot-prompt"
              />
              <button
                type="submit"
                disabled={pending || !prompt.trim()}
                className="rounded-lg bg-ohfy-accent px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-40"
                data-testid="copilot-submit"
              >
                {pending ? "Thinking…" : "Ask copilot"}
              </button>
            </form>
          </section>
        </>
      ) : null}
    </>
  );
}

function ChatBubbleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}
