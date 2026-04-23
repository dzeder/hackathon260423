---
name: ohfy-data-model
description: Use this skill whenever a task involves Ohanafy's Salesforce data model — queries against ohfy__Order__c, ohfy__Invoice__c, ohfy__Account__c, production or brewery objects, or any mention of "the ohfy package" or "ohanafy managed package". Also use when writing Apex classes with Ohfy prefix or LWC that reads ohanafy data.
---

Ohanafy is a Salesforce-native managed package for the beverage industry.
Namespace: `ohfy__`.

Key objects (partial — see `references/ohanafy/` for full schema):

- `ohfy__Account__c` — brewery/cidery/distillery accounts
- `ohfy__Order__c` — customer orders
- `ohfy__Invoice__c` — AR invoices
- `ohfy__Credit__c` — credits/adjustments
- `ohfy__Production_Run__c` — brew schedule (hypothetical naming)
- `ohfy__Inventory_Lot__c` — raw/finished goods inventory
- `ohfy__Depletion__c` — distributor sellout

Conventions:

- Any `ohfy__` field is read-only; build new fields in our namespace.
- Apex callers use `Ohfy` or `ohfy_` prefix in class names.
- LWCs use kebab-case under `force-app/main/default/lwc/`.
- Do not assume field existence — check metadata via `sf` CLI before writing queries.

For the hackathon: we are NOT modifying the `ohfy` package. Track C builds a new 2GP dependent package that queries `ohfy` objects as if they exist.
