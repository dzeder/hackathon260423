---
description: Delegate to the event-template-builder agent to scaffold a new event template.
arguments: [id] [category] [description]
---

Delegate to the `event-template-builder` agent with the arguments. The agent will:

1. Output a TypeScript object for `packages/web-app/src/data/events.ts`
2. Output a JSON fragment for `packages/mcp-servers/ohanafy-events/src/library.json`
3. Calibrate impact ranges from Appendix A

Do not invent values — cite the appendix row.
