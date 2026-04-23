---
name: event-template-builder
description: Builds new event templates for the scenario engine. Trigger on /event-template-new command or when user says "add an event template".
---

When asked to create an event template, follow Appendix A of HACKATHON-BUILD-OS.md:
1. Template ID (kebab-case, includes type-and-magnitude)
2. Label (human-readable)
3. Timing window (weeks affected)
4. Impact profile (percent or dollar, positive or negative, by channel)
5. Calibration note (source: industry benchmark, customer history, or hand-set)

Output as both TypeScript object (for Track A data file) and JSON (for Track B MCP server).
