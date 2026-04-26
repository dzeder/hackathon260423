/**
 * OhfyPlanDataReader — in-org reads of Plan_Event_Template__c and
 * Plan_Knowledge_Article__c, plus the recordDecision write into
 * Plan_Scenario_Decision__c. LWC consumes via @wire (cacheable reads)
 * and imperative call (recordDecision).
 *
 * Why in-org: avoids LWC -> Vercel -> jsforce -> SF -> LWC round-trip
 * for data the org already holds. OhfyPlanMcpGateway keeps compute tools.
 */
public with sharing class OhfyPlanDataReader {

    private static final Set<String> VALID_DECISION_TYPES = new Set<String>{
        'accept', 'reject', 'pivot', 'scope-cut'
    };

    public class EventTemplate {
        @AuraEnabled public String eventId;
        @AuraEnabled public String label;
        @AuraEnabled public String category;
        @AuraEnabled public String region;
        @AuraEnabled public String season;
        @AuraEnabled public String month;
        @AuraEnabled public Decimal revenueDeltaPct;
        @AuraEnabled public Decimal cogsDeltaPct;
        @AuraEnabled public Decimal opExDeltaAbs;
        @AuraEnabled public String source;
        @AuraEnabled public String notes;
    }

    public class KnowledgeArticle {
        @AuraEnabled public String articleId;
        @AuraEnabled public String title;
        @AuraEnabled public String body;
        @AuraEnabled public String source;
        @AuraEnabled public String tags;
    }

    /** List event templates, optionally filtered by region and/or category. */
    @AuraEnabled(cacheable=true)
    public static List<EventTemplate> listEventTemplates(String region, String category) {
        String soql =
            'SELECT Event_Id__c, Label__c, Category__c, Region__c, Season__c, Month__c, ' +
            'Revenue_Delta_Pct__c, COGS_Delta_Pct__c, OpEx_Delta_Abs__c, Source__c, Notes__c ' +
            'FROM Plan_Event_Template__c ';
        List<String> wheres = new List<String>();
        if (String.isNotBlank(region)) wheres.add('Region__c = :region');
        if (String.isNotBlank(category)) wheres.add('Category__c = :category');
        if (!wheres.isEmpty()) {
            soql += 'WHERE ' + String.join(wheres, ' AND ') + ' ';
        }
        soql += 'WITH USER_MODE ORDER BY Month__c LIMIT 200';
        List<EventTemplate> out = new List<EventTemplate>();
        for (Plan_Event_Template__c row : (List<Plan_Event_Template__c>) Database.query(soql)) {
            out.add(toEventTemplate(row));
        }
        return out;
    }

    /** List knowledge articles, optionally filtered by a single tag (substring match on Tags__c). */
    @AuraEnabled(cacheable=true)
    public static List<KnowledgeArticle> listKnowledgeArticles(String tag) {
        List<KnowledgeArticle> out = new List<KnowledgeArticle>();
        List<Plan_Knowledge_Article__c> rows;
        if (String.isNotBlank(tag)) {
            String tagLike = '%' + String.escapeSingleQuotes(tag) + '%';
            rows = [
                SELECT Article_Id__c, Title__c, Body__c, Source__c, Tags__c
                FROM Plan_Knowledge_Article__c
                WHERE Tags__c LIKE :tagLike
                WITH USER_MODE
                ORDER BY Title__c
                LIMIT 200
            ];
        } else {
            rows = [
                SELECT Article_Id__c, Title__c, Body__c, Source__c, Tags__c
                FROM Plan_Knowledge_Article__c
                WITH USER_MODE
                ORDER BY Title__c
                LIMIT 200
            ];
        }
        for (Plan_Knowledge_Article__c row : rows) {
            out.add(toKnowledgeArticle(row));
        }
        return out;
    }

    /** Fetch a single event template by external id, or null if not found. */
    @AuraEnabled(cacheable=true)
    public static EventTemplate getEventTemplate(String eventId) {
        if (String.isBlank(eventId)) return null;
        List<Plan_Event_Template__c> rows = [
            SELECT Event_Id__c, Label__c, Category__c, Region__c, Season__c, Month__c,
                   Revenue_Delta_Pct__c, COGS_Delta_Pct__c, OpEx_Delta_Abs__c, Source__c, Notes__c
            FROM Plan_Event_Template__c
            WHERE Event_Id__c = :eventId
            WITH USER_MODE
            LIMIT 1
        ];
        return rows.isEmpty() ? null : toEventTemplate(rows[0]);
    }

    /**
     * Persist a scenario decision. Returns the new Decision_Id__c (UUID).
     * User_Id_Hash__c is SHA-256 of UserInfo.getUserId() — never the raw id.
     */
    @AuraEnabled
    public static String recordDecision(
        String scenarioId,
        String decisionType,
        String rationale,
        List<String> appliedEventIds
    ) {
        if (String.isBlank(scenarioId)) {
            throw new AuraHandledException('scenarioId is required');
        }
        if (!VALID_DECISION_TYPES.contains(decisionType)) {
            throw new AuraHandledException(
                'decisionType must be one of accept|reject|pivot|scope-cut, got: ' + decisionType
            );
        }
        Plan_Scenario_Decision__c row = new Plan_Scenario_Decision__c(
            Decision_Id__c = generateUuid(),
            Scenario_Id__c = scenarioId,
            Decision_Type__c = decisionType,
            Rationale__c = rationale,
            User_Id_Hash__c = sha256Hex(UserInfo.getUserId()),
            Recorded_At__c = Datetime.now(),
            Applied_Event_Ids__c = (appliedEventIds == null) ? '' : String.join(appliedEventIds, ',')
        );
        insert as user row;
        return row.Decision_Id__c;
    }

    private static EventTemplate toEventTemplate(Plan_Event_Template__c row) {
        EventTemplate e = new EventTemplate();
        e.eventId = row.Event_Id__c;
        e.label = row.Label__c;
        e.category = row.Category__c;
        e.region = row.Region__c;
        e.season = row.Season__c;
        e.month = row.Month__c;
        e.revenueDeltaPct = row.Revenue_Delta_Pct__c;
        e.cogsDeltaPct = row.COGS_Delta_Pct__c;
        e.opExDeltaAbs = row.OpEx_Delta_Abs__c;
        e.source = row.Source__c;
        e.notes = row.Notes__c;
        return e;
    }

    private static KnowledgeArticle toKnowledgeArticle(Plan_Knowledge_Article__c row) {
        KnowledgeArticle a = new KnowledgeArticle();
        a.articleId = row.Article_Id__c;
        a.title = row.Title__c;
        a.body = row.Body__c;
        a.source = row.Source__c;
        a.tags = row.Tags__c;
        return a;
    }

    private static String sha256Hex(String input) {
        Blob digest = Crypto.generateDigest('SHA-256', Blob.valueOf(input == null ? '' : input));
        return EncodingUtil.convertToHex(digest);
    }

    private static String generateUuid() {
        Blob b = Crypto.generateAesKey(128);
        String hex = EncodingUtil.convertToHex(b);
        return hex.substring(0, 8) + '-' + hex.substring(8, 12) + '-' + hex.substring(12, 16) +
               '-' + hex.substring(16, 20) + '-' + hex.substring(20, 32);
    }
}
