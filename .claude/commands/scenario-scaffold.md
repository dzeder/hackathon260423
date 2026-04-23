---
description: Scaffold a new Track A component (event card, chart, etc.) from a naming convention.
arguments: [component_name] [purpose]
---

Create a new React component under `packages/web-app/src/components/$component_name/` with:

1. `$component_name.tsx` — the component, typed props, JSDoc describing purpose
2. `$component_name.test.tsx` — Vitest unit test with at least one behavior assertion
3. Export from `packages/web-app/src/components/index.ts`

Follow `.claude/rules/naming-conventions.md` and `.claude/skills/testing-patterns/SKILL.md`.
