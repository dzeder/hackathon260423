import { z } from "zod";
import { loadCatalog } from "./catalog.js";
import { getEvent, searchEvents, suggestEvents } from "./logic.js";

const CategoryEnum = z.enum(["sports", "weather", "holiday", "macro", "supplier"]);
const SeasonEnum = z.enum(["spring", "summer", "fall", "winter", "any"]);

export const SearchEventsInput = z.object({
  query: z.string().optional(),
  region: z.string().optional(),
  season: SeasonEnum.optional(),
  category: CategoryEnum.optional(),
});

export const GetEventInput = z.object({
  id: z.string().min(1),
});

export const SuggestEventsInput = z.object({
  months: z.array(z.string().regex(/^\d{4}-\d{2}$/)).min(1),
  avgRevenue: z.number().nonnegative(),
  region: z.string().optional(),
  limit: z.number().int().positive().max(20).default(5),
});

export async function searchEventsTool(raw: unknown) {
  const input = SearchEventsInput.parse(raw);
  const events = searchEvents(loadCatalog(), input);
  return { events, count: events.length };
}

export async function getEventTool(raw: unknown) {
  const { id } = GetEventInput.parse(raw);
  const event = getEvent(loadCatalog(), id);
  if (!event) {
    throw new Error(`Event not found: ${id}`);
  }
  return { event };
}

export async function suggestEventsTool(raw: unknown) {
  const { months, avgRevenue, region, limit } = SuggestEventsInput.parse(raw);
  const suggestions = suggestEvents(loadCatalog(), { months, avgRevenue, region }, limit);
  return { suggestions, count: suggestions.length };
}

export const TOOL_REGISTRY = {
  search_events: {
    description: "Search the event-template catalog by free-text query, region, season, or category.",
    input: SearchEventsInput,
    handler: searchEventsTool,
  },
  get_event: {
    description: "Return a single event template by id.",
    input: GetEventInput,
    handler: getEventTool,
  },
  suggest_events: {
    description: "Suggest event templates most relevant to a baseline forecast summary (months + region).",
    input: SuggestEventsInput,
    handler: suggestEventsTool,
  },
} as const;

export type ToolName = keyof typeof TOOL_REGISTRY;
