/**
 * OhfyPlanRetentionJob — nightly cleanup of stale Plan_Conversation__c rows.
 *
 * Runs as a Database.Batchable<sObject> chained from a Schedulable. Default
 * cadence is nightly at 03:00 UTC, set up by the runbook (anonymous Apex
 * one-liner against System.schedule). Implements both interfaces so the same
 * class is the cron entry point AND the chunked DML executor — keeps the
 * package small (one class, one test) and avoids a one-shot wrapper.
 *
 * Filter: WHERE CreatedDate < cutoff AND Last_Activity_At__c < cutoff
 *   - CreatedDate uses Salesforce's standard auto-index for the prefilter.
 *   - Last_Activity_At__c is a DateTime field which we cannot index via
 *     metadata (Salesforce only allows externalId=true on Text/Number/Email/
 *     AutoNumber). Filtering on it second narrows the prefiltered set to
 *     rows that are old by BOTH measures, which matches user intent: a
 *     conversation created 100 days ago but reopened yesterday must NOT be
 *     deleted. CreatedDate <= Last_Activity_At__c always holds (memory
 *     store sets both at insert; only Last_Activity_At__c is bumped after).
 *
 * Cascade: Plan_Message__c.Conversation__c is master-detail with
 *   `<deleteConstraint>Cascade</deleteConstraint>`, so message rows go
 *   with their parent. No separate DML pass needed.
 *
 * Usage: Plan_Usage_Daily__c rows are NOT deleted by this job. They are
 *   tiny per-customer-per-user-per-day rollups; admins can DROP older days
 *   manually with a one-off SOQL DELETE if needed for compliance.
 *
 * Disable: set Plan_Retention_Config__mdt.Default.Enabled__c = false in
 *   Setup. The schedule still fires but the execute method exits early.
 */
global with sharing class OhfyPlanRetentionJob
    implements Database.Batchable<sObject>, Schedulable {

    private static final Integer DEFAULT_DAYS = 90;
    private static final Integer BATCH_SIZE = 200;

    // @TestVisible so the unit test can drive the cutoff without backdating
    // CreatedDate (which Salesforce makes painful in tests).
    @TestVisible
    private static Integer daysOverride = null;
    @TestVisible
    private static Boolean enabledOverride = null;

    global void execute(SchedulableContext sc) {
        if (!isEnabled()) return;
        Database.executeBatch(this, BATCH_SIZE);
    }

    global Database.QueryLocator start(Database.BatchableContext bc) {
        Datetime cutoff = Datetime.now().addDays(-getDaysToKeep());
        return Database.getQueryLocator([
            SELECT Id
            FROM Plan_Conversation__c
            WHERE CreatedDate < :cutoff
              AND Last_Activity_At__c != null
              AND Last_Activity_At__c < :cutoff
        ]);
    }

    global void execute(Database.BatchableContext bc, List<Plan_Conversation__c> scope) {
        if (scope == null || scope.isEmpty()) return;
        // Cascade-delete via the master-detail handles Plan_Message__c rows.
        delete scope;
    }

    global void finish(Database.BatchableContext bc) {
        // Intentional no-op. Job completion is visible in Setup -> Apex Jobs;
        // adding a Platform Event or email-on-failure is a P2 follow-up.
    }

    // ---- config helpers ----

    @TestVisible
    private static Integer getDaysToKeep() {
        // The < 1 guard applies to BOTH the test override and the
        // metadata-derived value — a 0 or negative passed via the
        // override must round up to the safe default just like a
        // misconfigured Custom Metadata record would.
        if (daysOverride != null) {
            return daysOverride < 1 ? DEFAULT_DAYS : daysOverride;
        }
        Plan_Retention_Config__mdt cfg = Plan_Retention_Config__mdt.getInstance('Default');
        if (cfg == null || cfg.Days_To_Keep__c == null) return DEFAULT_DAYS;
        Integer d = Integer.valueOf(cfg.Days_To_Keep__c);
        return d < 1 ? DEFAULT_DAYS : d;
    }

    @TestVisible
    private static Boolean isEnabled() {
        if (enabledOverride != null) return enabledOverride;
        Plan_Retention_Config__mdt cfg = Plan_Retention_Config__mdt.getInstance('Default');
        // Default to enabled if metadata is missing — opt-out, not opt-in.
        return cfg == null || cfg.Enabled__c == null ? true : cfg.Enabled__c;
    }
}
