/**
 * OhfyPlanAgentLogWriter — REST endpoint the Ohanafy Plan web-app calls
 * after every copilot invocation to record a Plan_Agent_Log__c row.
 *
 * URL: /services/apexrest/plan-agent-log
 * Method: POST
 * Body: JSON matching Plan_Agent_Log__c field API names.
 *
 * The web-app is responsible for PII scrubbing before the POST. This class
 * is append-only; Plan_Agent_Log__c has no edit/delete permissions in the
 * Ohanafy_Plan_User permission set.
 */
@RestResource(urlMapping='/plan-agent-log/*')
global with sharing class OhfyPlanAgentLogWriter {

    global class LogPayload {
        public String prompt;
        public String responseText;
        public String scenarioType;
        public String toolsCalled;
        public Integer latencyMs;
        public Integer inputTokens;
        public Integer outputTokens;
        public Decimal costUsd;
        public Boolean success;
        public String errorMessage;
        public String conversationId;
        public String promptVersion;
        public String toolSchemaVersion;
        public String customerIdHash;
    }

    global class LogResponse {
        public String id;
        public String name;
        public LogResponse(String id, String name) {
            this.id = id;
            this.name = name;
        }
    }

    @HttpPost
    global static LogResponse writeLog() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;
        String body = req.requestBody == null ? null : req.requestBody.toString();
        if (String.isBlank(body)) {
            res.statusCode = 400;
            throw new AgentLogException('Request body is required');
        }
        LogPayload p;
        try {
            p = (LogPayload) JSON.deserialize(body, LogPayload.class);
        } catch (Exception e) {
            res.statusCode = 400;
            throw new AgentLogException('Invalid JSON: ' + e.getMessage());
        }
        if (String.isBlank(p.customerIdHash)) {
            res.statusCode = 400;
            throw new AgentLogException('customerIdHash is required');
        }
        Plan_Agent_Log__c row = new Plan_Agent_Log__c(
            Prompt__c = truncate(p.prompt, 32768),
            Response_Text__c = truncate(p.responseText, 32768),
            Scenario_Type__c = truncate(p.scenarioType, 64),
            Tools_Called__c = truncate(p.toolsCalled, 8192),
            Latency_Ms__c = p.latencyMs,
            Input_Tokens__c = p.inputTokens,
            Output_Tokens__c = p.outputTokens,
            Cost_USD__c = p.costUsd,
            Success__c = p.success == null ? false : p.success,
            Error_Message__c = truncate(p.errorMessage, 8192),
            Conversation_Id__c = truncate(p.conversationId, 64),
            Prompt_Version__c = truncate(p.promptVersion, 32),
            Tool_Schema_Version__c = truncate(p.toolSchemaVersion, 32),
            Customer_Id_Hash__c = truncate(p.customerIdHash, 64)
        );
        insert row;
        Plan_Agent_Log__c reread = [
            SELECT Id, Name FROM Plan_Agent_Log__c WHERE Id = :row.Id LIMIT 1
        ];
        res.statusCode = 201;
        return new LogResponse(reread.Id, reread.Name);
    }

    private static String truncate(String v, Integer max) {
        if (v == null) return null;
        return v.length() <= max ? v : v.substring(0, max);
    }

    public class AgentLogException extends Exception {}
}
