import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface KnowledgeEntry {
  id: string;
  title: string;
  body: string;
  source: string;
  tags: string[];
}

interface SeedShape {
  tenant: string;
  entries: KnowledgeEntry[];
}

const here = dirname(fileURLToPath(import.meta.url));
const seedPath = resolve(here, "../../../../seed/knowledge.json");

export function loadKnowledge(): KnowledgeEntry[] {
  const seed = JSON.parse(readFileSync(seedPath, "utf-8")) as SeedShape;
  return seed.entries;
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
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
  "with",
  "from",
  "by",
  "as",
  "it",
  "its",
  "this",
  "that",
  "what",
  "when",
  "where",
  "how",
  "why",
  "if",
  "we",
  "our",
  "you",
  "your",
  "i",
  "me",
  "my",
  "there",
  "their",
  "they",
]);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export interface KnowledgeHit {
  entry: KnowledgeEntry;
  score: number;
  matchedTerms: string[];
}

/**
 * Simple BM25-lite scoring. Not a proper BM25 — we don't keep per-corpus
 * stats — but captures the spirit: term frequency in the doc rewarded,
 * document length penalised, stopwords dropped. Good enough for the
 * ~10-entry seed; swap for a real index when the corpus grows.
 */
export function searchKnowledge(
  entries: KnowledgeEntry[],
  query: string,
  limit = 3,
): KnowledgeHit[] {
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0) return [];

  const scored: KnowledgeHit[] = [];
  for (const entry of entries) {
    const haystack = `${entry.title} ${entry.body} ${entry.tags.join(" ")}`;
    const docTokens = tokenize(haystack);
    if (docTokens.length === 0) continue;

    const counts = new Map<string, number>();
    for (const t of docTokens) counts.set(t, (counts.get(t) ?? 0) + 1);

    let score = 0;
    const matchedTerms: string[] = [];
    for (const q of qTokens) {
      const tf = counts.get(q) ?? 0;
      if (tf === 0) continue;
      matchedTerms.push(q);
      // TF saturation + length normalization (k1=1.2, b=0.75 on a nominal doc length of 200).
      const normLen = docTokens.length / 200;
      const k1 = 1.2;
      const b = 0.75;
      score += (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * normLen));
    }
    if (score > 0) scored.push({ entry, score, matchedTerms });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
