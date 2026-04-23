---
description: Run the variance-explainer prompt from Appendix B against a specified cell or scenario.
arguments: [scenario_id] [cell_ref]
---

Pull scenario `$scenario_id` from the current state and the baseline delta for `$cell_ref`. Run the variance-explainer system prompt from Appendix B of `HACKATHON-BUILD-OS.md`. Every claim must trace to a specific line-item delta.

Output as a single MD&A paragraph (board-deck voice, no emojis).
