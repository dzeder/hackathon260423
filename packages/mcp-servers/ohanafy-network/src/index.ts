/**
 * ohanafy-plan-mcp-network
 * Track B skeleton — cross-wholesaler anonymized signals (DynamoDB-backed).
 *   - query_peer_signals(segment, window)
 *   - get_category_trend(sku_family, window)
 *
 * Anonymization + minimum-bucket-size guardrails live here (not in the caller).
 */

export const server = {
  name: "ohanafy-plan-mcp-network",
  version: "0.0.0",
  tools: ["query_peer_signals", "get_category_trend"] as const,
};

export function describeServer() {
  return {
    name: server.name,
    version: server.version,
    tools: server.tools,
  };
}
