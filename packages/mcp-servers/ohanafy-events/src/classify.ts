import type { EventTemplate } from "./logic.js";

/**
 * Route a freeform prompt ("what happens if there is a hurricane?") to a
 * structured event template id from the catalog.
 *
 * v1: keyword-overlap scoring against a curated token bag per event.
 * Deterministic, fast, zero-cost. The math that follows (applyEvents,
 * runThreeStatement) stays fully deterministic — only the *routing* is
 * fuzzy. If and when we want higher recall, a Haiku second pass can
 * wrap this module; the contract stays the same.
 */

export interface ClassificationResult {
  templateId: string | null;
  confidence: number; // 0–1
  matched: EventTemplate | null;
  /** Candidate template ids by descending score (top 3). For debugging + demo. */
  candidates: Array<{ templateId: string; score: number }>;
  method: "keyword" | "fallback-none";
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "if",
  "what",
  "whats",
  "would",
  "happen",
  "happens",
  "about",
  "is",
  "are",
  "was",
  "were",
  "be",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "we",
  "our",
  "i",
  "me",
  "my",
  "you",
  "your",
  "this",
  "that",
  "there",
  "has",
  "have",
  "had",
  "do",
  "does",
  "did",
  "and",
  "or",
  "but",
  "with",
  "it",
  "its",
  "so",
  "just",
  "really",
  "much",
  "more",
  "less",
  "why",
  "how",
]);

export function tokenize(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function keywordsFor(event: EventTemplate): Set<string> {
  const combined = [event.id, event.label, event.category, event.notes ?? ""].join(" ");
  return new Set(tokenize(combined));
}

export function classifyScenario(
  catalog: EventTemplate[],
  prompt: string,
): ClassificationResult {
  const promptTokens = tokenize(prompt);
  if (promptTokens.length === 0 || catalog.length === 0) {
    return {
      templateId: null,
      confidence: 0,
      matched: null,
      candidates: [],
      method: "fallback-none",
    };
  }

  const promptSet = new Set(promptTokens);
  const scored = catalog
    .map((event) => {
      const keywords = keywordsFor(event);
      let overlap = 0;
      for (const t of promptSet) if (keywords.has(t)) overlap += 1;
      // Normalize by prompt token count so short-prompt matches aren't inflated.
      const score = overlap / Math.max(1, promptSet.size);
      return { event, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      templateId: null,
      confidence: 0,
      matched: null,
      candidates: [],
      method: "fallback-none",
    };
  }

  const top = scored[0];
  // Confidence heuristic: raw score, with a small boost when the top
  // candidate clearly beats the runner-up. Capped at 0.95 so callers
  // never treat keyword matching as certainty.
  const runnerUp = scored[1]?.score ?? 0;
  const margin = Math.min(0.15, top.score - runnerUp);
  const confidence = Math.min(0.95, top.score + margin);

  return {
    templateId: top.event.id,
    confidence,
    matched: top.event,
    candidates: scored.slice(0, 3).map((s) => ({ templateId: s.event.id, score: s.score })),
    method: "keyword",
  };
}
