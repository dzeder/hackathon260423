# No Silent Pivots

Every non-trivial fork gets logged in `DECISION_LOG.md` before the code lands. No exceptions.

## What counts as a "non-trivial fork"

- Changing a dependency version or adding/removing a package
- Changing an MCP tool's signature after it's been consumed by another track
- Reframing a UI interaction from the §15 demo script
- Reallocating scope between tracks
- Cutting scope (always goes through §14's decision tree)
- Picking one library/approach over another where the trade-off matters

## How to log

Append one line to `DECISION_LOG.md`:

```
HH:MM — <decision>. Reason: <why>. Alternatives: <list>.
```

If the decision affects the §15 demo narration, also update the demo script in the same commit.

## Enforcement

- `.claude/hooks/post-commit-log.sh` auto-detects decision keywords in commit messages and appends a stub entry. That stub must be filled in before the PR merges.
- The Claude PR review bot (`.github/workflows/pr-claude-review.yml`) flags PRs that contain decision-like changes without a matching DECISION_LOG.md entry.
