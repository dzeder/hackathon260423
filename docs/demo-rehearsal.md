# §15 demo rehearsal — punch list

Captured during the P4 rehearsal pass run by the `demo-path-rehearser`
agent against `master` after PRs #26–#29 merged. This file is the
hand-off to whoever runs the demo: read it once before stage time.

## Status of each §15 beat

| Beat | Tool / surface | State | Notes |
| --- | --- | --- | --- |
| Dashboard renders | `ScenarioDashboard.tsx` | green | E2E covered |
| Apply Iron Bowl | `EventPicker` → `applyEvents` | green | E2E covered |
| KPIs update | `kpi-{revenue,ebitda,gm}-delta` | green | Delta is single-digit because Iron Bowl lives in the last horizon month |
| Three-statement table | `ThreeStatementTable.tsx` | green | |
| Copilot Q&A | `CopilotPanel` → `/api/copilot` | green w/ ops caveat | Works when `COPILOT_CLIENT_SECRET` + `ANTHROPIC_API_KEY` are set on Vercel |
| **IC memo (new)** | `IcMemoButton` → `/api/ic-memo` | green | Canned path now lands in the 120–180 word band for 0–3 event runs |
| Datadog dashboard | `dd/ohanafy-plan-hack` | works only with env | dd-trace gated on `DD_API_KEY` |

## Pre-stage operations checklist

These are env-side, not code-side. Confirm each on Vercel + the MCP host
before the demo opens.

- [ ] Vercel deploy of `master` is current. Trigger a manual redeploy if
      `vercel ls` does not point at the latest commit.
- [ ] `COPILOT_CLIENT_SECRET` (or `COPILOT_CLIENT_SECRETS` plural) is set
      on Vercel — without it `/api/copilot` and `/api/ic-memo` return
      `503 not_configured` when the Apex gateway calls in.
- [ ] `ANTHROPIC_API_KEY` is set on Vercel — without it both routes use
      the canned path (still demo-safe but `source: canned` will surface
      in the IC-memo subtitle).
- [ ] `SF_AUTH_URL` is set on Vercel — without it the baseline read
      falls back to seed JSON. The dashboard still loads, but the
      "live from `ohfy__Invoice__c`" claim in the narration is false.
- [ ] `DD_API_KEY` is set on Vercel **and** on the MCP runtime host —
      without it no spans land in `dd/ohanafy-plan-hack`. The closing
      slide goes blank.
- [ ] `OHFY_PLAN_NS_PREFIX="ohfy__"` is set wherever the SF client is
      reaching the packaging org (see PR #27, #28).

## Known polish items (non-blocking)

- The web app's `eventsCatalog` is hard-coded TS constants. PR #27 wired
  the **MCP server** to live `Plan_Event_Template__c`, but the dashboard
  itself does not traverse that path. If demo narration claims "events
  load from Salesforce", pivot to the MCP CLI to show it, or rewire the
  dashboard later (out of P4 scope).
- `record_decision` write-through (PR #28) is reachable via the MCP tool
  only — the web copilot does not yet call `record_decision`. Graceful
  degrade is verified (`salesforce: null` when `SF_AUTH_URL` unset). To
  show the audit trail, query `Plan_Scenario_Decision__c` in the org
  after the LWC scenario engine fires `OhfyPlanDataReader.recordDecision`.
- IC memo button shows only "Generating…" while waiting. A spinner
  affordance would be nicer; not urgent.
- Iron Bowl event is dated `2026-10`, the last month of the May–Oct 2026
  horizon, so the EBITDA delta is muted. Narrate "1 of 6 months impacted"
  to set expectations rather than promising a dramatic shift.

## Documentation lag

- `STATUS.md` still reads "Bootstrap (pre-hackathon)". Refresh before
  any on-screen status panel is shown.
- `.context/attachments/HACKATHON-BUILD-OS.md` is gitignored and not
  present in fresh worktrees. The rehearsal had to fall back to the
  Playwright happy-path spec for the canonical step list — keep a copy
  of the spec on the demo machine.

## Closed in this PR

- Tightened the canned IC memo template so it lands in the 120–180 word
  band across 0/1/2/3-event runs (was 54–87 words). New vitest case
  asserts the band; Playwright e2e band updated to 110–220 to match.
