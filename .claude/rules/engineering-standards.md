# Engineering Standards (hackathon edition)

- One feature per commit. Small. Buildable.
- No test writing unless the test will be run in CI today. Delete-or-run rule.
- Any state beyond the current component requires a DECISION_LOG.md entry.
- No new runtime dependencies without logging; comment explains the choice.
- Every exported TS function has a JSDoc one-liner.
- No `any` types in Track B MCP server schemas — Zod-validated.
- Errors must propagate to the UI with a visible message (no swallowed catches).
