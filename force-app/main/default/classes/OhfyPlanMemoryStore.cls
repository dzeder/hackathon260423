/**
 * OhfyPlanMemoryStore — REST endpoint for copilot conversation memory.
 *
 * Single POST endpoint with an `action` field that selects the operation.
 * RPC over HTTP rather than full REST so the Apex side stays one class and
 * the web client stays one fetch. Authenticated by the Connected App's
 * Client Credentials flow (same pattern as OhfyPlanSoqlReader).
 *
 * Endpoint:  POST /services/apexrest/plan/memory
 * Body:      { "action": "<op>", ...payload }
 * Response:  { "ok": true, "data": ... } | { "ok": false, "error": "..." }
 *
 * Operations:
 *   getOrCreateActive  { customerId, userId } -> { conversationId }
 *   startNewThread     { customerId, userId } -> { conversationId }
 *   listThreads        { customerId, userId, limit? } -> { threads: [...] }
 *   loadHistory        { customerId, conversationId, limit? } -> { messages: [...] }
 *   appendTurn         { customerId, conversationId, entries: [...] } -> { inserted: N }
 *   getDailyUsage      { customerId, userId } -> { turnCount, costUsd }
 *   incrementUsage     { customerId, userId, costUsd } -> { ok: true }
 *
 * Runs `with sharing` so the Connected App's run-as user must have
 * Read/Create/Edit on Plan_Conversation__c, Plan_Message__c, and
 * Plan_Usage_Daily__c. A permission set ships with the package.
 */
