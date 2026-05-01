@isTest
private class OhfyPlanMemoryStore_Test {

    private static final String CUSTOMER = 'cust-test';
    private static final String USER_A = '005000000000001';
    private static final String USER_B = '005000000000002';

    private static String invoke(Map<String, Object> body) {
        // In production, the bind check reads Customer_Id__c off custom
        // metadata — which is org-id in our sandbox, not the synthetic
        // 'cust-test' / 'cust-A' / 'cust-B' the rest of these tests use.
        // Without this default, every test that doesn't explicitly set
        // the override hits a 403 and the downstream assertions NPE on
        // the (intentionally) empty `data` envelope. Tests that DO test
        // bind enforcement set the override before calling invoke(), so
        // this only kicks in when the test isn't about bind at all.
        if (OhfyPlanMemoryStore.boundCustomerIdOverride == null) {
            OhfyPlanMemoryStore.boundCustomerIdOverride = '';
        }
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/plan/memory';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf(JSON.serialize(body));
        RestResponse res = new RestResponse();
        RestContext.request = req;
        RestContext.response = res;
        OhfyPlanMemoryStore.handle();
        return res.responseBody.toString();
    }

    private static Map<String, Object> invokeMap(Map<String, Object> body) {
        return (Map<String, Object>) JSON.deserializeUntyped(invoke(body));
    }

    private static Map<String, Object> dataOf(Map<String, Object> envelope) {
        Object d = envelope.get('data');
        return d instanceof Map<String, Object> ? (Map<String, Object>) d : null;
    }

    @isTest
    static void rejectsMissingAction() {
        String raw = invoke(new Map<String, Object>{ 'customerId' => CUSTOMER });
        Map<String, Object> env = (Map<String, Object>) JSON.deserializeUntyped(raw);
        Assert.areEqual(false, env.get('ok'));
        Assert.isTrue(((String) env.get('error')).contains('action'));
    }

    @isTest
    static void rejectsMissingCustomerId() {
        String raw = invoke(new Map<String, Object>{ 'action' => 'listThreads', 'userId' => USER_A });
        Map<String, Object> env = (Map<String, Object>) JSON.deserializeUntyped(raw);
        Assert.areEqual(false, env.get('ok'));
        Assert.isTrue(((String) env.get('error')).contains('customerId'));
    }

    @isTest
    static void getOrCreateActive_creates_when_none_exists() {
        Map<String, Object> env = invokeMap(new Map<String, Object>{
            'action' => 'getOrCreateActive', 'customerId' => CUSTOMER, 'userId' => USER_A
        });
        Assert.areEqual(true, env.get('ok'));
        Map<String, Object> data = dataOf(env);
        Assert.isNotNull(data.get('conversationId'));
    }

    @isTest
    static void appendTurn_persists_and_titles_first_user() {
        // Create
        Map<String, Object> created = invokeMap(new Map<String, Object>{
            'action' => 'startNewThread', 'customerId' => CUSTOMER, 'userId' => USER_A
        });
        String convId = (String) dataOf(created).get('conversationId');

        // Append a 4-message turn
        List<Map<String, Object>> entries = new List<Map<String, Object>>{
            new Map<String, Object>{
                'role' => 'user', 'contentFormat' => 'text',
                'content' => 'What if a hurricane hits?'
            },
            new Map<String, Object>{
                'role' => 'assistant', 'contentFormat' => 'blocks',
                'content' => '[{"type":"text","text":"calling apply_event"},{"type":"tool_use","id":"tu_1","name":"apply_event","input":{}}]'
            },
            new Map<String, Object>{
                'role' => 'user', 'contentFormat' => 'blocks',
                'content' => '[{"type":"tool_result","tool_use_id":"tu_1","content":"{\\"revenue\\":1234}"}]'
            },
            new Map<String, Object>{
                'role' => 'assistant', 'contentFormat' => 'blocks',
                'content' => '[{"type":"text","text":"final"}]'
            }
        };
        Test.startTest();
        Map<String, Object> appended = invokeMap(new Map<String, Object>{
            'action' => 'appendTurn',
            'customerId' => CUSTOMER,
            'conversationId' => convId,
            'entries' => entries
        });
        Test.stopTest();
        Assert.areEqual(true, appended.get('ok'));
        Assert.areEqual(4, ((Decimal) dataOf(appended).get('inserted')).intValue());

        // Title set from first user turn
        Plan_Conversation__c conv = [SELECT Title__c FROM Plan_Conversation__c WHERE Id = :convId];
        Assert.areEqual('What if a hurricane hits?', conv.Title__c);

        // History readback
        Map<String, Object> hist = invokeMap(new Map<String, Object>{
            'action' => 'loadHistory',
            'customerId' => CUSTOMER,
            'conversationId' => convId
        });
        List<Object> messages = (List<Object>) dataOf(hist).get('messages');
        Assert.areEqual(4, messages.size());
        Map<String, Object> firstMsg = (Map<String, Object>) messages[0];
        Assert.areEqual('text', firstMsg.get('contentFormat'));
        Map<String, Object> secondMsg = (Map<String, Object>) messages[1];
        Assert.areEqual('blocks', secondMsg.get('contentFormat'));
    }

