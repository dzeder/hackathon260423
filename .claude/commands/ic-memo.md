---
description: Generate a board-deck MD&A paragraph from the current scenario. Inherited from `anthropics/financial-services-plugins:commentary-generator`.
arguments: [scenario_id]
---

Compose a 120–180 word MD&A paragraph that covers:

1. Headline ($ and % change in revenue + GM%)
2. Top 2 drivers (event + magnitude, cite line items)
3. Risk flag (allocation, cash, chain program) if present
4. Confidence statement (high / medium / low, cite whether calibrated to customer history or industry default)

Voice: CFO talking to a board. No emojis. No adjectives. Numbers, not adverbs.
