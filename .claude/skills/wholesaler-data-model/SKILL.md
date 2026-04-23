---
name: wholesaler-data-model
description: Use when building, validating, or generating data for Ohanafy Plan's wholesaler pilot. Triggers on mentions of "wholesaler", "distributor", "supplier allocation", "chain program", "depletion", "route", "Red Bull", "Yellowhammer Beverage", or any file under /seed/wholesaler/. Also triggers whenever someone is about to write brewery-specific terms (tanks, fermenters, brew schedule) in wholesaler code.
---

Pilot customer: Yellowhammer Beverage, Birmingham AL. Beer + Red Bull wholesaler.

Wholesalers do NOT brew. Their data model differs from a brewery:

- **Supplier allocations** (not production runs) — monthly or quarterly SKU allocation granted by a supplier (Anheuser-Busch, Constellation, Molson Coors, Red Bull NA, craft breweries). Wholesalers can only sell what's allocated.
- **Depletions** (retail sellout reported back from retailers) drive the next period's allocation request. This is THE metric wholesalers live by.
- **Routes** — trucks leaving the warehouse to serve a geographic cluster of accounts 2-5 days/week. Capacity is measured in cases and stops.
- **Pick-pack throughput** — cases picked per hour in the warehouse. A real constraint at peak weeks.
- **Chain programs** — feature/display/scan/OI (off-invoice) deals negotiated quarterly between supplier/wholesaler/retailer. Drive volume and margin.
- **CDA** (Customer Development Agreement) — cash spend to grow an account; tracked program by program with ROI.

Volume units:

- Beer: cases (24 × 12oz or 4 × 6pk standard) and bbl where applicable
- Red Bull: cases (24 × 8.4oz, 24 × 12oz, 24 × 16oz, 12 × 20oz taurus, plus sugarfree SKUs)

Revenue model:

- Gross revenue = STW cases × net price per case
- Net revenue = gross − CDAs − chain program spend − allowance/samples
- COGS = cost per case from supplier + inbound freight + warehouse handling
- Gross margin typically 25–35% for beer wholesalers; Red Bull runs higher

Channels:

- Chain off-premise (Publix, Kroger, Walmart, Target, Dollar General, convenience chains)
- Independent off-premise (package stores, bodegas, one-offs)
- Chain on-premise (Applebee's, Chili's, Buffalo Wild Wings franchises)
- Independent on-premise (bars, restaurants, stadiums)
- Convenience (c-stores — BIG for Red Bull specifically)

Common SKU suppliers for Alabama wholesalers:

- Anheuser-Busch (Bud Light, Michelob Ultra, Busch Light, Natty Light)
- Constellation (Modelo, Corona)
- Molson Coors (Coors Light, Miller Lite)
- Red Bull North America (all Red Bull SKUs — often the highest-margin line)
- Craft/regional (Yuengling, Sweetwater, Good People, Trim Tab, Birmingham/Huntsville craft)

Never confuse these with the brewery model. See §18 for full glossary.
