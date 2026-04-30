/**
 * OhfyPlanAgentConfig — reads Plan_Agent_Config__mdt records once per
 * transaction and exposes isEnabled / getRateLimit lookups.
 *
 * Lookup rules:
 *   1. If a record exists for (Tool_API_Name__c = t, Customer_Id__c = c), use that.
 *   2. Otherwise if a record exists for (Tool_API_Name__c = t, Customer_Id__c = null), use that.
 *   3. Otherwise default-allow (isEnabled = true, rateLimit = null).
 *
 * Default-allow means: a tool without any config row is NOT blocked. Ops
 * control comes from seeding a disabled record when something needs
 * turning off. Keeps the deploy story simple — new tools don't need a
 * matching CMDT row to ship.
 */
global with sharing class OhfyPlanAgentConfig {

    @TestVisible
    private static Map<String, Plan_Agent_Config__mdt> cache;

    /** For Apex tests — seed a fake config map so we don't need SOQL against real metadata. */
    @TestVisible
    private static void setCacheForTest(Map<String, Plan_Agent_Config__mdt> fake) {
        cache = fake;
    }

    private static void loadIfNeeded() {
        if (cache != null) return;
        cache = new Map<String, Plan_Agent_Config__mdt>();
        for (Plan_Agent_Config__mdt c : [
            SELECT Tool_API_Name__c, Is_Enabled__c, Rate_Limit_Per_Hour__c, Customer_Id__c
            FROM Plan_Agent_Config__mdt
        ]) {
            cache.put(keyFor(c.Tool_API_Name__c, c.Customer_Id__c), c);
        }
    }

    private static String keyFor(String toolName, String customerId) {
        return (customerId == null ? '' : customerId) + '|' + toolName;
    }

    private static Plan_Agent_Config__mdt resolve(String toolName, String customerId) {
        loadIfNeeded();
        if (String.isNotBlank(customerId)) {
            Plan_Agent_Config__mdt customerOverride = cache.get(keyFor(toolName, customerId));
            if (customerOverride != null) return customerOverride;
        }
        return cache.get(keyFor(toolName, null));
    }

    public static Boolean isEnabled(String toolName, String customerId) {
        Plan_Agent_Config__mdt c = resolve(toolName, customerId);
        return c == null ? true : c.Is_Enabled__c;
    }

    public static Decimal getRateLimit(String toolName, String customerId) {
        Plan_Agent_Config__mdt c = resolve(toolName, customerId);
        return c == null ? null : c.Rate_Limit_Per_Hour__c;
    }

    /** Snapshot all effective defaults (Customer_Id__c = null rows) for the web-app to cache. */
    global static List<ConfigRow> listDefaults() {
        loadIfNeeded();
        List<ConfigRow> rows = new List<ConfigRow>();
        for (Plan_Agent_Config__mdt c : cache.values()) {
            if (c.Customer_Id__c == null) {
                rows.add(new ConfigRow(c));
            }
        }
        return rows;
    }

    global class ConfigRow {
        global String toolName;
        global Boolean enabled;
        global Decimal rateLimitPerHour;
        global ConfigRow(Plan_Agent_Config__mdt c) {
            this.toolName = c.Tool_API_Name__c;
            this.enabled = c.Is_Enabled__c;
            this.rateLimitPerHour = c.Rate_Limit_Per_Hour__c;
        }
    }
}
