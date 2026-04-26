import Anthropic from "@anthropic-ai/sdk";
import { CircuitBreaker, CircuitOpenError } from "@/lib/circuitBreaker";
import type { CopilotQuery, CopilotResponse } from "@/lib/copilot";
import { findEvent } from "@/lib/eventsCatalog";
import { METRICS, incrementCounter } from "@/lib/metrics";

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 700;
const TIMEOUT_MS = 15000;

/**
 * Fail fast with a generic message that never includes the key value.
 * Errors from this function are safe to log verbatim.
 */
function assertAnthropicKey(): void {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new AnthropicKeyMissingError(
      "ANTHROPIC_API_KEY is not set — route through canned fallback or configure the Vercel env var.",
    );
  }
}

export class AnthropicKeyMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnthropicKeyMissingError";
  }
}

/**
 * Trip after 5 failures in a 60s window, stay open for 30s. Anthropic
 * outages tend to be transient; these numbers avoid thrashing.
 */
export const anthropicBreaker = new CircuitBreaker({
  name: "anthropic",
  failureThreshold: 5,
  windowMs: 60_000,
  cooldownMs: 30_000,
});

function totals(months: CopilotQuery["baseline"]) {
    return months.reduce(
        (acc, m) => ({
            revenue: acc.revenue + m.revenue,
            cogs: acc.cogs + m.cogs,
            opex: acc.opex + m.opex,
            gm: acc.gm + m.gm,
            ebitda: acc.ebitda + m.ebitda,
        }),
        { revenue: 0, cogs: 0, opex: 0, gm: 0, ebitda: 0 },
    );
}

function buildContext(q: CopilotQuery): string {
    const b = totals(q.baseline);
    const s = totals(q.scenario);
    const dRev = b.revenue ? ((s.revenue - b.revenue) / b.revenue) * 100 : 0;
    const dEbitda = b.ebitda ? ((s.ebitda - b.ebitda) / b.ebitda) * 100 : 0;
    const events = q.appliedEventIds
        .map((id) => findEvent(id))
        .filter((e): e is NonNullable<ReturnType<typeof findEvent>> => Boolean(e))
        .map(
            (e) =>
                `  - ${e.id} (${e.month}, ${e.category}): Δrev ${e.revenueDeltaPct}%, ΔCOGS ${e.cogsDeltaPct}%, Δopex $${e.opexDeltaAbs}k. Source: ${e.source}`,
        )
        .join("\n");

    return [
        "SCENARIO CONTEXT",
        `Scenario id: ${q.scenarioId}`,
        `Horizon: 6 months (May–Oct 2026). Units: USD thousands, cases for volume.`,
        `Baseline 6-month totals: revenue $${Math.round(b.revenue)}k, COGS $${Math.round(b.cogs)}k, opex $${Math.round(b.opex)}k, EBITDA $${Math.round(b.ebitda)}k.`,
        `Scenario 6-month totals: revenue $${Math.round(s.revenue)}k, EBITDA $${Math.round(s.ebitda)}k (Δrev ${dRev.toFixed(1)}%, ΔEBITDA ${dEbitda.toFixed(1)}%).`,
        `Cash from operations (6mo): $${Math.round(q.threeStatement.cash.operating)}k.`,
        `Applied events (${q.appliedEventIds.length}):`,
        events || "  - (none)",
    ].join("\n");
}

const SYSTEM_PROMPT = [
    "You are the Ohanafy Plan copilot for Yellowhammer Beverage, a beer + Red Bull wholesaler in Birmingham, AL.",
    "The audience is a CFO. Be concise (≤3 sentences of prose + 3–5 bullets), numeric, and ground every claim in the scenario context below.",
    "Never invent numbers the context does not contain. Never use emojis.",
    "Cite sources when relevant using short labels (e.g., 'CFBD college football calendar', 'NOAA hurricane track', 'EIA diesel prices', '§11 Yellowhammer profile', 'three-statement model').",
    'Respond ONLY with a JSON object of shape: {"text": string, "bullets": string[], "citations": string[]}. No prose outside the JSON.',
].join(" ");

function extractJson(raw: string): unknown {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
        return JSON.parse(raw.slice(start, end + 1));
    } catch {
        return null;
    }
}

function isCopilotResponse(v: unknown): v is CopilotResponse {
    if (!v || typeof v !== "object") return false;
    const o = v as Record<string, unknown>;
    return (
        typeof o.text === "string" &&
        Array.isArray(o.bullets) &&
        o.bullets.every((b) => typeof b === "string") &&
        Array.isArray(o.citations) &&
        o.citations.every((c) => typeof c === "string")
    );
}

export async function respondLive(q: CopilotQuery): Promise<CopilotResponse> {
    assertAnthropicKey();
    const client = new Anthropic({ timeout: TIMEOUT_MS });
    const context = buildContext(q);
    let msg;
    try {
        msg = await anthropicBreaker.exec(() =>
            client.messages.create({
                model: MODEL,
                max_tokens: MAX_TOKENS,
                system: SYSTEM_PROMPT,
                messages: [
                    {
                        role: "user",
                        content: `${context}\n\nQUESTION: ${q.prompt}`,
                    },
                ],
            }),
        );
    } catch (err) {
        if (err instanceof CircuitOpenError) {
            incrementCounter(METRICS.TOOL_CIRCUIT_OPEN, ["tool:anthropic"]);
        }
        throw err;
    }
    const textBlock = msg.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
        throw new Error("live copilot returned no text block");
    }
    const parsed = extractJson(textBlock.text);
    if (!isCopilotResponse(parsed)) {
        throw new Error("live copilot returned malformed JSON");
    }
    return parsed;
}
