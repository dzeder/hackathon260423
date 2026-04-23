---
description: Apply a §14 scope cut rule and log it.
arguments: [rule_number] [reason]
---

1. Read §14 rule `$rule_number`
2. Identify all files/features affected
3. Comment out or delete affected code with a `// SCOPE-CUT §14.$rule_number` marker
4. Append to `DECISION_LOG.md`: `HH:MM — Scope cut §14.$rule_number applied. Reason: $reason.`
5. Post to `#axe-a-thon` via Slack hook
6. Update §15 demo script to remove the cut feature's narration line
