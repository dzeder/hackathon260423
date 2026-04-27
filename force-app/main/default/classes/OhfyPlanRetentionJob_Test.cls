@isTest
private class OhfyPlanRetentionJob_Test {

    private static final String CUSTOMER = 'cust-retention-test';
    private static final String USER_A = '005000000000010';

    private static Plan_Conversation__c makeConversation(Datetime lastActivity) {
        Plan_Conversation__c c = new Plan_Conversation__c(
            Customer_Id__c = CUSTOMER,
            User_Id__c = USER_A,
            Last_Activity_At__c = lastActivity
        );
        insert c;
        return c;
    }

    @isTest
    static void deletes_rows_older_than_cutoff() {
        // 100 days ago: should be swept
        Plan_Conversation__c old1 = makeConversation(Datetime.now().addDays(-100));
        Plan_Conversation__c old2 = makeConversation(Datetime.now().addDays(-95));
        // 30 days ago: should survive
        Plan_Conversation__c fresh = makeConversation(Datetime.now().addDays(-30));

        // CreatedDate is the prefilter; Salesforce sets it to "now" on insert
        // so we backdate explicitly. Test.setCreatedDate is a test-only helper.
        Test.setCreatedDate(old1.Id, Datetime.now().addDays(-100));
        Test.setCreatedDate(old2.Id, Datetime.now().addDays(-95));
        Test.setCreatedDate(fresh.Id, Datetime.now().addDays(-30));

        OhfyPlanRetentionJob.daysOverride = 90;
        OhfyPlanRetentionJob.enabledOverride = true;

        Test.startTest();
        Database.executeBatch(new OhfyPlanRetentionJob(), 200);
        Test.stopTest();

        Set<Id> survivingIds = new Map<Id, Plan_Conversation__c>([
            SELECT Id FROM Plan_Conversation__c WHERE Customer_Id__c = :CUSTOMER
        ]).keySet();
        Assert.isFalse(survivingIds.contains(old1.Id), 'old1 should be deleted');
        Assert.isFalse(survivingIds.contains(old2.Id), 'old2 should be deleted');
        Assert.isTrue(survivingIds.contains(fresh.Id), 'fresh should survive');
    }

    @isTest
    static void keeps_old_created_but_recently_active_threads() {
        // Conversation created 200 days ago but reopened yesterday — must
        // not be deleted. This is the user-intent case the dual filter
        // (CreatedDate AND Last_Activity_At__c) is built for.
        Plan_Conversation__c reopened = makeConversation(Datetime.now().addDays(-1));
        Test.setCreatedDate(reopened.Id, Datetime.now().addDays(-200));

        OhfyPlanRetentionJob.daysOverride = 90;
        OhfyPlanRetentionJob.enabledOverride = true;

        Test.startTest();
        Database.executeBatch(new OhfyPlanRetentionJob(), 200);
        Test.stopTest();

        List<Plan_Conversation__c> remaining = [
            SELECT Id FROM Plan_Conversation__c WHERE Id = :reopened.Id
        ];
        Assert.areEqual(1, remaining.size(), 'recently-active thread must survive');
    }

    @isTest
    static void cascade_deletes_messages() {
        Plan_Conversation__c stale = makeConversation(Datetime.now().addDays(-120));
        Test.setCreatedDate(stale.Id, Datetime.now().addDays(-120));

        // One message on the soon-to-be-deleted conversation.
        insert new Plan_Message__c(
            Conversation__c = stale.Id,
            Customer_Id__c = CUSTOMER,
            Sequence__c = 1,
            Role__c = 'user',
            Content_Format__c = 'text',
            Content__c = 'about to be evicted'
        );

        OhfyPlanRetentionJob.daysOverride = 90;
        OhfyPlanRetentionJob.enabledOverride = true;

        Test.startTest();
        Database.executeBatch(new OhfyPlanRetentionJob(), 200);
        Test.stopTest();

        Assert.areEqual(0, [
            SELECT COUNT() FROM Plan_Conversation__c WHERE Id = :stale.Id
        ], 'parent conversation gone');
        Assert.areEqual(0, [
            SELECT COUNT() FROM Plan_Message__c WHERE Conversation__c = :stale.Id
        ], 'child messages cascaded');
    }

    @isTest
    static void disabled_flag_short_circuits() {
        Plan_Conversation__c old1 = makeConversation(Datetime.now().addDays(-200));
        Test.setCreatedDate(old1.Id, Datetime.now().addDays(-200));

        OhfyPlanRetentionJob.daysOverride = 90;
        OhfyPlanRetentionJob.enabledOverride = false;

        Test.startTest();
        new OhfyPlanRetentionJob().execute((SchedulableContext) null);
        Test.stopTest();

        Assert.areEqual(1, [
            SELECT COUNT() FROM Plan_Conversation__c WHERE Id = :old1.Id
        ], 'disabled flag must prevent deletion even on stale rows');
    }

    @isTest
    static void days_override_below_one_falls_back_to_default() {
        // A misconfigured Days_To_Keep__c (0, -1, etc.) must not be
        // interpreted as "delete everything older than today" — that would
        // wipe an entire customer's data on a config typo.
        OhfyPlanRetentionJob.daysOverride = 0;
        Assert.areEqual(90, OhfyPlanRetentionJob.getDaysToKeep(),
            'zero/negative days must round up to default 90');

        OhfyPlanRetentionJob.daysOverride = -5;
        Assert.areEqual(90, OhfyPlanRetentionJob.getDaysToKeep());
    }

    @isTest
    static void schedule_round_trip_via_System_schedule() {
        // Smoke test that the class is actually Schedulable — catches any
        // future signature change that would break the runbook one-liner.
        OhfyPlanRetentionJob.daysOverride = 90;
        OhfyPlanRetentionJob.enabledOverride = true;

        Test.startTest();
        String jobId = System.schedule(
            'OhfyPlanRetentionJob_Test schedule probe',
            '0 0 3 * * ?',
            new OhfyPlanRetentionJob()
        );
        Test.stopTest();

        CronTrigger ct = [SELECT Id, CronExpression FROM CronTrigger WHERE Id = :jobId];
        Assert.areEqual('0 0 3 * * ?', ct.CronExpression);
    }
}
