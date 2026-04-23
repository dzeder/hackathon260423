# Ohanafy Plan — Hackathon Demo Monorepo

The demo kernel of **Ohanafy Plan**, the FP&A module for the beverage industry, built for an 8-hour hackathon. Pilot customer: Alabama beer + Red Bull wholesaler (fictional: "Yellowhammer Beverage"). Full build OS in [`.context/attachments/HACKATHON-BUILD-OS.md`](.context/attachments/HACKATHON-BUILD-OS.md) — read it end to end.

## Repo layout

```
.
├── CLAUDE.md                    # project context for Claude Code (every session reads this)
├── DECISION_LOG.md              # append-only non-trivial decisions
├── BLOCKERS.md                  # append-only >20 min blockers
├── STATUS.md                    # auto-refreshed dashboard
├── scripts/setup-harness.sh     # run once to install plugins + reference repos
├── .claude/                     # Claude Code harness (rules, agents, skills, commands, hooks)
├── .github/                     # CI/CD workflows + PR template
├── packages/
│   ├── web-app/                 # Track A — Next.js 14 scenario engine + copilot UI
│   └── mcp-servers/             # Track B
│       ├── ohanafy-forecast/
│       ├── ohanafy-events/
│       ├── ohanafy-memory/
│       └── ohanafy-network/
├── force-app/                   # Track C — SFDX 2GP dependent package (LWC + Apex)
└── seed/                        # Yellowhammer seed data (hardcoded)
```

## Quickstart (each engineer)

```bash
# 1. Clone and install
git clone <remote-url> ohanafy-plan-demo
cd ohanafy-plan-demo
npm install

# 2. Verify green locally
npm test

# 3. Load the harness (installs Claude Code plugins + clones reference repos)
bash scripts/setup-harness.sh

# 4. Copy env template and fill in keys you need
cp .env.local.example .env.local
# Fill ANTHROPIC_API_KEY (all tracks), CFBD/NOAA/EIA/AWS (Track B), SF_* (Track C), DD_* (all).

# 5. Create your track worktree
git worktree add -b track-a-web  ../ohanafy-plan-demo-a   # or track-b-mcp / track-c-sfdx
cd ../ohanafy-plan-demo-a
claude   # Claude Code auto-loads CLAUDE.md and the track playbook from §9
```

## Which track am I on?

| Branch | Track | Playbook | Deliverable |
|---|---|---|---|
| `track-a-web` | Web App | §9.1 | Next.js at `packages/web-app/`, deployed to Vercel |
| `track-b-mcp` | MCP Servers + Agents | §9.2 | 4 MCP servers at `packages/mcp-servers/` |
| `track-c-sfdx` | SFDX + Deliverables | §9.3 | LWC + Apex stub in a 2GP package deployed to `ohanafy-hack-sandbox`; plus slides, video, branding |

## CI/CD

All PRs run `.github/workflows/ci.yml`:

- `lint-and-types` — `tsc --noEmit` across packages
- `unit-tests-webapp` — Vitest on `packages/web-app`
- `unit-tests-mcp` — Vitest on each MCP server (matrix)
- `e2e` — Playwright against the Vercel preview URL (skipped until Track A deploys)
- `apex-tests` — runs only when `force-app/**` changes

Additional workflows:

- `pr-claude-review.yml` — Claude posts a structured PR review (requires `ANTHROPIC_API_KEY` secret; skips gracefully if absent)
- `slack-notify.yml` — pings `#axe-a-thon` on push / PR / merge (requires `SLACK_WEBHOOK_URL`)
- `status-refresh.yml` — regenerates `STATUS.md` every 30 min
- `checkpoint-{12pm,2pm,330pm}.yml` — runs the §13 mid-day checkpoint prompts

### Required GitHub secrets (set in repo settings)

| Secret | Used by | Required? |
|---|---|---|
| `ANTHROPIC_API_KEY` | `pr-claude-review.yml`, `status-refresh.yml`, checkpoints | recommended |
| `SLACK_WEBHOOK_URL` | `slack-notify.yml`, checkpoints | recommended |
| `DD_API_KEY` | `ci.yml` (CI event posting) | optional |
| `CFBD_API_KEY` | `ci.yml` (Track B MCP test fixtures) | optional |
| `EIA_API_KEY` | `ci.yml` (Track B MCP test fixtures) | optional |
| `SF_USERNAME` | `ci.yml` (Track C sandbox deploy from CI) | optional |
| `SF_AUTH_URL` | `ci.yml` (Track C sandbox deploy from CI) | optional |

**Absent secret = green CI, skipped feature.** Nothing in CI should *fail* because a secret is missing.

### Required branch protection on `main`

Set in GitHub repo settings → Branches → `main`:

- Require at least **1 approving review**
- Require status checks to pass: `lint-and-types`, `unit-tests-webapp`, `unit-tests-mcp`
- Require branches to be up to date before merging
- No force pushes

## Non-negotiables (from §0 of the spec)

1. Ship a slice — working 20% beats broken 80%.
2. Every feature ladders up to an FDD pillar in §1.
3. **4 PM hard freeze** on demo day — `.md`-only merges after that (enforced by `.claude/hooks/pre-push-ci-gate.sh`).
4. Every non-trivial decision logged in `DECISION_LOG.md`.
5. Blocker SLA is 20 minutes.
6. Tests are mandatory. Merge gated on green CI.
7. Datadog observability is mandatory.
8. No auto-merge to main. Ever.

## Licence / copyright

Reference repos under `/references/` (cloned by `setup-harness.sh`) are for pattern study only — restate, don't reproduce. See §0.9 of the spec.
