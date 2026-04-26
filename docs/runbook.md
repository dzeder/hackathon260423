# Copilot Production Runbook

Operational guide for the Ohanafy Plan copilot stack on Vercel + Salesforce.

## Architecture at a glance

```
┌──────────────┐   POST /api/copilot      ┌──────────────┐
│ Web Copilot  │─────────────────────────▶│              │
│  (Next.js)   │                          │   Vercel     │
└──────────────┘                          │   web-app    │
                                          │              │
┌──────────────┐   Apex → Named Cred →    │  /api/*      │
│ LWC Copilot  │──────────────────────────▶│              │
│ (Salesforce) │                          └──────┬───────┘
└──────────────┘                                 │
                                                 │  ┌────────────┐
                                                 ├─▶│  Anthropic │  Sonnet 4.6 main
                                                 │  │  Messages  │  Haiku 4.5 retriever
                                                 │  └────────────┘
                                                 │
                                                 │  OAuth client_credentials  ┌───────────────┐
                                                 ├─/services/apexrest/plan/───▶│ Salesforce    │
                                                 │   memory  (CRUD)            │ • Plan_Conv__c│
                                                 │   soql    (read-only)       │ • Plan_Msg__c │
                                                 │                             │ • Plan_Usage__c│
                                                 │                             │ • SOQL targets│
                                                 │                             └───────────────┘
                                                 │
                                                 ▼
                                          ┌────────────────────┐
                                          │ pino → Datadog     │
                                          │ (PII redacted)     │
                                          └────────────────────┘
```

**Memory lives inside the customer's Salesforce org.** The web app is a pure
compute layer — no separate database, no separate vendor for conversation
data. The customer's existing audit, retention, GDPR, and backup tools work
on copilot data because it's just custom-object rows.

## One-time setup

### 1. Salesforce Connected App

Setup → App Manager → New Connected App:

- **Name**: `Ohanafy Plan Copilot`
- **Contact Email**: your ops email
- **Enable OAuth Settings**: yes
- **Callback URL**: `https://login.salesforce.com/services/oauth2/callback` (unused for client_credentials but required)
- **Selected OAuth Scopes**:
  - `Manage user data via APIs (api)`
  - `Perform requests at any time (refresh_token, offline_access)`
- **Enable Client Credentials Flow**: yes
- **Run As**: a dedicated **integration user** with the permission set described in step 2

After save, wait ~5 min for OAuth to propagate, then grab **Consumer Key** and **Consumer Secret**. These go into Vercel as `SF_CONSUMER_KEY` and `SF_CONSUMER_SECRET`.

### 2. Permission set for the integration user

The Run-As user must have:

| Object | Read | Create | Edit |
|---|---|---|---|
| `Plan_Conversation__c` | ✓ | ✓ | ✓ |
| `Plan_Message__c` | ✓ | ✓ | ✓ |
| `Plan_Usage_Daily__c` | ✓ | ✓ | ✓ |
| `Account`, `Contact`, `Opportunity`, `Order`, `User` | ✓ | — | — |
| `ohfy__*` (managed package) | ✓ | — | — |

Apex class access:
- `OhfyPlanMemoryStore`
- `OhfyPlanSoqlReader`

### 3. Shared secret between Salesforce and Vercel

```bash
openssl rand -hex 32
```

Paste the output in BOTH places:

- **Vercel** → Project → Settings → Environment Variables → add `COPILOT_CLIENT_SECRET` for Production and Preview scopes.
- **Salesforce** → Setup → Custom Metadata Types → Ohanafy Copilot Config → Default record → Client Secret field. Deploy.

### 4. Vercel environment variables (full list)

