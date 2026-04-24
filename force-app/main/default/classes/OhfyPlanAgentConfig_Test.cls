@IsTest
private class OhfyPlanAgentConfig_Test {

    private static Plan_Agent_Config__mdt cfg(String tool, String customer, Boolean enabled, Decimal rate) {
        Plan_Agent_Config__mdt c = new Plan_Agent_Config__mdt();
        c.Tool_API_Name__c = tool;
        c.Customer_Id__c = customer;
        c.Is_Enabled__c = enabled;
        c.Rate_Limit_Per_Hour__c = rate;
        return c;
    }

    private static Map<String, Plan_Agent_Config__mdt> seedCache(List<Plan_Agent_Config__mdt> rows) {
        Map<String, Plan_Agent_Config__mdt> m = new Map<String, Plan_Agent_Config__mdt>();
        for (Plan_Agent_Config__mdt r : rows) {
            String key = (r.Customer_Id__c == null ? '' : r.Customer_Id__c) + '|' + r.Tool_API_Name__c;
            m.put(key, r);
        }
        return m;
    }

    @IsTest
    static void defaultAllow_whenNoConfig() {
        OhfyPlanAgentConfig.setCacheForTest(new Map<String, Plan_Agent_Config__mdt>());
        System.assertEquals(true, OhfyPlanAgentConfig.isEnabled('apply_event', null));
        System.assertEquals(null, OhfyPlanAgentConfig.getRateLimit('apply_event', null));
    }

    @IsTest
    static void honorsDefaultRecord() {
        OhfyPlanAgentConfig.setCacheForTest(
            seedCache(new List<Plan_Agent_Config__mdt>{
                cfg('apply_event', null, false, 100)
            })
        );
        System.assertEquals(false, OhfyPlanAgentConfig.isEnabled('apply_event', null));
        System.assertEquals(100, OhfyPlanAgentConfig.getRateLimit('apply_event', null));
    }

    @IsTest
    static void customerOverrideBeatsDefault() {
        OhfyPlanAgentConfig.setCacheForTest(
            seedCache(new List<Plan_Agent_Config__mdt>{
                cfg('apply_event', null, true, 100),
                cfg('apply_event', '00DXYZ', false, 10)
            })
        );
        System.assertEquals(false, OhfyPlanAgentConfig.isEnabled('apply_event', '00DXYZ'));
        System.assertEquals(10, OhfyPlanAgentConfig.getRateLimit('apply_event', '00DXYZ'));
        // Other customer falls through to default.
        System.assertEquals(true, OhfyPlanAgentConfig.isEnabled('apply_event', '00DABC'));
        System.assertEquals(100, OhfyPlanAgentConfig.getRateLimit('apply_event', '00DABC'));
    }

    @IsTest
    static void listDefaults_returnsOnlyDefaultRows() {
        OhfyPlanAgentConfig.setCacheForTest(
            seedCache(new List<Plan_Agent_Config__mdt>{
                cfg('apply_event', null, true, null),
                cfg('snapshot', null, true, 500),
                cfg('apply_event', '00DXYZ', false, 10)
            })
        );
        List<OhfyPlanAgentConfig.ConfigRow> rows = OhfyPlanAgentConfig.listDefaults();
        System.assertEquals(2, rows.size(), 'only default rows, no overrides');
        Set<String> toolNames = new Set<String>();
        for (OhfyPlanAgentConfig.ConfigRow r : rows) toolNames.add(r.toolName);
        System.assert(toolNames.contains('apply_event'));
        System.assert(toolNames.contains('snapshot'));
    }

    @IsTest
    static void loadsFromSoqlWhenCacheUnset() {
        // Real CMDT records are deployed with the package; this test proves
        // the SOQL path works, irrespective of how many rows are present.
        OhfyPlanAgentConfig.cache = null;
        Test.startTest();
        Boolean result = OhfyPlanAgentConfig.isEnabled('apply_event', null);
        Test.stopTest();
        // Seeded records default to enabled; absence of a row also yields enabled.
        System.assertEquals(true, result);
    }
}
