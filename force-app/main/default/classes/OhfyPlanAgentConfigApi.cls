/**
 * OhfyPlanAgentConfigApi — GET /services/apexrest/plan-agent-config
 * Returns the default config rows for the web-app to cache. The web-app
 * re-reads every N minutes (see packages/web-app/src/lib/agentConfig.ts).
 *
 * Per-customer overrides are NOT returned here; Apex gateway enforces
 * those at call time via OhfyPlanAgentConfig.isEnabled(tool, customerId).
 */
@RestResource(urlMapping='/plan-agent-config/*')
global with sharing class OhfyPlanAgentConfigApi {

    @HttpGet
    global static List<OhfyPlanAgentConfig.ConfigRow> getDefaults() {
        return OhfyPlanAgentConfig.listDefaults();
    }
}
