/**
 * ohanafy-plan-apex-gateway
 * Track C skeleton — Apex gateway that the LWC calls to reach the MCP servers.
 * The real implementation proxies to the Next.js copilot route (§15),
 * signs the request with a Named Credential, and strips PII before forwarding.
 */
public with sharing class OhfyPlanMcpGateway {

    /**
     * Invokes an MCP tool via the Ohanafy Plan web-app proxy.
     * @param toolName  Name of the MCP tool (e.g. 'apply_event').
     * @param payload   JSON payload passed through to the tool.
     * @return          Raw JSON response as a String.
     */
    @AuraEnabled(cacheable=false)
    public static String invokeTool(String toolName, String payload) {
        if (String.isBlank(toolName)) {
            throw new AuraHandledException('toolName is required');
        }
        // Stub response until the Named Credential + HTTP callout is wired (Track C).
        return '{"ok":true,"tool":"' + toolName + '","stub":true}';
    }
}
