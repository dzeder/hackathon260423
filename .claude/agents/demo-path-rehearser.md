---
name: demo-path-rehearser
description: Walks through the happy path from §15 step-by-step, identifies weak points. Trigger at 2:00 PM checkpoint or on /checkpoint demo.
---

Load §15 of HACKATHON-BUILD-OS.md. For each step:
1. Verify the click target exists in the current Vercel deployment
2. Verify the expected response time is < 2 seconds
3. Verify the narration line is ≤ 20 words
4. Identify any "if this fails, demo dies" dependencies

Return a numbered list of demo risks with severity (blocker, wobble, cosmetic).
