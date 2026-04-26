"use client";

import { useEffect, useRef, useState } from "react";
import type { CopilotResponse } from "@/lib/copilot";

type Props = {
  scenarioId: string;
  appliedEventIds: string[];
};

type Role = "user" | "assistant";

type DisplayMessage = {
  id: string;
  role: Role;
  // Raw text for rendering. Assistant messages may have JSON-shaped text
  // holding {text, bullets, citations} — if parseable we display structured.
  text: string;
  createdAt?: number;
  bullets?: string[];
  citations?: string[];
  source?: "live" | "canned";
  toolCalls?: Array<{ name: string; ok: boolean; elapsedMs: number }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  pending?: boolean;
};

const SUGGESTIONS = [
  "What happens to EBITDA if Iron Bowl weekend lands?",
  "Walk me through revenue for this scenario",
  "What's the biggest downside risk?",
];

const LS_CONVERSATION_KEY = "copilot:conversationId";
const USER_ID = "demo";

// Try to interpret an assistant message's text as our JSON shape.
function maybeParseCopilotShape(text: string): {
  text: string;
  bullets: string[];
  citations: string[];
} | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (
      parsed &&
      typeof parsed.text === "string" &&
      Array.isArray(parsed.bullets) &&
      Array.isArray(parsed.citations)
    ) {
      return {
        text: parsed.text,
        bullets: parsed.bullets.filter((b: unknown): b is string => typeof b === "string"),
        citations: parsed.citations.filter((c: unknown): c is string => typeof c === "string"),
      };
    }
  } catch {
    // not JSON; fall through
  }
  return null;
}

