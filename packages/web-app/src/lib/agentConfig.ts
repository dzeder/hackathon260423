/**
 * Web-app mirror of Plan_Agent_Config__mdt default rows.
 *
 * Canonical source: the Custom Metadata Type records under
 * force-app/main/default/customMetadata/Plan_Agent_Config.*.md-meta.xml.
 * The web-app reads these at startup via /services/apexrest/plan-agent-config
 * (OhfyPlanAgentConfigApi.cls). Until the Salesforce-auth sub-task lands,
 * we serve from this mirror so tool-level kill switches work in prod
 * without a redeploy of the web-app.
 *
 * Update path: edit this file AND the matching .md-meta.xml in the same PR.
 * Once the auth wire-up lands, this mirror becomes a seed-only fallback.
 */

export interface AgentToolConfig {
  toolName: string;
  enabled: boolean;
  rateLimitPerHour: number | null;
}

const DEFAULTS: readonly AgentToolConfig[] = Object.freeze([
  { toolName: "apply_event", enabled: true, rateLimitPerHour: null },
  { toolName: "run_three_statement", enabled: true, rateLimitPerHour: null },
  { toolName: "snapshot", enabled: true, rateLimitPerHour: null },
  { toolName: "search_events", enabled: true, rateLimitPerHour: null },
  { toolName: "get_event", enabled: true, rateLimitPerHour: null },
  { toolName: "suggest_events", enabled: true, rateLimitPerHour: null },
  { toolName: "query_peer_signals", enabled: true, rateLimitPerHour: null },
  { toolName: "get_category_trend", enabled: true, rateLimitPerHour: null },
  { toolName: "record_decision", enabled: true, rateLimitPerHour: null },
  { toolName: "list_decisions", enabled: true, rateLimitPerHour: null },
  { toolName: "compare_scenarios", enabled: true, rateLimitPerHour: null },
]);

const TTL_MS = 5 * 60 * 1000;
interface CacheState {
  loadedAt: number;
  byTool: Map<string, AgentToolConfig>;
}
let cache: CacheState | null = null;

/** Exposed for tests. Call before an assertion that depends on a freshly-loaded cache. */
export function __resetAgentConfigCacheForTest(): void {
  cache = null;
}

function load(): CacheState {
  const byTool = new Map<string, AgentToolConfig>();
  for (const row of DEFAULTS) byTool.set(row.toolName, row);
  return { loadedAt: Date.now(), byTool };
}

function current(): CacheState {
  if (!cache || Date.now() - cache.loadedAt > TTL_MS) {
    cache = load();
  }
  return cache;
}

/**
 * Default-allow: a tool without a matching config row is NOT blocked.
 * This matches OhfyPlanAgentConfig.isEnabled on the Apex side.
 */
export function isToolEnabled(toolName: string): boolean {
  const row = current().byTool.get(toolName);
  return row ? row.enabled : true;
}

export function getRateLimit(toolName: string): number | null {
  const row = current().byTool.get(toolName);
  return row ? row.rateLimitPerHour : null;
}

export function listToolConfigs(): AgentToolConfig[] {
  return [...current().byTool.values()];
}