@RestResource(urlMapping='/plan/memory/*')
global with sharing class OhfyPlanMemoryStore {

    // Limits — kept conservative to stay well inside Apex governor caps.
    private static final Integer MAX_THREADS = 50;
    private static final Integer MAX_HISTORY = 200;
    private static final Integer MAX_TURN_ENTRIES = 60;

    // Tests inject a bound customerId without depending on deployed metadata.
    // Production reads Ohanafy_Copilot_Config__mdt.Default.Customer_Id__c.
    @TestVisible
    private static String boundCustomerIdOverride = null;

    global class TurnEntry {
        public String role;            // 'user' | 'assistant'
        public String contentFormat;   // 'text' | 'blocks'
        public String content;         // plain string OR JSON-serialized block array
    }

    global class Request {
        public String action;
        public String customerId;
        public String userId;
        public String conversationId;
        public Integer limitN;
        public List<TurnEntry> entries;
        public Decimal costUsd;
    }

    @HttpPost
    global static void handle() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;
        res.addHeader('Content-Type', 'application/json');

        Request body;
        try {
            body = (Request) JSON.deserialize(
                req.requestBody.toString(),
                Request.class
            );
        } catch (Exception parseErr) {
            respondError(res, 400, 'Malformed JSON: ' + parseErr.getMessage());
            return;
        }
        if (body == null || String.isBlank(body.action)) {
            respondError(res, 400, 'action is required');
            return;
        }
        if (String.isBlank(body.customerId)) {
            respondError(res, 400, 'customerId is required');
            return;
        }
        // Defense in depth: when the org is bound to a specific customerId
        // (production stance), reject requests that claim a different one.
        // A misconfigured Vercel deploy or compromised shared secret cannot
        // silently write to or read from the wrong tenant's bucket.
        String boundId = getBoundCustomerId();
        if (String.isNotBlank(boundId) && !boundId.equals(body.customerId)) {
            respondError(res, 403, 'customerId does not match this org\'s bound customer');
            return;
        }

        try {
            switch on body.action {
                when 'getOrCreateActive' { respondData(res, getOrCreateActive(body)); }
                when 'startNewThread'    { respondData(res, startNewThread(body)); }
                when 'listThreads'       { respondData(res, listThreads(body)); }
                when 'loadHistory'       { respondData(res, loadHistory(body)); }
                when 'appendTurn'        { respondData(res, appendTurn(body)); }
                when 'getDailyUsage'     { respondData(res, getDailyUsage(body)); }
                when 'incrementUsage'    { respondData(res, incrementUsage(body)); }
                when else { respondError(res, 400, 'Unknown action: ' + body.action); }
            }
        } catch (DmlException dml) {
            respondError(res, 500, 'DML: ' + dml.getMessage());
        } catch (QueryException qe) {
            respondError(res, 500, 'Query: ' + qe.getMessage());
        } catch (Exception e) {
            respondError(res, 500, 'Unhandled: ' + e.getMessage());
        }
    }

    // ---- operations ----

    private static Map<String, Object> getOrCreateActive(Request body) {
        if (String.isBlank(body.userId)) throw new IllegalArgumentException('userId is required');
        List<Plan_Conversation__c> rows = [
            SELECT Id
            FROM Plan_Conversation__c
            WHERE Customer_Id__c = :body.customerId
              AND User_Id__c = :body.userId
            ORDER BY Last_Activity_At__c DESC NULLS LAST
            LIMIT 1
        ];
        if (!rows.isEmpty()) {
            return new Map<String, Object>{ 'conversationId' => rows[0].Id };
        }
        return startNewThread(body);
    }

    private static Map<String, Object> startNewThread(Request body) {
        if (String.isBlank(body.userId)) throw new IllegalArgumentException('userId is required');
        Plan_Conversation__c c = new Plan_Conversation__c(
            Customer_Id__c = body.customerId,
            User_Id__c = body.userId,
            Last_Activity_At__c = Datetime.now()
        );
        insert c;
        return new Map<String, Object>{ 'conversationId' => c.Id };
    }

    private static Map<String, Object> listThreads(Request body) {
        if (String.isBlank(body.userId)) throw new IllegalArgumentException('userId is required');
        Integer cap = (body.limitN == null || body.limitN <= 0 || body.limitN > MAX_THREADS)
            ? 25 : body.limitN;

        // Single query for thread headers; one aggregate for counts.
        List<Plan_Conversation__c> threads = [
            SELECT Id, Title__c, Last_Activity_At__c
            FROM Plan_Conversation__c
            WHERE Customer_Id__c = :body.customerId
              AND User_Id__c = :body.userId
            ORDER BY Last_Activity_At__c DESC NULLS LAST
            LIMIT :cap
        ];
        Set<Id> ids = (new Map<Id, Plan_Conversation__c>(threads)).keySet();
        Map<Id, Integer> counts = new Map<Id, Integer>();
        for (AggregateResult ar : [
            SELECT Conversation__c convId, COUNT(Id) cnt
            FROM Plan_Message__c
            WHERE Conversation__c IN :ids
            GROUP BY Conversation__c
        ]) {
            counts.put((Id) ar.get('convId'), ((Decimal) ar.get('cnt')).intValue());
        }
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (Plan_Conversation__c t : threads) {
            out.add(new Map<String, Object>{
                'id' => t.Id,
                'title' => t.Title__c,
                'lastActivityAt' => t.Last_Activity_At__c == null
                    ? null : t.Last_Activity_At__c.getTime(),
                'messageCount' => counts.containsKey(t.Id) ? counts.get(t.Id) : 0
            });
        }
        return new Map<String, Object>{ 'threads' => out };
    }

    private static Map<String, Object> loadHistory(Request body) {
        if (String.isBlank(body.conversationId)) throw new IllegalArgumentException('conversationId is required');
        Integer cap = (body.limitN == null || body.limitN <= 0 || body.limitN > MAX_HISTORY)
            ? 100 : body.limitN;

        List<Plan_Message__c> rows = [
            SELECT Id, Conversation__c, Customer_Id__c, Sequence__c,
                   Role__c, Content_Format__c, Content__c, CreatedDate
            FROM Plan_Message__c
            WHERE Conversation__c = :body.conversationId
              AND Customer_Id__c = :body.customerId
            ORDER BY Sequence__c ASC
            LIMIT :cap
        ];
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (Plan_Message__c m : rows) {
            out.add(new Map<String, Object>{
                'id' => m.Id,
                'conversationId' => m.Conversation__c,
                'customerId' => m.Customer_Id__c,
                'seq' => m.Sequence__c == null ? 0 : m.Sequence__c.intValue(),
                'role' => m.Role__c,
                'contentFormat' => String.isBlank(m.Content_Format__c) ? 'text' : m.Content_Format__c,
                'content' => m.Content__c,
                'createdAt' => m.CreatedDate.getTime()
            });
        }
        return new Map<String, Object>{ 'messages' => out };
    }

    private static Map<String, Object> appendTurn(Request body) {
        if (String.isBlank(body.conversationId)) throw new IllegalArgumentException('conversationId is required');
        if (body.entries == null || body.entries.isEmpty()) {
            return new Map<String, Object>{ 'inserted' => 0 };
        }
        if (body.entries.size() > MAX_TURN_ENTRIES) {
            throw new IllegalArgumentException('Too many entries; max ' + MAX_TURN_ENTRIES);
        }

        // Verify conversation belongs to this customer (defense-in-depth on
        // top of `with sharing`).
        List<Plan_Conversation__c> conv = [
            SELECT Id, Title__c
            FROM Plan_Conversation__c
            WHERE Id = :body.conversationId
              AND Customer_Id__c = :body.customerId
            LIMIT 1
        ];
        if (conv.isEmpty()) {
            throw new IllegalArgumentException('Conversation not found for this customer');
        }

        AggregateResult[] seqAr = [
            SELECT MAX(Sequence__c) maxSeq
            FROM Plan_Message__c
            WHERE Conversation__c = :body.conversationId
        ];
        Decimal maxSeq = (Decimal) seqAr[0].get('maxSeq');
        Integer startingSeq = (maxSeq == null ? 0 : maxSeq.intValue());
        Integer nextSeq = startingSeq + 1;

        List<Plan_Message__c> rows = new List<Plan_Message__c>();
        String firstUserText = null;
        for (TurnEntry entry : body.entries) {
            if (entry == null || String.isBlank(entry.role) || entry.content == null) continue;
            String fmt = String.isBlank(entry.contentFormat) ? 'text' : entry.contentFormat;
            Plan_Message__c m = new Plan_Message__c();
            m.Conversation__c = body.conversationId;
            m.Customer_Id__c = body.customerId;
            m.Sequence__c = nextSeq;
            m.Role__c = entry.role;
            m.Content_Format__c = fmt;
            m.Content__c = trimTo(entry.content, 131000);
            rows.add(m);
            if (firstUserText == null && 'user'.equalsIgnoreCase(entry.role) && startingSeq == 0 && nextSeq == 1) {
                firstUserText = 'text'.equalsIgnoreCase(fmt)
                    ? entry.content
                    : extractTextFromBlocksJson(entry.content);
            }
            nextSeq += 1;
        }
        if (rows.isEmpty()) return new Map<String, Object>{ 'inserted' => 0 };
        insert rows;

        // Touch the conversation (Last_Activity_At + first-time title).
        Plan_Conversation__c convUpdate = new Plan_Conversation__c(Id = body.conversationId);
        convUpdate.Last_Activity_At__c = Datetime.now();
        if (String.isNotBlank(firstUserText) && String.isBlank(conv[0].Title__c)) {
            convUpdate.Title__c = trimTo(firstUserText, 80);
        }
        update convUpdate;

        return new Map<String, Object>{ 'inserted' => rows.size() };
    }

    private static Map<String, Object> getDailyUsage(Request body) {
        if (String.isBlank(body.userId)) throw new IllegalArgumentException('userId is required');
        String key = body.customerId + '|' + body.userId + '|' + todayUtc();
        List<Plan_Usage_Daily__c> rows = [
            SELECT Turn_Count__c, Cost_Usd_Micros__c
            FROM Plan_Usage_Daily__c
            WHERE Key__c = :key
            LIMIT 1
        ];
        if (rows.isEmpty()) {
            return new Map<String, Object>{ 'turnCount' => 0, 'costUsd' => 0 };
        }
        Decimal micros = rows[0].Cost_Usd_Micros__c == null ? 0 : rows[0].Cost_Usd_Micros__c;
        return new Map<String, Object>{
            'turnCount' => rows[0].Turn_Count__c == null ? 0 : rows[0].Turn_Count__c.intValue(),
            'costUsd' => (micros / 1000000).setScale(6)
        };
    }

    private static Map<String, Object> incrementUsage(Request body) {
        if (String.isBlank(body.userId)) throw new IllegalArgumentException('userId is required');
        String key = body.customerId + '|' + body.userId + '|' + todayUtc();
        Decimal incrementMicros = body.costUsd == null ? 0 : (body.costUsd * 1000000).setScale(0);

        List<Plan_Usage_Daily__c> rows = [
            SELECT Id, Turn_Count__c, Cost_Usd_Micros__c
            FROM Plan_Usage_Daily__c
            WHERE Key__c = :key
            LIMIT 1
        ];
        if (rows.isEmpty()) {
            insert new Plan_Usage_Daily__c(
                Key__c = key,
                Customer_Id__c = body.customerId,
                User_Id__c = body.userId,
                Day__c = Date.today(),
                Turn_Count__c = 1,
                Cost_Usd_Micros__c = incrementMicros
            );
        } else {
            Plan_Usage_Daily__c r = rows[0];
            r.Turn_Count__c = (r.Turn_Count__c == null ? 0 : r.Turn_Count__c) + 1;
            r.Cost_Usd_Micros__c = (r.Cost_Usd_Micros__c == null ? 0 : r.Cost_Usd_Micros__c)
                + incrementMicros;
            update r;
        }
        return new Map<String, Object>{ 'ok' => true };
    }

    // ---- helpers ----

    private static String getBoundCustomerId() {
        if (boundCustomerIdOverride != null) return boundCustomerIdOverride;
        Ohanafy_Copilot_Config__mdt cfg = Ohanafy_Copilot_Config__mdt.getInstance('Default');
        if (cfg == null) return null;
        String configured = cfg.Customer_Id__c;
        return String.isBlank(configured) ? null : configured;
    }

    private static void respondData(RestResponse res, Map<String, Object> data) {
        res.statusCode = 200;
        Map<String, Object> envelope = new Map<String, Object>{
            'ok' => true, 'data' => data
        };
        res.responseBody = Blob.valueOf(JSON.serialize(envelope));
    }

    private static void respondError(RestResponse res, Integer code, String message) {
        res.statusCode = code;
        Map<String, Object> envelope = new Map<String, Object>{
            'ok' => false, 'error' => message
        };
        res.responseBody = Blob.valueOf(JSON.serialize(envelope));
    }

    private static String trimTo(String v, Integer max) {
        if (v == null) return null;
        return v.length() > max ? v.substring(0, max) : v;
    }

    private static String todayUtc() {
        Datetime now = Datetime.now();
        return now.formatGmt('yyyy-MM-dd');
    }

    @TestVisible
    private static String extractTextFromBlocksJson(String serialized) {
        if (String.isBlank(serialized)) return '';
        try {
            Object parsed = JSON.deserializeUntyped(serialized);
            if (!(parsed instanceof List<Object>)) return '';
            List<String> parts = new List<String>();
            for (Object b : (List<Object>) parsed) {
                if (b instanceof Map<String, Object>) {
                    Map<String, Object> m = (Map<String, Object>) b;
                    if ('text'.equals(m.get('type'))) {
                        Object t = m.get('text');
                        if (t instanceof String) parts.add((String) t);
                    }
                }
            }
            return String.join(parts, '\n');
        } catch (Exception e) {
            return '';
        }
    }

    public class IllegalArgumentException extends Exception {}
}
