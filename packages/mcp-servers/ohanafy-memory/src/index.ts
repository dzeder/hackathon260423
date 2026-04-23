/**
 * ohanafy-plan-mcp-memory
 * Track B skeleton — scenario memory:
 *   - record_decision(scenario_id, note)
 *   - list_decisions(scenario_id)
 *   - compare_scenarios(a, b)
 */

export const server = {
  name: "ohanafy-plan-mcp-memory",
  version: "0.0.0",
  tools: ["record_decision", "list_decisions", "compare_scenarios"] as const,
};

export function describeServer() {
  return {
    name: server.name,
    version: server.version,
    tools: server.tools,
  };
}
