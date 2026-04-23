# Naming Conventions

## TypeScript
- Files: kebab-case (`apply-events.ts`), except React components which are PascalCase (`BaselineChart.tsx`)
- Functions: camelCase, verb-first (`applyEvents`, not `eventsApplier`)
- Types: PascalCase (`WeeklyBaseline`, `EventTemplate`)
- Constants: SCREAMING_SNAKE_CASE for true constants; camelCase otherwise
- Test files: co-located as `<name>.test.ts` (not `__tests__/`)

## MCP tools
- Tool names: `snake_case` (`list_events`, `apply_events`, `peer_signals`)
- Server package names: `ohanafy-<noun>` (`ohanafy-forecast`, `ohanafy-events`, `ohanafy-memory`, `ohanafy-network`)
- Service names for Datadog: `ohanafy-plan-mcp-<noun>`

## Salesforce
- Apex: PascalCase with `Ohfy` prefix (`OhfyPlanMcpGateway`)
- Apex test: same name + `_Test` (`OhfyPlanMcpGateway_Test`)
- LWC: camelCase file, kebab-case directory (`force-app/main/default/lwc/ohanafyPlanScenarioEngine/ohanafyPlanScenarioEngine.js`)
- Custom objects/fields: avoid `ohfy__` namespace (read-only)

## Events
- Event template IDs: kebab-case, include type and magnitude (`bama-cfp-sf`, `gulf-hurricane-cat-3`, `gas-4-50`)
- Event labels: human-readable (`Alabama CFP Semifinal`)

## Datadog service names (exact strings, don't vary)
- `ohanafy-plan-webapp`
- `ohanafy-plan-mcp-forecast`
- `ohanafy-plan-mcp-events`
- `ohanafy-plan-mcp-memory`
- `ohanafy-plan-mcp-network`
- `ohanafy-plan-lwc`
