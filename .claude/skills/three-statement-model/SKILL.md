---
name: three-statement-model
description: Use when building, editing, or validating the Revenue / Gross Margin / Cash three-statement summary card in the web app, or when copilot variance commentary needs IS/BS/CF causality. Triggers on changes to ThreeStatementCard, cash runway calculations, or any file referencing "three statement", "income statement", "balance sheet", or "cash flow".
---

For the hackathon, we render a three-line summary (IS flavour), not a full model:

- **Revenue** — gross (STW cases × net price/case)
- **Gross Margin %** — gross margin $ / revenue
- **Cash** — opening cash + inflows − outflows for the period (hand-rolled; no full CF engine today)

Formatting (inherited from `anthropics/financial-services-plugins:three-statement-modeling`):

- Hard-coded values: **blue**
- Calculated values: **black**
- Cross-references (link to another sheet/cell): **green**

Sign conventions:

- Revenue, GM $, cash inflow: positive up is good
- Trade spend, CDA, COGS: positive numbers are spend (no negative sign trickery)
- Deltas vs baseline: signed (`+$1.2M`, `-0.8%`)

When the copilot generates MD&A commentary, each claim must trace to a specific line-item delta; no vibes.

See Appendix B for the full commentary prompt. See §1.5 for the broader 8-pillar context.
