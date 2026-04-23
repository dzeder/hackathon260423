/**
 * Coverage for OhfyPlanMcpGateway. Uses HttpCalloutMock to simulate the
 * Ohanafy Plan gateway without a live Named Credential. Required to clear
 * the 75% Apex coverage bar mandated by §5.4.
 */
@IsTest
private class OhfyPlanMcpGateway_Test {

    private class SuccessMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            System.assert(req.getEndpoint().contains('/api/tools/'), 'routes through tools path');
            System.assertEquals('POST', req.getMethod(), 'uses POST');
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setStatus('OK');
            res.setBody('{"forecast":[{"month":"2026-10","revenue":5234}],"eventCount":1}');
            return res;
        }
    }

    private class ServerErrorMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(500);
            res.setStatus('Internal Server Error');
            res.setBody('{"error":"upstream blew up"}');
            return res;
        }
    }

    @IsTest
    static void invokeTool_success_returnsBody() {
        Test.setMock(HttpCalloutMock.class, new SuccessMock());

        Test.startTest();
        String body = OhfyPlanMcpGateway.invokeTool('apply_event', '{"scenarioId":"demo","events":[]}');
        Test.stopTest();

        System.assert(body.contains('eventCount'), 'response body passed through');
    }

    @IsTest
    static void invokeTool_blankToolName_throws() {
        Boolean threw = false;
        try {
            OhfyPlanMcpGateway.invokeTool('', '{}');
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assertEquals(true, threw, 'blank toolName must raise AuraHandledException');
    }

    @IsTest
    static void invokeTool_unknownTool_throws() {
        Boolean threw = false;
        try {
            OhfyPlanMcpGateway.invokeTool('rm_rf_slash', '{}');
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assertEquals(true, threw, 'allow-list rejects unknown tool names');
    }

    @IsTest
    static void invokeTool_serverError_throws() {
        Test.setMock(HttpCalloutMock.class, new ServerErrorMock());

        Boolean threw = false;
        Test.startTest();
        try {
            OhfyPlanMcpGateway.invokeTool('apply_event', '{}');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assertEquals(true, threw, 'non-2xx responses raise AuraHandledException');
    }

    @IsTest
    static void listAllowedTools_containsKnownTools() {
        List<String> tools = OhfyPlanMcpGateway.listAllowedTools();
        System.assert(tools.size() >= 5, 'returns at least five tools');
        System.assert(new Set<String>(tools).contains('apply_event'), 'includes apply_event');
        System.assert(new Set<String>(tools).contains('snapshot'), 'includes snapshot');
    }

    @IsTest
    static void buildRequest_nullPayload_defaultsToEmptyJson() {
        HttpRequest req = OhfyPlanMcpGateway.buildRequest('apply_event', null);
        System.assertEquals('{}', req.getBody(), 'null payload defaults to {}');
        System.assertEquals('application/json', req.getHeader('Content-Type'));
    }
}
