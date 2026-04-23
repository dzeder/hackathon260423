---
name: depletion-forecast-patterns
description: Use when modeling the depletion-to-cash cascade, computing supplier-order recommendations, or reasoning about lead times between retail sellout and wholesaler cash. Triggers on files with "depletion", "cascade", "lead time", or "allocation" in their name, and on any MCP tool that consumes or produces depletion data.
---

The cascade (wholesaler flavor — see §1.4 vs brewery flavor):

```
retail sellout ──► wholesaler depletions (weekly, by SKU × channel)
  │ (lag: customer-specific; default 2 weeks)
  ▼
supplier re-order (monthly, against allocation cap)
  │ (lag: 1–3 weeks inbound freight)
  ▼
warehouse inventory (days of cover per SKU)
  │
  ▼
cash out for supplier payment (terms: typically net 30)
```

Key default values for Yellowhammer Beverage:

- Depletion → supplier re-order lag: **2 weeks** (tunable per customer via memory layer)
- Supplier-paid lead time: **3 weeks** for AB/MC, **4 weeks** for Red Bull NA, **1 week** for regional/craft
- Target days-of-cover: **14 days** on beer macros, **21 days** on Red Bull (allocation-constrained SKU)

When an event pushes demand above the supplier allocation cap for the month, the UI flashes a red "allocation risk" warning (wholesaler-only moment — breweries don't have this).

Not exercised deeply today. The hackathon uses hardcoded baselines and does not run Prophet or an actual cascade engine.
