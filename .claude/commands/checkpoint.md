---
description: Run the mid-day checkpoint for the current time window.
arguments: [time] (one of: 12:00, 2:00, 3:30)
---

Run the §13 checkpoint for the specified time. Pull current state from:

- `git log --since="2 hours ago"` (progress)
- `BLOCKERS.md` (open blockers)
- `DECISION_LOG.md` (recent decisions)
- Vercel deployment URL (live demo state)

Answer every question in §13 for the specified time. Post the output to `#axe-a-thon` via the Slack hook. Tag `@captain` for explicit ack.
