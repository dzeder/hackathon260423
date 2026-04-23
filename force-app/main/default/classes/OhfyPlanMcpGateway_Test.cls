/**
 * Smoke coverage for OhfyPlanMcpGateway.
 * Required to clear the 75% Apex coverage bar mandated by §5.4.
 */
@IsTest
private class OhfyPlanMcpGateway_Test {

    @IsTest
    static void invokeTool_returnsStubPayload() {
        Test.startTest();
        String result = OhfyPlanMcpGateway.invokeTool('apply_event', '{}');
        Test.stopTest();

        System.assertNotEquals(null, result, 'gateway must return a response');
        System.assert(result.contains('apply_event'), 'response includes tool name');
        System.assert(result.contains('"ok":true'), 'response is a success stub');
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
}
