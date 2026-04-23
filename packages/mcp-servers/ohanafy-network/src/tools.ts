import { z } from "zod";
import { loadPeerSignals } from "./fixtures.js";
import { getCategoryTrend, queryPeerSignals } from "./logic.js";

const WindowEnum = z.enum(["4w", "13w", "ytd"]);

export const QueryPeerSignalsInput = z.object({
  segmentId: z.string().optional(),
  window: WindowEnum.default("13w"),
});

export const GetCategoryTrendInput = z.object({
  skuFamily: z.string().min(1),
  window: WindowEnum.default("13w"),
});

export async function queryPeerSignalsTool(raw: unknown) {
  const input = QueryPeerSignalsInput.parse(raw);
  const signals = queryPeerSignals(loadPeerSignals(), input);
  return { signals, count: signals.length, anonymization: loadPeerSignals().anonymization };
}

export async function getCategoryTrendTool(raw: unknown) {
  const input = GetCategoryTrendInput.parse(raw);
  const signal = getCategoryTrend(loadPeerSignals(), input);
  return { signal, anonymization: loadPeerSignals().anonymization };
}

export const TOOL_REGISTRY = {
  query_peer_signals: {
    description: "Query anonymized peer-wholesaler segment trends by segment + window. Enforces min-peer k-anonymity.",
    input: QueryPeerSignalsInput,
    handler: queryPeerSignalsTool,
  },
  get_category_trend: {
    description: "Return anonymized volume trend for a SKU family across the peer network.",
    input: GetCategoryTrendInput,
    handler: getCategoryTrendTool,
  },
} as const;

export type ToolName = keyof typeof TOOL_REGISTRY;
