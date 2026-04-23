---
name: event-library-patterns
description: Use when building, editing, or validating event templates for the scenario engine. Triggers on files named *event*, files in data/events/, or mentions of "Alabama football", "hurricane", "gas price", "holiday shift", "event template".
---

Every event template has five components:

1. `id` — kebab-case identifier, e.g., `bama-cfp-sf`
2. `label` — human-readable, e.g., "Alabama CFP Semifinal"
3. `category` — one of: `sports | weather | holiday | economic | regulatory | supply`
4. `timing` — either `{ weekOfYear: number }` or `{ weekRange: [n, m] }`
5. `impact` — an object of shape `{ revenueMultiplier, volumeMultiplier, channelShifts }`

Impact multipliers are percent changes expressed as decimals:

- `+15%` → `revenueMultiplier: 0.15`
- `-60%` → `revenueMultiplier: -0.60`

Channel shifts are relative within the total impact:

```ts
{ "on-premise": +0.20, "off-premise": +0.10, "convenience": +0.30 }
```

When stacking events, impacts compose multiplicatively:

```
final = baseline * (1 + impact_1) * (1 + impact_2) * ...
```

Source all default values from Appendix A of `HACKATHON-BUILD-OS.md`. Never invent values — cite the appendix row.
