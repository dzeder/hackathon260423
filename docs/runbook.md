# Copilot Production Runbook

Operational guide for the Ohanafy Plan copilot stack on Vercel + Turso + Salesforce.

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
                                                 │  ┌────────────┐
                                                 ├─▶│   Turso    │  conversations,
                                                 │  │   libSQL   │  messages, usage
                                                 │  └────────────┘
                                                 │
                                                 │  OAuth client_credentials
                                                 ▼  ↓
                                          ┌────────────────────┐
                                          │  Salesforce Org    │
                                          │  /services/apexrest│
                                          │     /plan/soql     │
                                          └────────────────────┘
```

## One-time setup

### 1. Turso database

```bash
turso db create ohanafy-copilot-<customer>
turso db show --url ohanafy-copilot-<customer>   # → TURSO_DATABASE_URL
turso db tokens create ohanafy-copilot-<customer> # → TURSO_AUTH_TOKEN
```

Replicas: Turso replicates globally by default. For US-East customers on Vercel (IAD region), no config needed.

### 2. Shared secret between Salesforce and Vercel

```bash
openssl rand -hex 32
```

Paste the output in BOTH places:

- **Vercel** → Project → Settings → Environment Variables → add `COPILOT_CLIENT_SECRET` for Production and Preview scopes.
- **Salesforce** → Setup → Custom Metadata Types → Ohanafy Copilot Config → Default record → Client Secret field.

Deploy the Custom Metadata record change with the rest of force-app.

### 3. Salesforce Connected App (for live SOQL)

Setup → App Manager → New Connected App:

- **Name**: `Ohanafy Plan Copilot SOQL`
- **Contact Email**: your ops email
- **Enable OAuth Settings**: yes
- **Callback URL**: `https://login.salesforce.com/services/oauth2/callback` (unused for client_credentials but required)
- **Selected OAuth Scopes**: `Manage user data via APIs (api)`, `Perform requests at any time (refresh_token, offline_access)`
- **Enable Client Credentials Flow**: yes
- **Run As**: a dedicated integration user (Profile: Read-only, scoped via Permission Set to the objects in `OhfyPlanSoqlReader.ALLOWED_OBJECTS`)

After save, wait ~5 min for OAuth to propagate, then grab **Consumer Key** and **Consumer Secret**.

Paste into Vercel env:

- `SF_LOGIN_URL` = `https://<my-domain>.my.salesforce.com`
- `SF_CONSUMER_KEY` = <consumer key>
- `SF_CONSUMER_SECRET` = <consumer secret>

### 4. Vercel environment variables (full list)

| Variable | Required | Scope |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Production + Preview |
| `TURSO_DATABASE_URL` | yes (prod) | Production + Preview |
| `TURSO_AUTH_TOKEN` | yes (prod) | Production + Preview |
| `COPILOT_CLIENT_SECRET` | yes | Production + Preview |
| `SF_CUSTOMER_ID` | yes | Production + Preview |
| `SF_LOGIN_URL` | for live SOQL | Production + Preview |
| `SF_CONSUMER_KEY` | for live SOQL | Production + Preview |
| `SF_CONSUMER_SECRET` | for live SOQL | Production + Preview |
| `DD_API_KEY` | for tracing | Production |
| `DD_ENV` | for tracing | Production |
| `COPILOT_MAX_TURNS_PER_DAY` | optional (default 200) | Production |
| `COPILOT_MAX_COST_USD_PER_DAY` | optional (default 25) | Production |
| `COPILOT_MAX_COST_USD_PER_TURN` | optional (default 0.30) | Production |

### 5. Deploy

```bash
# Web app (first deploy + every push to prod branch)
cd packages/web-app
vercel deploy --prod --yes

# Salesforce
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
    "database":    { "ok": true },
    "anthropic":   { "ok": true },
    "gatewayAuth": { "ok": true },
    "salesforce":  { "ok": true }
  },
  "version": "<git-sha>",
  "timestamp": "2026-04-24T..."
}
```

Status 200 = all critical checks pass. Status 503 = database or anthropic unavailable. `salesforce: ok=false` is **degraded, not failed** — copilot still serves from canned SOQL fixtures.

Wire a Datadog synthetic: GET `/api/health` every 5 min, alert on 503 or no response.

## Operations

### Rotating the shared secret (zero-downtime)

1. Generate new secret: `openssl rand -hex 32`.
2. **Vercel**: add the new value to `COPILOT_CLIENT_SECRETS` (plural, comma-separated: `<new>,<old>`). Redeploy.
3. **Salesforce**: update the `Ohanafy_Copilot_Config__mdt.Default.Client_Secret__c` record to the new value. Deploy.
4. Wait 10 min for Salesforce callouts to settle on the new header.
5. **Vercel**: set `COPILOT_CLIENT_SECRET` to just the new value. Remove `COPILOT_CLIENT_SECRETS`. Redeploy.

