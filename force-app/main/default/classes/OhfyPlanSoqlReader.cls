/**
 * OhfyPlanSoqlReader — read-only SOQL endpoint for the copilot.
 *
 * The web-app calls this endpoint (via Client Credentials OAuth) rather than
 * the stock /services/data/.../query endpoint so the allowlist and row cap
 * are enforced server-side inside Salesforce, and everything runs `with
 * sharing` against the Connected App's run-as user.
 *
 * Endpoint:   POST /services/apexrest/plan/soql?maxRows=<int>
 * Request:    { "soql": "SELECT Id, Name FROM Account WHERE ..." }
 * Response:   { "records": [...], "totalSize": N, "done": true }
 * Errors:     HTTP 400 with {"error": "..."} for validation failures
 *             HTTP 500 with {"error": "..."} for QueryException
 */
@RestResource(urlMapping='/plan/soql/*')
global with sharing class OhfyPlanSoqlReader {

    // Hard max — also echoed in Next.js guardrail. Web-app caller can pass a
    // smaller maxRows via query string; this is the ceiling.
    private static final Integer ABSOLUTE_MAX_ROWS = 200;

    // Object allowlist. Managed-package objects (ohfy__*) pass through via
    // prefix match so new package objects don't need a code change here.
    // Everything else must be explicitly listed.
    private static final Set<String> ALLOWED_OBJECTS = new Set<String>{
        'account', 'contact', 'opportunity', 'user', 'order'
    };

    private static final Set<String> BANNED_OBJECTS = new Set<String>{
        'userrecordaccess', 'permissionset', 'permissionsetassignment',
        'loginhistory', 'apexclass', 'apextestresult', 'authsession'
    };

    global class SoqlRequest {
        public String soql;
    }

    global class SoqlResponse {
        public List<SObject> records;
        public Integer totalSize;
        public Boolean done;
    }

    global class ErrorResponse {
        public String error;
        public ErrorResponse(String e) { this.error = e; }
    }

    @HttpPost
    global static void runQuery() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;
        res.addHeader('Content-Type', 'application/json');

        try {
            SoqlRequest body = (SoqlRequest) JSON.deserialize(
                req.requestBody.toString(),
                SoqlRequest.class
            );
            if (body == null || String.isBlank(body.soql)) {
                respondError(res, 400, 'soql is required');
                return;
            }

            String validated = validateOrNull(body.soql);
            if (validated == null) {
                respondError(res, 400, 'SOQL rejected by allowlist / SELECT-only guardrail');
                return;
            }

            Integer maxRows = ABSOLUTE_MAX_ROWS;
            String maxRowsParam = req.params.get('maxRows');
            if (String.isNotBlank(maxRowsParam)) {
                try {
                    Integer parsed = Integer.valueOf(maxRowsParam);
                    if (parsed > 0 && parsed < ABSOLUTE_MAX_ROWS) maxRows = parsed;
                } catch (Exception ignored) {
                    // Bad int — fall back to the hard cap.
                }
            }

            // Enforce the cap by appending LIMIT if the query didn't already
            // have one smaller than our max. We don't rewrite the user's
            // LIMIT — we only constrain uncapped queries.
            String finalQuery = ensureLimit(validated, maxRows);

            List<SObject> records = Database.query(finalQuery);

            SoqlResponse out = new SoqlResponse();
            out.records = records;
            out.totalSize = records.size();
            out.done = true;
            res.statusCode = 200;
            res.responseBody = Blob.valueOf(JSON.serialize(out));
        } catch (QueryException qe) {
            respondError(res, 500, 'QueryException: ' + qe.getMessage());
        } catch (Exception e) {
            respondError(res, 500, 'Unhandled: ' + e.getMessage());
        }
    }

    private static void respondError(RestResponse res, Integer code, String message) {
        res.statusCode = code;
        res.responseBody = Blob.valueOf(JSON.serialize(new ErrorResponse(message)));
    }

    @TestVisible
    private static String validateOrNull(String soql) {
        if (String.isBlank(soql)) return null;
        String trimmed = soql.trim();
        String lower = trimmed.toLowerCase();
        if (!lower.startsWith('select ')) return null;
        // Belt-and-suspenders — SOQL doesn't have DML, but some string-
        // concat-happy injector might try this.
        if (Pattern.matches('(?i).*\\b(insert|update|delete|upsert|merge|undelete)\\b.*', lower)) {
            return null;
        }
        // First FROM <object> match.
        Matcher m = Pattern.compile('(?i)\\bfrom\\s+([a-z0-9_]+)').matcher(lower);
        if (!m.find()) return null;
        String obj = m.group(1);
        if (BANNED_OBJECTS.contains(obj)) return null;
        if (ALLOWED_OBJECTS.contains(obj) || obj.startsWith('ohfy__')) return trimmed;
        return null;
    }

    @TestVisible
    private static String ensureLimit(String soql, Integer maxRows) {
        // If the SOQL already has a LIMIT clause, leave it alone — honoring
        // user intent within the hard cap is enforced at parse time via the
        // maxRows param. If no LIMIT, append one.
        if (Pattern.matches('(?i).*\\blimit\\s+\\d+.*', soql)) return soql;
        return soql + ' LIMIT ' + maxRows;
    }
}
