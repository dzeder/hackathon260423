@IsTest
private class OhfyPlanAgentLogWriter_Test {

    private static RestRequest buildRequest(String body) {
        RestRequest req = new RestRequest();
        req.httpMethod = 'POST';
        req.requestURI = '/services/apexrest/plan-agent-log';
        req.addHeader('Content-Type', 'application/json');
        req.requestBody = Blob.valueOf(body);
        return req;
    }

    @IsTest
    static void happyPath_insertsRowAndReturnsIdAndName() {
        String body = '{' +
            '"prompt":"what happens if there is a hurricane?",' +
            '"responseText":"**Hurricane Impact: -$161.1K revenue**",' +
            '"scenarioType":"HURRICANE",' +
            '"toolsCalled":"queryBaseline(23ms,ok=true), applyScenario(71ms,ok=true)",' +
            '"latencyMs":332,' +
            '"inputTokens":6102,' +
            '"outputTokens":1738,' +
            '"costUsd":0.14,' +
            '"success":true,' +
            '"conversationId":"conv-abc-123",' +
            '"promptVersion":"prompt@1.0.0",' +
            '"toolSchemaVersion":"tools@1.0",' +
            '"customerIdHash":"sha256:abc123"' +
        '}';
        RestContext.request = buildRequest(body);
        RestContext.response = new RestResponse();

        Test.startTest();
        OhfyPlanAgentLogWriter.LogResponse resp = OhfyPlanAgentLogWriter.writeLog();
        Test.stopTest();

        System.assertNotEquals(null, resp.id, 'id returned');
        System.assert(resp.name.startsWith('PAL-'), 'auto-number prefix PAL-, got ' + resp.name);
        System.assertEquals(201, RestContext.response.statusCode, 'status 201 Created');

        Plan_Agent_Log__c row = [
            SELECT Scenario_Type__c, Success__c, Cost_USD__c, Customer_Id_Hash__c,
                   Latency_Ms__c, Input_Tokens__c, Output_Tokens__c,
                   Prompt_Version__c, Tool_Schema_Version__c, Conversation_Id__c
            FROM Plan_Agent_Log__c WHERE Id = :resp.id
        ];
        System.assertEquals('HURRICANE', row.Scenario_Type__c);
        System.assertEquals(true, row.Success__c);
        System.assertEquals(0.14, row.Cost_USD__c);
        System.assertEquals('sha256:abc123', row.Customer_Id_Hash__c);
        System.assertEquals(332, row.Latency_Ms__c);
        System.assertEquals(6102, row.Input_Tokens__c);
        System.assertEquals(1738, row.Output_Tokens__c);
        System.assertEquals('prompt@1.0.0', row.Prompt_Version__c);
        System.assertEquals('tools@1.0', row.Tool_Schema_Version__c);
        System.assertEquals('conv-abc-123', row.Conversation_Id__c);
    }

    @IsTest
    static void failure_storesErrorMessage() {
        String body = '{' +
            '"prompt":"bad prompt",' +
            '"success":false,' +
            '"errorMessage":"Upstream CFBD 429",' +
            '"customerIdHash":"sha256:xyz"' +
        '}';
        RestContext.request = buildRequest(body);
        RestContext.response = new RestResponse();

        Test.startTest();
        OhfyPlanAgentLogWriter.writeLog();
        Test.stopTest();

        Plan_Agent_Log__c row = [
            SELECT Success__c, Error_Message__c FROM Plan_Agent_Log__c LIMIT 1
        ];
        System.assertEquals(false, row.Success__c);
        System.assertEquals('Upstream CFBD 429', row.Error_Message__c);
    }

    @IsTest
    static void missingBody_throws400() {
        RestContext.request = buildRequest('');
        RestContext.response = new RestResponse();

        Boolean threw = false;
        try {
            OhfyPlanAgentLogWriter.writeLog();
        } catch (OhfyPlanAgentLogWriter.AgentLogException e) {
            threw = true;
            System.assert(e.getMessage().contains('body is required'), e.getMessage());
        }
        System.assert(threw, 'expected AgentLogException for empty body');
        System.assertEquals(400, RestContext.response.statusCode);
    }

    @IsTest
    static void missingCustomerIdHash_throws400() {
        String body = '{"prompt":"x","success":true}';
        RestContext.request = buildRequest(body);
        RestContext.response = new RestResponse();

        Boolean threw = false;
        try {
            OhfyPlanAgentLogWriter.writeLog();
        } catch (OhfyPlanAgentLogWriter.AgentLogException e) {
            threw = true;
            System.assert(e.getMessage().contains('customerIdHash'), e.getMessage());
        }
        System.assert(threw);
        System.assertEquals(400, RestContext.response.statusCode);
    }

    @IsTest
    static void invalidJson_throws400() {
        RestContext.request = buildRequest('not json');
        RestContext.response = new RestResponse();

        Boolean threw = false;
        try {
            OhfyPlanAgentLogWriter.writeLog();
        } catch (OhfyPlanAgentLogWriter.AgentLogException e) {
            threw = true;
            System.assert(e.getMessage().startsWith('Invalid JSON'), e.getMessage());
        }
        System.assert(threw);
        System.assertEquals(400, RestContext.response.statusCode);
    }

    @IsTest
    static void longPrompt_truncatesTo32768() {
        String longStr = 'a'.repeat(40000);
        String body = '{' +
            '"prompt":"' + longStr + '",' +
            '"customerIdHash":"h"' +
        '}';
        RestContext.request = buildRequest(body);
        RestContext.response = new RestResponse();

        Test.startTest();
        OhfyPlanAgentLogWriter.LogResponse resp = OhfyPlanAgentLogWriter.writeLog();
        Test.stopTest();

        Plan_Agent_Log__c row = [SELECT Prompt__c FROM Plan_Agent_Log__c WHERE Id = :resp.id];
        System.assertEquals(32768, row.Prompt__c.length(), 'truncated to max LongTextArea length');
    }
}