| Variable | Required? | Scope | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Prod + Preview | Live Claude responses |
| `COPILOT_CLIENT_SECRET` | yes | Prod + Preview | Auth between SF gateway and `/api/copilot` |
| `SF_LOGIN_URL` | yes | Prod + Preview | `https://<my-domain>.my.salesforce.com` |
| `SF_CONSUMER_KEY` | yes | Prod + Preview | Connected App consumer key |
| `SF_CONSUMER_SECRET` | yes | Prod + Preview | Connected App consumer secret |
| `SF_CUSTOMER_ID` | yes | Prod + Preview | Tenant label on every memory row |
| `DD_API_KEY` | optional | Prod | Datadog APM tracing |
| `DD_ENV` | optional | Prod | `production`, `staging`, etc. |
| `COPILOT_MAX_TURNS_PER_DAY` | optional | Prod | Daily turn cap (default 200) |
| `COPILOT_MAX_COST_USD_PER_DAY` | optional | Prod | Daily $ cap (default 25) |
| `COPILOT_MAX_COST_USD_PER_TURN` | optional | Prod | Per-turn $ cap (default 0.30) |

**Without the SF vars**: copilot serves stateless live Claude responses. No memory, no rate-limit, no usage counter, `query_salesforce` returns canned. Health check reports `salesforce: ok=false`.

### 5. Deploy

```bash
# Web app
cd packages/web-app
vercel deploy --prod --yes

# Salesforce — one push installs everything: 3 memory objects + 2 Apex REST
# endpoints + Custom Metadata + LWC + permission sets.
cd ../..
sf project deploy start --source-dir force-app -o <org-alias>
sf apex run test --test-level RunLocalTests -o <org-alias>
```

## Health check

`GET /api/health` returns:

```json
{
  "status": "ok",
  "checks": {
    "anthropic":   { "ok": true },
    "gatewayAuth": { "ok": true },
    "salesforce":  { "ok": true }
  },
  "version": "<git-sha>",
  "timestamp": "..."
}
```

Status 200 = all critical checks pass. Status 503 = any of the three is missing. Wire a Datadog synthetic: GET `/api/health` every 5 min, alert on 503 or no response.

## Operations

### Rotating the shared secret (zero-downtime)

1. Generate new secret: `openssl rand -hex 32`.
2. **Vercel**: add new value to `COPILOT_CLIENT_SECRETS` (plural, comma-separated: `<new>,<old>`). Redeploy.
3. **Salesforce**: update `Ohanafy_Copilot_Config__mdt.Default.Client_Secret__c` to the new value. Deploy.
4. Wait 10 min for SF callouts to settle.
5. **Vercel**: set `COPILOT_CLIENT_SECRET` to the new value alone. Remove `COPILOT_CLIENT_SECRETS`. Redeploy.

### Rotating the Anthropic API key

1. Generate a new key in console.anthropic.com.
2. Update Vercel `ANTHROPIC_API_KEY`. Redeploy.
3. Revoke the old key.

### Rotating the Salesforce Consumer Secret

1. Salesforce → App Manager → Ohanafy Plan Copilot → Manage → Edit → New Consumer Secret.
2. Update Vercel `SF_CONSUMER_SECRET`. Redeploy.

In-process token cache refreshes on next cold start. Force a refresh by re-deploying or calling `vercel redeploy`.

### Rolling back

- **Vercel**: Settings → Deployments → find the last good deploy → "Promote to Production".
- **Salesforce**: revert commit, redeploy. For destructive changes (object deletions) restore from a sandbox or backup.
- **Conversation data**: lives in `Plan_Conversation__c` / `Plan_Message__c`. Customer admins can use Salesforce data export, recycle bin, or weekly export for recovery.

### Triage — copilot returning errors

1. Check `/api/health` first.
2. Vercel function logs — every turn emits a `copilot_event: turn_complete` JSON line. Errors emit `copilot_live_turn_failed`.
3. SF callout failures show as `Apex REST /plan/memory` or `/plan/soql` errors with the upstream HTTP status. 401 = token; 400 = bad request shape (look at the `error` field); 500 = SF DML/Query exception (check Salesforce debug logs).
4. Most likely culprits, in order: shared-secret mismatch, expired Connected App token, integration user missing object permissions.

