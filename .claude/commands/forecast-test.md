---
description: Run the happy-path smoke test against the live Vercel deployment.
---

1. `curl` the Vercel preview URL and assert 200 + known markers in HTML
2. Run `npx playwright test e2e/demo-happy-path.spec.ts --headed=false` against the preview URL
3. Report pass/fail with the list of failed narration steps (by §15 bullet number)
