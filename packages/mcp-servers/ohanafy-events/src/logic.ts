export type EventCategory = "sports" | "weather" | "holiday" | "macro" | "supplier";
export type EventSeason = "spring" | "summer" | "fall" | "winter" | "any";

export type EventTemplate = {
  id: string;
  label: string;
  category: EventCategory;
  region: string;
  season: EventSeason;
  month: string;
  revenueDeltaPct: number;
  cogsDeltaPct: number;
  opexDeltaAbs: number;
  source: string;
  notes?: string;
};

export type BaselineSummary = {
  months: string[];
  avgRevenue: number;
  region?: string;
};

export type SuggestionScore = {
  event: EventTemplate;
  score: number;
  reasons: string[];
};

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

export function searchEvents(
  catalog: EventTemplate[],
  filter: { query?: string; region?: string; season?: EventSeason; category?: EventCategory },
): EventTemplate[] {
  const q = filter.query ? normalize(filter.query) : undefined;
  return catalog.filter((e) => {
    if (q) {
      const haystack = `${e.label} ${e.id} ${e.notes ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filter.region && e.region !== filter.region && e.region !== "US") return false;
    if (filter.season && filter.season !== "any" && e.season !== filter.season && e.season !== "any") {
      return false;
    }
    if (filter.category && e.category !== filter.category) return false;
    return true;
  });
}

export function getEvent(catalog: EventTemplate[], id: string): EventTemplate | null {
  return catalog.find((e) => e.id === id) ?? null;
}

export function suggestEvents(
  catalog: EventTemplate[],
  summary: BaselineSummary,
  limit = 5,
): SuggestionScore[] {
  const monthSet = new Set(summary.months);
  const region = summary.region;

  const scored = catalog.map<SuggestionScore>((event) => {
    const reasons: string[] = [];
    let score = 0;

    if (monthSet.has(event.month)) {
      score += 3;
      reasons.push(`month ${event.month} is in the forecast horizon`);
    }
    if (region && (event.region === region || event.region === "US")) {
      score += 1;
      reasons.push(`region match (${event.region})`);
    }

    const magnitude = Math.abs(event.revenueDeltaPct) + Math.abs(event.cogsDeltaPct);
    if (magnitude >= 5) {
      score += 1;
      reasons.push(`material magnitude (${magnitude.toFixed(1)}% combined)`);
    }

    if (event.category === "sports" && monthSet.has(event.month)) {
      score += 0.5;
      reasons.push("sports events are highest-confidence drivers in AL");
    }

    return { event, score, reasons };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
