# Decision Log

Append-only. Every non-trivial fork logged here. See §19 of the spec.

Format: `HH:MM — <decision>. Reason: <why>. Alternatives considered: <list>.`

---

- `bootstrap` — Monorepo housed in the `lahore-v2` workspace rather than a fresh `~/hackathon/ohanafy-plan-demo` directory. Reason: workspace is already a git repo under Conductor; direct path to "CI/CD so others can build". Alternatives: clone into `~/hackathon/` per §4.4 verbatim (rejected — extra step, fragments git history).
- `bootstrap` — CI workflows designed for graceful fallback when secrets are absent (no `ANTHROPIC_API_KEY` → skip PR review, no `SLACK_WEBHOOK_URL` → skip ping). Reason: other engineers must be able to clone, `npm install`, and see green without any manual auth. Alternatives: hard-require secrets (rejected — blocks day-one onboarding).
