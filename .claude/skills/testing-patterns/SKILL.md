---
name: testing-patterns
description: Use when writing or reviewing tests. Triggers on any *.test.ts, *.spec.ts, tests/**, e2e/**, playwright.config.ts, vitest.config.ts. Also triggers when adding production code that doesn't yet have a matching test file.
---

Three kinds of tests in this project, each with a specific role:

1. **Vitest unit tests** (`*.test.ts` next to the production file)
   - For every pure function, every MCP tool handler, every data transformer
   - One assertion per test, behavior-focused test names
   - External APIs (CFBD, NOAA, EIA, Anthropic, DynamoDB, Salesforce) MUST be mocked via `vi.mock` or `msw`
   - Test files live beside production files: `applyEvents.ts` → `applyEvents.test.ts`

2. **Playwright E2E test** (`/e2e/demo-happy-path.spec.ts`)
   - ONE file, mirrors §15 demo narration step by step
   - Runs on the deployed Vercel preview URL in CI, localhost in dev
   - Every narration bullet gets a test step with both action and assertion
   - If §15 changes, update this file in the same PR

3. **Apex tests** (Track C, under `force-app/main/default/classes/*Test.cls`)
   - Mandatory by Salesforce policy (75% coverage required to deploy)
   - One test class per Apex class being tested
   - Use `Test.startTest()` / `Test.stopTest()` and `System.assertEquals`

Anti-patterns to reject:

- Tests that only test the mock (the mock echoes input, test confirms output matches input — useless)
- Tests with `time.sleep` or arbitrary waits — use explicit signals
- Tests that hit real external APIs in CI
- E2E tests that re-test unit-level logic (bloat)
- Snapshot tests on anything volatile (timestamps, UUIDs)

Fixture discipline:

- Real API responses captured once, saved to `/fixtures/<service>/<scenario>.json`
- Fixtures checked into git, referenced by name in tests
- When a fixture goes stale, regenerate with `npm run fixtures:refresh` (one-off)

See Appendix F.2 for the full test matrix and CI workflow.
