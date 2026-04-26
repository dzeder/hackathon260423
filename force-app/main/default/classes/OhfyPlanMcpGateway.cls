/**
 * OhfyPlanMcpGateway — proxies scenario/event/forecast traffic from the
 * LWC surface to the Ohanafy Plan web-app MCP gateway. Signed by the
 * `Ohanafy_Plan_Gateway` Named Credential and restricted to an
 * allow-list of MCP tool names so the LWC cannot invoke arbitrary endpoints.
 *
 * Authentication: every callout to the web app carries an
 * `X-Ohanafy-Client-Secret` header read from
 * `Ohanafy_Copilot_Config__mdt.Default.Client_Secret__c`. The same value
 * lives in the Vercel `COPILOT_CLIENT_SECRET` env var. Rotate by updating
 * both sides; the web app accepts a comma-separated list during overlap.
 *
 * User + customer scoping: the copilot routes all memory reads/writes by
 * (customer_id, user_id). The gateway automatically passes
 * `UserInfo.getUserId()` through so each SF user has their own copilot
 * history. `customer_id` is determined server-side on Vercel via
 * `SF_CUSTOMER_ID`, so the LWC surface never sees the tenant id.
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
    private static final String SECRET_HEADER = 'X-Ohanafy-Client-Secret';
    private static final Integer TIMEOUT_MS = 20000;

    @TestVisible
    private static String resolveClientSecret() {
        try {
            List<Ohanafy_Copilot_Config__mdt> rows = [
                SELECT Client_Secret__c
                FROM Ohanafy_Copilot_Config__mdt
                WHERE DeveloperName = 'Default'
                LIMIT 1
            ];
            if (!rows.isEmpty() && String.isNotBlank(rows[0].Client_Secret__c)) {
                return rows[0].Client_Secret__c;
            }
        } catch (Exception e) {
            // MDT may not be deployed yet — fall through to no header. The
            // web app will 503 `not_configured` unless it's running on
            // localhost with no secret configured (dev mode).
        }
        return null;
    }

    private static void addAuthHeader(HttpRequest req) {
        String secret = resolveClientSecret();
        if (String.isNotBlank(secret)) req.setHeader(SECRET_HEADER, secret);
    }

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
        addAuthHeader(req);
        return req;
    }

    @AuraEnabled(cacheable=false)
    public static String invokeTool(String toolName, String payload) {
        if (String.isBlank(toolName)) {
            throw new AuraHandledException('toolName is required');
        }
        if (!ALLOWED_TOOLS.contains(toolName)) {
            throw new AuraHandledException('toolName not allow-listed: ' + toolName);
        }
        if (!OhfyPlanAgentConfig.isEnabled(toolName, UserInfo.getOrganizationId())) {
            throw new AuraHandledException('tool is disabled by Plan_Agent_Config__mdt: ' + toolName);
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

    @AuraEnabled(cacheable=true)
    public static List<String> listAllowedTools() {
        List<String> tools = new List<String>(ALLOWED_TOOLS);
        tools.sort();
        return tools;
    }

    /**
     * Send a copilot turn. Returns the raw JSON body from the web app
     * (includes {text, bullets, citations, conversationId, usage, toolCalls, …}).
     *
     * `conversationId` is optional. When blank, the web app picks up the
     * user's most recent thread (soft rollover) or creates a fresh one.
     * Pass a specific id to continue a known thread.
     */
    @AuraEnabled(cacheable=false)
    public static String invokeCopilot(
        String prompt,
        String scenarioId,
        String appliedEventIds,
        String conversationId
    ) {
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
            'appliedEventIds' => ids,
            'userId' => UserInfo.getUserId()
        };
        if (String.isNotBlank(conversationId)) {
            body.put('conversationId', conversationId);
        }
        HttpRequest req = new HttpRequest();
        req.setEndpoint(NAMED_CREDENTIAL + '/api/copilot');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Accept', 'application/json');
        req.setHeader('x-customer-id', UserInfo.getOrganizationId());
        req.setTimeout(TIMEOUT_MS);
        req.setBody(JSON.serialize(body));
        addAuthHeader(req);
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

    /**
     * Load the LWC user's active conversation + message history on first
     * open so the thread UI rehydrates. Mirrors GET /api/copilot.
     */
    @AuraEnabled(cacheable=false)
    public static String loadActiveThread() {
        return doGet('/api/copilot?userId=' + EncodingUtil.urlEncode(UserInfo.getUserId(), 'UTF-8'));
    }

    /**
     * Start a fresh conversation thread for the LWC user. Mirrors
     * GET /api/copilot?startNew=1.
     */
    @AuraEnabled(cacheable=false)
    public static String startNewThread() {
        return doGet('/api/copilot?startNew=1&userId=' + EncodingUtil.urlEncode(UserInfo.getUserId(), 'UTF-8'));
    }

    @AuraEnabled(cacheable=false)
    public static String listThreads() {
        return doGet('/api/copilot?userId=' + EncodingUtil.urlEncode(UserInfo.getUserId(), 'UTF-8'));
    }

    private static String doGet(String relativePath) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(NAMED_CREDENTIAL + relativePath);
        req.setMethod('GET');
        req.setHeader('Accept', 'application/json');
        req.setTimeout(TIMEOUT_MS);
        addAuthHeader(req);
        try {
            HttpResponse res = new Http().send(req);
            if (res.getStatusCode() < 200 || res.getStatusCode() >= 300) {
                throw new AuraHandledException(
                    'Copilot GET returned ' + res.getStatusCode() + ': ' + res.getStatus()
                );
            }
            return res.getBody();
        } catch (CalloutException ce) {
            throw new AuraHandledException('Copilot GET callout failed: ' + ce.getMessage());
        }
    }
}