### Rotating the Anthropic API key

1. Generate a new key in console.anthropic.com.
2. Update Vercel `ANTHROPIC_API_KEY`. Redeploy.
3. Revoke the old key.

If the old key ever appears in a git commit — not caught by gitleaks — rotate **immediately** and log in `DECISION_LOG.md` per `CLAUDE.md`'s no-silent-pivots rule.

### Rotating Salesforce Consumer Secret

1. Salesforce → App Manager → Ohanafy Plan Copilot SOQL → Manage → Edit → New Consumer Secret.
2. Update Vercel `SF_CONSUMER_SECRET`. Redeploy.

The in-process token cache will refresh on next cold start. If you need an immediate refresh, bounce the Vercel function (deploy a dummy commit or use `vercel redeploy`).

### Running a migration

Schema changes live in `packages/web-app/migrations/*.sql`. Naming convention: `NNN_description.sql` with 3-digit zero-padded sequence.

Applied automatically on first request after deploy. Tracked in the `_migrations` table. Never edit a shipped migration — append a new one.

To run ad hoc against Turso:

```bash
turso db shell ohanafy-copilot-<customer> < packages/web-app/migrations/002_new.sql
```

### Rolling back

- **Vercel**: Settings → Deployments → find the last good deploy → `Promote to Production`.
- **Salesforce**: revert commit locally, redeploy. Apex supports metadata rollback via `sf project deploy start --source-dir <older-version>`.
- **Turso**: point-in-time restore via `turso db restore`.

### Triage: copilot returning errors

1. Open the deployment's **Function Logs** in Vercel (every `logTurn` call goes here).
2. Look for `copilot_event: turn_complete` for success, or `copilot_live_turn_failed` for errors.
3. Check `/api/health`. If `database.ok=false`, see Turso status page. If `anthropic.ok=false`, check the API key and Anthropic status.
4. If `query_salesforce` is erroring: check `SF_*` env vars, try `curl` the SF `/services/oauth2/token` endpoint manually.

### Triage: copilot slow or expensive

- `cost_cap_hit: true` in logs means a single turn exceeded `COPILOT_MAX_COST_USD_PER_TURN`. Look at `tool_names` — a loop of many tool calls is the usual cause.
- `cache_read_tokens` close to `input_tokens` on turn 2+ = caching is working. If not, system prompt likely changed between turns (ideally static).
- Escalate to Opus selectively by passing `model: "claude-opus-4-7"` in the request body for hard questions.

## Content redaction (logs)

`pino` is configured with a redact list in `copilotLog.ts` that strips any accidentally-logged prompt, assistant text, or tool input/output. Customer ids are hashed to `customer_id_hash` (first 16 chars of sha256).

If you need to inspect raw content for a debugging session, set `DEBUG_COPILOT=1` on the local dev server only. Never on production.

## Cost model (2026-04 approx)

| Turn shape | Input | Output | Cache | Cost (Sonnet) | Cost (Opus) |
|---|---|---|---|---|---|
| First turn, 1 tool | 8K | 600 | 0 / 0 | $0.033 | $0.16 |
| Follow-up turn | 2K billable (cache hit) | 400 | 6K / 0 | $0.014 | $0.075 |
| Retriever (Haiku) | 1K | 50 | 0 / 0 | $0.0012 | — |

Daily budget $25 (default) = ~750 Sonnet turns or ~150 Opus turns per customer per day.

## Known limits

- **Apex callout limit**: Salesforce allows max 100 callouts per transaction. Each LWC copilot turn uses 1 callout to `/api/copilot`. Each copilot turn on the Vercel side can make 0-1 callback for SOQL. Well within limits.
- **Vercel function timeout**: 60s on Hobby, 300s on Pro. A multi-tool turn can approach 30-45s. Ensure project is on Pro.
- **Turso free tier**: 9GB storage, 1B row reads/month. Yellowhammer at ~10 turns/day will stay in free tier for years.
- **Anthropic rate limits**: Tier 2 is 50 RPM on Opus, higher on Sonnet. Our per-turn cost cap enforces before hitting rate limits in practice.

## Future work (not blocking launch)

- Multi-tenant isolation (per-tenant Anthropic workspace, separate rate buckets)
- Retention cron: auto-delete conversations older than 90 days
- Datadog dashboard template (p50/p99 latency, cost/customer/day, cache hit ratio)
- Conversation export for GDPR-style data requests
- Circuit breaker on Anthropic (master has one in `master` branch; needs merge)
- Prompt + tool schema versioning on every response (master has PROMPT_VERSION; needs merge)
