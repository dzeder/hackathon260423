# Commit Message Format

```
<type>(<scope>): <subject>

<body — optional, but required for decisions>
```

**Types:** `feat`, `fix`, `chore`, `test`, `docs`, `refactor`, `perf`, `scope-cut`

**Scopes:** `track-a`, `track-b`, `track-c`, `harness`, `ci`, `seed`, `demo`, `obs`

## Examples

- `feat(track-a): stack events multiplicatively in applyEvents`
- `fix(track-b): handle CFBD 429 rate-limit with retry-after`
- `scope-cut(track-c): defer Excel export button to Phase 2 (§14.4)`
- `test(track-a): add unit tests for applyEvents channel shifts`

## Trigger keywords

The `post-commit-log.sh` hook auto-appends a `DECISION_LOG.md` entry when a commit message contains any of: `scope.cut`, `pivot`, `decision`, `chose`, `rejected`, `stack`.
