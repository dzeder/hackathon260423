# Datadog templates

Per-customer dashboard + monitor JSON templates for the Ohanafy Plan copilot stack. Apply with `apply.sh`. Idempotent: re-running updates the existing dashboard / monitors in place by name.

## Layout

```
ops/datadog/
├── apply.sh                              # render + create/update via DD API
├── dashboards/
│   └── copilot-overview.json             # main per-customer dashboard
└── monitors/
    ├── p99-latency-webapp.json           # latency
    ├── cost-cap-burn.json                # repeated per-turn cost-cap trips
    ├── error-rate-copilot.json           # copilot_live_turn_failed spike
    ├── cross-tenant-rejection.json       # P0 SECURITY: Apex bind 403
    └── health-check-synthetic.json       # ties to a Datadog Synthetic on /api/health
```

All files use shell-style `${VAR}` placeholders which `apply.sh` resolves with `envsubst`. The supported variables are:

| Variable | Required? | Used by |
|---|---|---|
| `CUSTOMER_ID` | yes | hashed to `CUSTOMER_ID_HASH` for filtering |
| `CUSTOMER_LABEL` | optional (defaults to `CUSTOMER_ID`) | human-readable name in dashboard / monitor titles |
| `DD_API_KEY` / `DD_APP_KEY` | yes | Datadog auth |
| `DD_SITE` | optional (defaults to `datadoghq.com`) | use `datadoghq.eu` for EU orgs |
| `VERCEL_URL` | optional | message body of the health-check monitor |
| `HEALTH_CHECK_ID` | optional | the Datadog synthetic test id; if unset, the health-check monitor is skipped |

`CUSTOMER_ID_HASH` is computed from `CUSTOMER_ID` via SHA-256 (first 16 hex chars, prefixed `c_`). This matches `packages/web-app/src/lib/customerId.ts:hashCustomerId` so the dashboard filters land on real spans / logs.

## What the dashboard shows

One ordered dashboard, scoped to one customer:

1. **Headlines** — turns today, spend today (with red threshold at $25), p50 + p99 latency
2. **Latency** — copilot p50/p99 over time by `source` (live / canned / cost_capped / rate_limited), MCP tool p99 toplist by `tool.name`
3. **Errors, guardrails, isolation** — `copilot_live_turn_failed` count, `cost_cap_hit:true` count, **cross-tenant rejection count** (red if > 0)
4. **Cost & cache** — token consumption stacked area (input / cache_read / output), cache hit ratio scorecard

## Monitors

| File | What it watches | Severity | Renotify |
|---|---|---|---|
| `cross-tenant-rejection.json` | First Apex `customerId does not match` log line | **critical** (P1) | 30 min |
| `health-check-synthetic.json` | `/api/health` synthetic non-200 for 10 min | **critical** (P1) | 30 min |
| `p99-latency-webapp.json` | p99 of `ohanafy.plan.copilot.latency_ms{source:live}` > 30s for 15 min | high (P2) | 60 min |
| `error-rate-copilot.json` | `copilot_live_turn_failed` count > 5 in 15 min | high (P2) | 60 min |
| `cost-cap-burn.json` | `cost_cap_hit:true` count > 3 in 1h | medium (P3) | 4h |

The cross-tenant rejection monitor is intentionally hair-trigger (1 event in 5 min) because it represents a configuration or security incident, not a transient blip. Do not silence it without addressing the root cause — see `docs/runbook.md` §15.

## Apply

```bash
DD_API_KEY=...
DD_APP_KEY=...
CUSTOMER_ID=acme-wines
CUSTOMER_LABEL="Acme Wines"
VERCEL_URL=acme-plan.vercel.app

ops/datadog/apply.sh
```

The first run creates a dashboard and monitors. Subsequent runs (after editing any JSON in this tree) update them in place. To cover a new customer, set `CUSTOMER_ID` / `CUSTOMER_LABEL` to the new values and re-run — separate dashboards / monitors are created because the names embed `${CUSTOMER_LABEL}`.

## When to update the templates

- Add or rename a metric/log field in `lib/copilotLog.ts` or `lib/metrics.ts` → update the matching widget query here.
- Add a new dependency surface (e.g. another external API) → add a widget + monitor.
- Tighten / loosen a threshold based on a customer's real traffic → change in JSON, re-run `apply.sh` for every customer.

Never edit dashboards or monitors via the Datadog UI — your changes will be wiped on the next `apply.sh` run. Edit JSON, re-apply, commit.

## What's intentionally not here

- **Dashboards for the LWC service** (`ohanafy-plan-lwc`) — Track C surfaces no Datadog spans yet. Add when LWC tracing lands.
- **MCP per-server dashboards** — the MCP services emit `mcp.tool.<toolName>` spans which are surfaced in the main dashboard's tool latency toplist. Per-server breakdowns would be redundant for a 5-customer rollout; revisit when one customer's traffic justifies it.
- **Datadog Logs index configuration** — assumes a single `*` index. If a customer wants a dedicated logs index for compliance, add it in their Datadog org and update the `indexes` arrays.
