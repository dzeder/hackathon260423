/**
 * ohanafy-plan-mcp-forecast
 * Track B skeleton — implements the forecast mutation tools:
 *   - apply_event(scenario_id, event)
 *   - run_three_statement(scenario_id)
 *   - snapshot(scenario_id)
 *
 * The real server wires stdio transport + Zod-validated tool schemas.
 * This file exists so CI + import graph stay green on day one.
 */

export const server = {
  name: "ohanafy-plan-mcp-forecast",
  version: "0.0.0",
  tools: ["apply_event", "run_three_statement", "snapshot"] as const,
};

export function describeServer() {
  return {
    name: server.name,
    version: server.version,
    tools: server.tools,
  };
}
