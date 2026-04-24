# Datadog monitors for Ohanafy Plan

Terraform is the canonical source for the SLO and operational monitors
that pager `#axe-a-thon`. Keep this directory in sync with the Datadog
UI — any drift belongs in a PR against `datadog-monitors.tf`.

## Emitted metrics

| Metric | Type | Tags | Source file |
|---|---|---|---|
| `ohanafy.plan.copilot.latency_ms` | histogram | `source:(live\|canned)` | `packages/web-app/src/app/api/copilot/route.ts` |
| `ohanafy.plan.copilot.cost_usd` | distribution | (reserved; wired once the agent log write lands) | — |
| `ohanafy.plan.tool.rate_limit_exceeded` | counter | `tool:<name>` | `/api/tools/[toolName]/route.ts` |
| `ohanafy.plan.tool.circuit_open` | counter | `tool:anthropic` (others when wired) | `src/lib/copilotLive.ts` |
| `ohanafy.plan.tool.disabled_by_config` | counter | `tool:<name>` | `/api/tools/[toolName]/route.ts` |

All emission goes through `src/lib/metrics.ts`, which lazy-loads the
`dd-trace` dogstatsd client. When `DD_AGENT_HOST` is unset (local dev,
unit tests) the helpers no-op.

## SLO thresholds (from the production-readiness plan)

| SLO | Warn | Page |
|---|---|---|
| copilot p95 latency | 600 ms | 800 ms |
| copilot p99 latency | 1500 ms | 2000 ms |
| copilot median cost / call | $0.04 | $0.05 |
| tool rate limit breaches (rolling 5m) | — | any > 0 |
| circuit breaker trips (rolling 5m) | — | any > 0 |

## Applying

Secrets live in the CI-only `datadog-ops` environment. Do **not** run
`terraform apply` from a laptop.

```sh
terraform -chdir=monitoring init
terraform -chdir=monitoring plan \
  -var="dd_api_key=$DD_API_KEY" \
  -var="dd_app_key=$DD_APP_KEY"
terraform -chdir=monitoring apply ...
```

## Deferred

- `copilot.cost_usd` emission is reserved but not yet wired; it depends
  on the web-app ↔ Salesforce log-write path (end-of-Phase-1 auth
  sub-task). Once that ships, cost per call is derivable from the log
  row and will be emitted from `/api/copilot/route.ts`. Until then the
  `copilot_cost_median` monitor has `notify_no_data = false` to avoid
  continuous "no data" alerts — flip it back to `true` once emission
  is live.
- `SF_AUTH_URL`-backed Datadog monitor on Apex test failures — separate
  PR once the CI pipeline for `apex-tests` settles.
