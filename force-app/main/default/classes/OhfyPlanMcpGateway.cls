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
        // Tenancy header — the web-app requires this on every /api/tools/* call.
        // When we migrate to External Credentials, this can move to the NC config.
        req.setHeader('x-customer-id', UserInfo.getOrganizationId());
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

    /**
     * Call the copilot endpoint on the Ohanafy Plan gateway. Not an MCP
     * tool — routes to /api/copilot. Returns the raw JSON body the LWC
     * then parses locally (no JSON parsing in Apex to keep shape loose).
     * @param prompt             CFO question, ≤ 2000 chars.
     * @param scenarioId         Scenario id (e.g. yellowhammer-6mo).
     * @param appliedEventIds    CSV of applied event ids (may be empty).
     */
    @AuraEnabled(cacheable=false)
    public static String invokeCopilot(String prompt, String scenarioId, String appliedEventIds) {
        if (String.isBlank(prompt)) {
            throw new AuraHandledException('prompt is required');
        }
        if (String.isBlank(scenarioId)) {
            throw new AuraHandledException('scenarioId is required');
        }
        List<String> ids = new List<String>();
        if (String.isNotBlank(appliedEventIds)) {
            for (String id : appliedEventIds.split(',')) {
                String trimmed = id.trim();
                if (String.isNotBlank(trimmed)) ids.add(trimmed);
            }
        }
        Map<String, Object> body = new Map<String, Object>{
            'prompt' => prompt,
            'scenarioId' => scenarioId,
            'appliedEventIds' => ids
        };
        HttpRequest req = new HttpRequest();
        req.setEndpoint(NAMED_CREDENTIAL + '/api/copilot');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Accept', 'application/json');
        req.setHeader('x-customer-id', UserInfo.getOrganizationId());
        req.setTimeout(TIMEOUT_MS);
        req.setBody(JSON.serialize(body));
        try {
            HttpResponse res = new Http().send(req);
            if (res.getStatusCode() < 200 || res.getStatusCode() >= 300) {
                throw new AuraHandledException(
                    'Copilot returned ' + res.getStatusCode() + ': ' + res.getStatus()
                );
            }
            return res.getBody();
        } catch (CalloutException ce) {
            throw new AuraHandledException('Copilot callout failed: ' + ce.getMessage());
        }
    }
}
