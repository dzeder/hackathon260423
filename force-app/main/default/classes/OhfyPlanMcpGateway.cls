/**
 * OhfyPlanMcpGateway — proxies scenario/event/forecast traffic from the
 * LWC surface to the Ohanafy Plan web-app MCP gateway. Signed by the
 * `Ohanafy_Plan_Gateway` Named Credential and restricted to an
 * allow-list of MCP tool names so the LWC cannot invoke arbitrary endpoints.
 */
public with sharing class OhfyPlanMcpGateway {

    public static final Set<String> ALLOWED_TOOLS = new Set<String>{
        'apply_event',
        'run_three_statement',
        'snapshot',
        'search_events',
        'get_event',
        'suggest_events',
        'query_peer_signals',
        'get_category_trend',
        'record_decision',
        'list_decisions',
        'compare_scenarios'
    };

    private static final String NAMED_CREDENTIAL = 'callout:Ohanafy_Plan_Gateway';
    private static final Integer TIMEOUT_MS = 20000;

    @TestVisible
    private static HttpRequest buildRequest(String toolName, String payload) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(NAMED_CREDENTIAL + '/api/tools/' + EncodingUtil.urlEncode(toolName, 'UTF-8'));
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Accept', 'application/json');
        req.setTimeout(TIMEOUT_MS);
        req.setBody(String.isBlank(payload) ? '{}' : payload);
        return req;
    }

    /**
     * Invoke an MCP tool via the Ohanafy Plan gateway. LWC calls this
     * with an @AuraEnabled binding.
     * @param toolName  Must be a member of ALLOWED_TOOLS.
     * @param payload   Raw JSON string (already validated by the caller / Zod).
     * @return          Raw JSON response body.
     */
    @AuraEnabled(cacheable=false)
    public static String invokeTool(String toolName, String payload) {
        if (String.isBlank(toolName)) {
            throw new AuraHandledException('toolName is required');
        }
        if (!ALLOWED_TOOLS.contains(toolName)) {
            throw new AuraHandledException('toolName not allow-listed: ' + toolName);
        }
        HttpRequest req = buildRequest(toolName, payload);
        try {
            HttpResponse res = new Http().send(req);
            if (res.getStatusCode() < 200 || res.getStatusCode() >= 300) {
                throw new AuraHandledException(
                    'Gateway returned ' + res.getStatusCode() + ': ' + res.getStatus()
                );
            }
            return res.getBody();
        } catch (CalloutException ce) {
            throw new AuraHandledException('Gateway callout failed: ' + ce.getMessage());
        }
    }

    /**
     * Returns the allow-list of tool names the LWC is permitted to call.
     * Makes the list discoverable without a callout.
     */
    @AuraEnabled(cacheable=true)
    public static List<String> listAllowedTools() {
        List<String> tools = new List<String>(ALLOWED_TOOLS);
        tools.sort();
        return tools;
    }
}
