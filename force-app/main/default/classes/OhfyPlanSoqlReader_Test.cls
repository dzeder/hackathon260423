@isTest
private class OhfyPlanSoqlReader_Test {

    @isTest
    static void validate_rejectsNonSelect() {
        Assert.isNull(OhfyPlanSoqlReader.validateOrNull('DELETE FROM Account'));
        Assert.isNull(OhfyPlanSoqlReader.validateOrNull('UPDATE Account SET Name = \'x\''));
        Assert.isNull(OhfyPlanSoqlReader.validateOrNull(''));
        Assert.isNull(OhfyPlanSoqlReader.validateOrNull(null));
    }

    @isTest
    static void validate_rejectsDmlWordsEvenInSelect() {
        Assert.isNull(OhfyPlanSoqlReader.validateOrNull('SELECT Id FROM Account WHERE Name = \'delete me\''));
    }

    @isTest
    static void validate_rejectsBannedObjects() {
        Assert.isNull(OhfyPlanSoqlReader.validateOrNull('SELECT Id FROM PermissionSet'));
        Assert.isNull(OhfyPlanSoqlReader.validateOrNull('SELECT Id FROM LoginHistory'));
    }

    @isTest
    static void validate_allowsListedObjects() {
        Assert.isNotNull(OhfyPlanSoqlReader.validateOrNull('SELECT Id, Name FROM Account LIMIT 5'));
        Assert.isNotNull(OhfyPlanSoqlReader.validateOrNull('SELECT Id FROM Opportunity'));
    }

    @isTest
    static void validate_allowsOhfyPrefix() {
        Assert.isNotNull(OhfyPlanSoqlReader.validateOrNull('SELECT Id FROM ohfy__Plan__c'));
    }

    @isTest
    static void validate_rejectsUnlistedObjects() {
        Assert.isNull(OhfyPlanSoqlReader.validateOrNull('SELECT Id FROM Lead'));
    }

    @isTest
    static void ensureLimit_addsLimitWhenMissing() {
        String out = OhfyPlanSoqlReader.ensureLimit('SELECT Id FROM Account', 50);
        Assert.isTrue(out.toLowerCase().contains('limit 50'));
    }

    @isTest
    static void ensureLimit_preservesExistingLimit() {
        String input = 'SELECT Id FROM Account LIMIT 5';
        Assert.areEqual(input, OhfyPlanSoqlReader.ensureLimit(input, 50));
    }

    @isTest
    static void runQuery_e2e_happyPath() {
        // Insert a test Account so the live SOQL has rows.
        insert new Account(Name = 'Copilot Test Account');

        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/plan/soql';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf(JSON.serialize(
            new Map<String, Object>{ 'soql' => 'SELECT Id, Name FROM Account LIMIT 5' }
        ));
        RestResponse res = new RestResponse();
        RestContext.request = req;
        RestContext.response = res;

        Test.startTest();
        OhfyPlanSoqlReader.runQuery();
        Test.stopTest();

        Assert.areEqual(200, res.statusCode);
        String body = res.responseBody.toString();
        Assert.isTrue(body.contains('"records"'));
        Assert.isTrue(body.contains('"done":true'));
    }

    @isTest
    static void runQuery_e2e_rejectsBadQuery() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/plan/soql';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf(JSON.serialize(
            new Map<String, Object>{ 'soql' => 'DELETE FROM Account' }
        ));
        RestResponse res = new RestResponse();
        RestContext.request = req;
        RestContext.response = res;

        OhfyPlanSoqlReader.runQuery();

        Assert.areEqual(400, res.statusCode);
        Assert.isTrue(res.responseBody.toString().contains('allowlist'));
    }
}
