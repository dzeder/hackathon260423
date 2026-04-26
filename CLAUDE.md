# Ohanafy Plan — Hackathon Project Context

## What this is

Demo kernel of **Ohanafy Plan**, the FP&A module inside the Ohanafy Salesforce
managed package. Three parallel tracks (web app, MCP servers, SFDX package)
integrating at merge sync points. Pilot customer: Alabama beer + Red Bull
wholesaler (fictional demo customer: "Yellowhammer Beverage"). Full slice spec
in `.context/attachments/HACKATHON-BUILD-OS.md` — read that top to bottom.

## The rules

Read `HACKATHON-BUILD-OS.md`. Non-negotiables are in §0. The slice you are
building is determined by which worktree / branch you are in:

- `track-a-web` → Track A (see §9.1)
- `track-b-mcp` → Track B (see §9.2)
- `track-c-sfdx` → Track C (see §9.3)

## Conventions

- Ohanafy namespace: `ohfy__` (read-only; never modify)
- Apex prefix: `Ohfy` in PascalCase, `ohfy_` in lowercase
- LWC: kebab-case under `force-app/main/default/lwc/`
- Volume units: **cases** (primary for wholesalers); `bbl` only where clearly labelled. Never gallons or liters without a label.
- Currency: USD
- Customer is a **wholesaler**, not a brewery (see §18 for glossary: supplier allocation, depletion, chain program, CDA, route, pick-pack, on-premise / off-premise / chain / independent, STW)
- Demo customer: Yellowhammer Beverage — Birmingham, AL. Beer + Red Bull. See §11 for full profile.
- Sandbox: `ohanafy-hack-sandbox`. The real Ohanafy managed package IS installed there. Track C deploys into that org as a 2GP dependent package.

## Git discipline

- Branch = your track's worktree name, never `main`
- Commit every working sub-step; `git commit -am "wip"` is legal today
- Push every 30 min; don't lose work to laptop death
- Never merge to `main` without human +1 + green CI (enforced by `.claude/hooks/pre-merge-human-gate.sh`)
- Log every non-trivial decision in `DECISION_LOG.md`
- Log every >20 min blocker in `BLOCKERS.md` (auto-pages Captain via Slack)

## Test discipline

- EVERY pure function gets a Vitest unit test in the same commit
- EVERY MCP tool handler gets a Vitest test with a mocked external API
- The §15 demo happy path has ONE Playwright E2E test — mandatory, not optional
- Apex classes get tests to clear the Salesforce 75% coverage bar (policy, not optional)
- CI runs all of the above on every PR; merge gated on green
- Tests become demo content — see §16 on showing CI green during the pitch

## Observability (Datadog)

- Every web request gets a dd-trace span
- Every MCP tool call gets a dd-trace span with `tool.name` tag
- Every copilot suggestion + feedback event emits a structured log
- Logs use JSON format with `customer_id_hash`, `track`, `service`, `trace_id` fields
- Service naming: `ohanafy-plan-webapp`, `ohanafy-plan-mcp-{forecast,events,memory,network}`, `ohanafy-plan-lwc`
- The Datadog dashboard at `dd/ohanafy-plan-hack` is the closing visual of the demo

## Skills auto-load on these patterns

- `packages/mcp-servers/**/*.ts` → `mcp-builder`, `test-driven-development`, `observability-patterns`
- `packages/web-app/**/*.tsx` → `webapp-testing`, `brand-guidelines`, `observability-patterns`
- `packages/sfdx-package/**/lwc/**` → `lwc-security-checker`
- `packages/**/*.test.ts` → `testing-patterns`
- Any file named `*-forecast*`, `*-event*`, `*-depletion*`, `*-supplier*` → `ohfy-data-model`, `event-library-patterns`, `wholesaler-data-model`
- Any file with `.docx`, `.pptx`, `.xlsx`, `.pdf` → `document-skills`

## Do NOT do

- Do not auto-merge PRs
- Do not push to `main` directly
- Do not merge with red CI
- Do not install new npm packages without logging in `DECISION_LOG.md`
- Do not modify `/references/` (read-only)
- Do not modify anything in the `ohfy__` namespace in the sandbox
- Do not invent event templates beyond Appendix A
- Do not use emojis in copilot output (CFO audience)
- **Do not skip writing tests** — unit + E2E are REQUIRED
- Do not write cross-customer memory without going through `ohanafy-network` MCP's opt-in + anonymization pathway (§6.6)
- Do not log PII or customer names to Datadog — use `customer_id_hash`
- Do not store conversation state outside the customer's Salesforce org. Memory lives in `Plan_Conversation__c` / `Plan_Message__c` / `Plan_Usage_Daily__c` via `OhfyPlanMemoryStore` Apex REST. **Do not reintroduce an external DB** (Turso/Postgres/etc.) — see DECISION_LOG entries for the pivot rationale.

## Production architecture (post-hackathon)

The web app is now customer-bound, not just hackathon-demo. Key facts a future session needs:

- **Persistence**: customer's Salesforce org via `OhfyPlanMemoryStore` Apex REST endpoint at `/services/apexrest/plan/memory`. Backed by 3 custom objects: `Plan_Conversation__c`, `Plan_Message__c`, `Plan_Usage_Daily__c`. Web app reaches them via `salesforceClient.callApexRest()`.
- **Auth (SF gateway → Vercel)**: shared-secret header `X-Ohanafy-Client-Secret`. SF side reads from `Ohanafy_Copilot_Config__mdt.Default.Client_Secret__c`; Vercel reads `COPILOT_CLIENT_SECRET` (or `COPILOT_CLIENT_SECRETS` plural during rotation).
- **Auth (Vercel → SF)**: Connected App + Client Credentials OAuth 2.0 flow. Same Connected App powers both Apex REST endpoints. Token cached in-process via `salesforceClient.ts`.
- **Customer scoping**: every memory row carries `Customer_Id__c` (constant per Vercel deploy via `SF_CUSTOMER_ID`). Single-customer dedicated deploy today; multi-tenant becomes an additive change later.
- **Models**: `claude-sonnet-4-6` default for orchestrator (~5× cheaper than Opus for tool-using work), `claude-haiku-4-5-20251001` for the cross-conversation relevance retriever.
- **Cost guardrails**: per-user-per-day default 200 turns / $25 / $0.30 per turn. Env-tunable. Counters live in `Plan_Usage_Daily__c`.
- **Runbook**: `docs/runbook.md` is the source of truth for setup, env vars, secret rotation, and triage.

## When stuck

1. Read the relevant section of `HACKATHON-BUILD-OS.md`
2. Check `/references/` for the pattern
3. If still stuck after 20 min: append to `BLOCKERS.md` with 2 alternatives, tag `@captain` via the post-blocker hook

## Primary contacts

- Captain (rotating): see §3.2
- Slack channel: `#axe-a-thon`
- Spec: `.context/attachments/HACKATHON-BUILD-OS.md`
