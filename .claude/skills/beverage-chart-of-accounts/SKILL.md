---
name: beverage-chart-of-accounts
description: Use when posting journal entries, mapping GL accounts, building the P&L summary, or validating account codes in any beverage context. Triggers on mentions of "CoA", "chart of accounts", "GL", "journal entry", "trade spend accrual", or file paths containing `/coa/`.
---

Hackathon uses a 20-line stub. Full CoA ships with the wholesaler template in Phase 2.

```
4000  Revenue — gross
4100  Revenue — chain programs (contra)
4200  Revenue — CDA (contra)
4300  Revenue — allowance/samples (contra)
5000  COGS — supplier cost (cases)
5100  COGS — inbound freight
5200  COGS — warehouse handling
6000  Opex — warehouse labor
6100  Opex — delivery/routes
6200  Opex — sales reps
6300  Opex — merchandisers
7000  S&M — trade spend (non-contra)
7100  S&M — marketing
8000  G&A — salaries
8100  G&A — IT
8200  G&A — facilities
8300  G&A — insurance
9000  Interest expense
9100  Tax
9900  Net income
```

For breweries, the CoA differs on the COGS side (hops/grain/yeast/cans) — see §1.4 for the delta. The hackathon demo uses the wholesaler CoA above.