    @isTest
    static void customer_isolation_one_customer_cant_see_anothers_threads() {
        Map<String, Object> envA = invokeMap(new Map<String, Object>{
            'action' => 'startNewThread', 'customerId' => 'cust-A', 'userId' => USER_A
        });
        String convA = (String) dataOf(envA).get('conversationId');
        invokeMap(new Map<String, Object>{
            'action' => 'appendTurn',
            'customerId' => 'cust-A',
            'conversationId' => convA,
            'entries' => new List<Map<String, Object>>{
                new Map<String, Object>{
                    'role' => 'user', 'contentFormat' => 'text', 'content' => 'private to A'
                }
            }
        });

        Map<String, Object> threadsB = invokeMap(new Map<String, Object>{
            'action' => 'listThreads', 'customerId' => 'cust-B', 'userId' => USER_A
        });
        Assert.areEqual(0, ((List<Object>) dataOf(threadsB).get('threads')).size());

        // Loading history with the wrong customer also returns empty.
        Map<String, Object> histB = invokeMap(new Map<String, Object>{
            'action' => 'loadHistory', 'customerId' => 'cust-B', 'conversationId' => convA
        });
        Assert.areEqual(0, ((List<Object>) dataOf(histB).get('messages')).size());
    }

    @isTest
    static void usage_increment_and_read_roundtrip() {
        invokeMap(new Map<String, Object>{
            'action' => 'incrementUsage',
            'customerId' => CUSTOMER, 'userId' => USER_A, 'costUsd' => 0.05
        });
        invokeMap(new Map<String, Object>{
            'action' => 'incrementUsage',
            'customerId' => CUSTOMER, 'userId' => USER_A, 'costUsd' => 0.03
        });
        Map<String, Object> usage = invokeMap(new Map<String, Object>{
            'action' => 'getDailyUsage', 'customerId' => CUSTOMER, 'userId' => USER_A
        });
        Map<String, Object> data = dataOf(usage);
        Assert.areEqual(2, ((Decimal) data.get('turnCount')).intValue());
        Assert.areEqual(0.08, ((Decimal) data.get('costUsd')).setScale(2));

        // Other user same customer — independent counter
        Map<String, Object> usageB = invokeMap(new Map<String, Object>{
            'action' => 'getDailyUsage', 'customerId' => CUSTOMER, 'userId' => USER_B
        });
        Assert.areEqual(0, ((Decimal) dataOf(usageB).get('turnCount')).intValue());
    }

    @isTest
    static void unknown_action_returns_400() {
        Map<String, Object> env = invokeMap(new Map<String, Object>{
            'action' => 'rmRfSlash', 'customerId' => CUSTOMER
        });
        Assert.areEqual(false, env.get('ok'));
        Assert.isTrue(((String) env.get('error')).contains('Unknown action'));
    }

    @isTest
    static void appendTurn_rejects_wrong_customer() {
        Map<String, Object> created = invokeMap(new Map<String, Object>{
            'action' => 'startNewThread', 'customerId' => 'cust-A', 'userId' => USER_A
        });
        String convId = (String) dataOf(created).get('conversationId');

        Map<String, Object> env = invokeMap(new Map<String, Object>{
            'action' => 'appendTurn',
            'customerId' => 'cust-B',
            'conversationId' => convId,
            'entries' => new List<Map<String, Object>>{
                new Map<String, Object>{
                    'role' => 'user', 'contentFormat' => 'text', 'content' => 'sneaky'
                }
            }
        });
        Assert.areEqual(false, env.get('ok'));
        Assert.isTrue(((String) env.get('error')).contains('not found'));
    }

    @isTest
    static void bind_rejects_when_request_customer_does_not_match_org() {
        OhfyPlanMemoryStore.boundCustomerIdOverride = 'cust-A';
        try {
            Map<String, Object> env = invokeMap(new Map<String, Object>{
                'action' => 'startNewThread',
                'customerId' => 'cust-B',
                'userId' => USER_A
            });
            Assert.areEqual(false, env.get('ok'));
            Assert.isTrue(((String) env.get('error')).contains('does not match'));
        } finally {
            OhfyPlanMemoryStore.boundCustomerIdOverride = null;
        }
    }

    @isTest
    static void bind_allows_when_request_customer_matches_org() {
        OhfyPlanMemoryStore.boundCustomerIdOverride = 'cust-A';
        try {
            Map<String, Object> env = invokeMap(new Map<String, Object>{
                'action' => 'startNewThread',
                'customerId' => 'cust-A',
                'userId' => USER_A
            });
            Assert.areEqual(true, env.get('ok'));
            Assert.isNotNull(dataOf(env).get('conversationId'));
        } finally {
            OhfyPlanMemoryStore.boundCustomerIdOverride = null;
        }
    }

    @isTest
    static void bind_skipped_when_no_customer_configured() {
        // boundCustomerIdOverride defaults to null and the deployed
        // Default record has Customer_Id__c blank, so the bind check is a
        // no-op. Existing tests verify this path; this just guards against
        // a regression that would silently turn the bind on for everyone.
        OhfyPlanMemoryStore.boundCustomerIdOverride = null;
        Map<String, Object> env = invokeMap(new Map<String, Object>{
            'action' => 'startNewThread',
            'customerId' => CUSTOMER,
            'userId' => USER_A
        });
        Assert.areEqual(true, env.get('ok'));
    }

    @isTest
    static void extractTextFromBlocksJson_pullsTextOnly() {
        String json = '[{"type":"text","text":"hello"},{"type":"tool_use","id":"x","name":"y","input":{}}]';
        Assert.areEqual('hello', OhfyPlanMemoryStore.extractTextFromBlocksJson(json));
    }
}