### Triage — copilot slow or expensive

- **Slow**: each memory operation is a Vercel→SF round-trip (~200-400ms). A turn does 3-5 of these — 1-2s of memory overhead is normal. The Anthropic call is usually the dominant cost (4-8s).
- **Expensive**: `cost_cap_hit: true` in logs means a single turn exceeded `COPILOT_MAX_COST_USD_PER_TURN`. Check `tool_names` for runaway tool loops. `cache_read_tokens / input_tokens` ratio on turn 2+ should be ≥0.6 for a healthy cache.

### Querying memory directly (admin tasks)

```sql
-- All conversations for a customer
SELECT Id, Title__c, User_Id__c, Last_Activity_At__c, CreatedDate
FROM Plan_Conversation__c
WHERE Customer_Id__c = 'yellowhammer'
ORDER BY Last_Activity_At__c DESC

-- Full thread
SELECT Sequence__c, Role__c, Content_Format__c, Content__c
FROM Plan_Message__c
WHERE Conversation__c = 'a01...'
ORDER BY Sequence__c ASC

-- Today's spend per user
SELECT User_Id__c, Turn_Count__c, Cost_Usd_Micros__c / 1000000 cost_usd
FROM Plan_Usage_Daily__c
WHERE Day__c = TODAY
```

GDPR-style data delete for one user:

```sql
DELETE FROM Plan_Conversation__c WHERE User_Id__c = '005...'
-- Cascades to Plan_Message__c via the master-detail relationship.
```

## Content redaction (logs)

`pino` is configured with a redact list in `copilotLog.ts` that strips any prompt, assistant text, or tool input/output. Customer ids are hashed (sha256, first 16 chars) to `customer_id_hash`. Content lives in Salesforce; logs only carry metadata.

For local debugging only: `LOG_LEVEL=debug` shows tool dispatch detail. Never enable on production.

## Cost model (2026-04 approx)

| Turn shape | Input | Output | Cache | Cost (Sonnet) | Cost (Opus) |
|---|---|---|---|---|---|
| First turn, 1 tool | 8K | 600 | 0 / 0 | $0.033 | $0.16 |
| Follow-up turn | 2K billable (cache hit) | 400 | 6K / 0 | $0.014 | $0.075 |
| Retriever (Haiku) | 1K | 50 | 0 / 0 | $0.0012 | — |

Daily budget $25 (default) = ~750 Sonnet turns or ~150 Opus turns per customer per day.

## Known limits

- **Salesforce API call quota**: each turn does ~5 callouts to Apex REST. Enterprise edition gives 100K/day. At 200 turns/day = ~1000 calls — comfortable.
- **Apex governor limits**: each `appendTurn` call inserts up to 60 messages (we cap at 60 entries). Well under the 10K DML row limit.
- **Apex callout limit (LWC side)**: each LWC copilot turn uses 1 callout to `/api/copilot`. Within limits.
- **Vercel function timeout**: 60s on Hobby, 300s on Pro. Multi-tool turns can hit 30-45s. Use Pro.
- **Anthropic rate limits**: Tier 2 is 50 RPM on Opus, higher on Sonnet. The cost-per-turn cap usually trips first.
- **`Plan_Message__c.Content__c`**: 131K chars per row. Multi-tool turns serialize tool_use + tool_result blocks as JSON, typically 5-30K. Plenty of headroom.

## Future work (not blocking launch)

- Datadog dashboard template (p50/p99 latency, cost/customer/day, cache hit ratio, SF callout latency)
- Retention cron via SF Scheduled Apex: auto-delete conversations older than 90 days
- Conversation export REST endpoint for GDPR-style data requests (returns the full Plan_Conversation__c + Plan_Message__c tree as JSON)
- Multi-customer isolation: per-tenant Anthropic workspaces
- Long-context summarization: when a thread exceeds 30 messages, replace older turns with a Haiku-generated summary block
