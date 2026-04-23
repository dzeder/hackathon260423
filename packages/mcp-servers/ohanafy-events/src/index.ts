/**
 * ohanafy-plan-mcp-events
 * Track B skeleton — event template library:
 *   - search_events(query, region, season)
 *   - get_event(id)
 *   - suggest_events(baseline_summary)
 *
 * Real server reads from seed + external sources (CFBD, NOAA).
 */

export const server = {
  name: "ohanafy-plan-mcp-events",
  version: "0.0.0",
  tools: ["search_events", "get_event", "suggest_events"] as const,
};

export function describeServer() {
  return {
    name: server.name,
    version: server.version,
    tools: server.tools,
  };
}