export function CopilotPanel({ scenarioId, appliedEventIds }: Props) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Lazy-load history the first time the panel opens. We keep it for the
  // lifetime of the page so reopening doesn't refetch.
  useEffect(() => {
    if (!open || historyLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const savedId =
          typeof window !== "undefined"
            ? window.localStorage.getItem(LS_CONVERSATION_KEY)
            : null;
        const url = new URL("/api/copilot", window.location.origin);
        url.searchParams.set("userId", USER_ID);
        if (savedId) url.searchParams.set("conversationId", savedId);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`history load failed: ${res.status}`);
        const body = (await res.json()) as {
          conversationId: string;
          messages: Array<{ id: string; role: Role; text: string; createdAt: number }>;
        };
        if (cancelled) return;
        setConversationId(body.conversationId);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(LS_CONVERSATION_KEY, body.conversationId);
        }
        const restored: DisplayMessage[] = body.messages.map((m) => {
          if (m.role === "assistant") {
            const shape = maybeParseCopilotShape(m.text);
            if (shape) {
              return {
                id: m.id,
                role: "assistant",
                text: shape.text,
                bullets: shape.bullets,
                citations: shape.citations,
                createdAt: m.createdAt,
              };
            }
          }
          return { id: m.id, role: m.role, text: m.text, createdAt: m.createdAt };
        });
        setMessages(restored);
      } catch (err) {
        console.error("[copilot] history load failed", err);
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, historyLoaded]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages, pending]);

  async function submit(rawPrompt: string) {
    const finalPrompt = rawPrompt.trim();
    if (!finalPrompt || pending) return;
    setError(null);
    setPending(true);
    const userMsgId = `u-${Date.now()}`;
    const pendingAssistantId = `a-pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", text: finalPrompt },
      { id: pendingAssistantId, role: "assistant", text: "", pending: true },
    ]);
    setPrompt("");
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: finalPrompt,
          scenarioId,
          appliedEventIds,
          conversationId: conversationId ?? undefined,
          userId: USER_ID,
        }),
      });
      if (!res.ok) throw new Error(`Copilot failed: ${res.status}`);
      const json = (await res.json()) as CopilotResponse & {
        conversationId?: string;
        toolCalls?: Array<{ name: string; ok: boolean; elapsedMs: number }>;
        usage?: DisplayMessage["usage"];
      };
      if (json.conversationId) {
        setConversationId(json.conversationId);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(LS_CONVERSATION_KEY, json.conversationId);
        }
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingAssistantId
            ? {
                id: `a-${Date.now()}`,
                role: "assistant",
                text: json.text,
                bullets: json.bullets,
                citations: json.citations,
                source: json.source,
                toolCalls: json.toolCalls,
                usage: json.usage,
              }
            : m,
        ),
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      setError(detail);
      setMessages((prev) => prev.filter((m) => m.id !== pendingAssistantId));
    } finally {
      setPending(false);
    }
  }

  async function handleNewChat() {
    try {
      const url = new URL("/api/copilot", window.location.origin);
      url.searchParams.set("userId", USER_ID);
      url.searchParams.set("startNew", "1");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`new chat failed: ${res.status}`);
      const body = (await res.json()) as { conversationId: string };
      setConversationId(body.conversationId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LS_CONVERSATION_KEY, body.conversationId);
      }
      setMessages([]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "new chat failed");
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
            className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(460px,calc(100vw-2rem))] flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/95 p-5 shadow-2xl shadow-slate-950/60 backdrop-blur"
            data-testid="copilot-panel"
          >
            <header className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Copilot
                </h2>
                <p className="text-sm font-semibold text-slate-100">Ask about this scenario</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Grounded in baseline + {appliedEventIds.length} applied event
                  {appliedEventIds.length === 1 ? "" : "s"}.
                  {messages.length > 0 ? ` · ${messages.length} message${messages.length === 1 ? "" : "s"} in thread` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-300 transition hover:border-slate-600 hover:text-slate-100"
                  aria-label="Start new chat"
                  data-testid="copilot-new-chat"
                >
                  New chat
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-100"
                  aria-label="Close copilot"
                  data-testid="copilot-close"
                >
                  <CloseIcon />
                </button>
              </div>
            </header>

            {messages.length === 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void submit(s)}
                    disabled={pending || !historyLoaded}
                    className="rounded-full border border-slate-800 bg-slate-950/40 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-slate-600 hover:text-slate-100 disabled:opacity-40"
                    data-testid="copilot-suggestion"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}

            <div
              ref={scrollerRef}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/40 p-3"
            >
              {error ? (
                <div className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
                  {error}
                </div>
              ) : null}

              {!historyLoaded ? (
                <p className="m-auto text-center text-xs text-slate-500">
                  Loading prior conversation…
                </p>
              ) : messages.length === 0 ? (
                <p className="m-auto text-center text-xs text-slate-500">
                  Ask a question or pick a suggestion to get started.
                </p>
              ) : null}

              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} />
              ))}
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
                placeholder={
                  historyLoaded
                    ? "Ask about EBITDA, revenue, or specific events…"
                    : "Loading prior conversation…"
                }
                disabled={!historyLoaded}
                className="min-h-[72px] resize-none rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-ohfy-accent focus:outline-none disabled:opacity-60"
                data-testid="copilot-prompt"
              />
              <button
                type="submit"
                disabled={pending || !prompt.trim() || !historyLoaded}
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

function MessageBubble({ msg }: { msg: DisplayMessage }) {
  if (msg.role === "user") {
    return (
      <article
        className="ml-8 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100"
        data-testid="copilot-message-user"
      >
        {msg.text}
      </article>
    );
  }

  if (msg.pending) {
    return (
      <article
        className="mr-8 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-400 italic"
        data-testid="copilot-message-pending"
      >
        Thinking…
      </article>
    );
  }

  const bullets = msg.bullets ?? [];
  const citations = msg.citations ?? [];
  const tools = msg.toolCalls ?? [];

  return (
    <article
      className="mr-8 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
      data-testid="copilot-message-assistant"
    >
      {msg.source ? (
        <div className="mb-1.5">
          <span
            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
              msg.source === "live"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-slate-700 bg-slate-800 text-slate-300"
            }`}
          >
            {msg.source === "live" ? "Claude live" : "Demo response"}
          </span>
        </div>
      ) : null}
      <p className="leading-relaxed">{msg.text}</p>
      {bullets.length ? (
        <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-[5px] block h-1.5 w-1.5 shrink-0 rounded-full bg-ohfy-accent" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {citations.length ? (
        <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-500">
          Sources: {citations.join(" · ")}
        </p>
      ) : null}
      {tools.length ? (
        <details className="mt-2 text-[10px] text-slate-500">
          <summary className="cursor-pointer select-none">
            {tools.length} tool call{tools.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1 space-y-0.5">
            {tools.map((t, i) => (
              <li key={i}>
                · <span className="text-slate-300">{t.name}</span> · {t.elapsedMs}ms{" "}
                {t.ok ? "" : "· failed"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {msg.usage ? (
        <p className="mt-1 text-[10px] text-slate-600">
          in {msg.usage.inputTokens} · out {msg.usage.outputTokens}
          {msg.usage.cacheReadTokens
            ? ` · cache-read ${msg.usage.cacheReadTokens}`
            : ""}
          {msg.usage.cacheCreationTokens
            ? ` · cache-write ${msg.usage.cacheCreationTokens}`
            : ""}
        </p>
      ) : null}
    </article>
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
