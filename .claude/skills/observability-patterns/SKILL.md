---
name: observability-patterns
description: Use when instrumenting code for Datadog, writing structured logs, wrapping external calls in traces, or adding error boundaries. Triggers on imports of dd-trace, on console.log/error calls that should become structured logs, on any new API route or MCP tool handler, on any new external API client.
---

Three layers:

1. **Traces (dd-trace)** — every external call, every API route, every MCP tool handler

   ```ts
   import tracer from 'dd-trace';
   tracer.init({ service: 'ohanafy-plan-webapp', env: process.env.DD_ENV });

   // wrap every external call:
   await tracer.trace('anthropic.messages.create', async () => {
     return await anthropic.messages.create({ /* ... */ });
   });
   ```

2. **Structured logs** (pino or bunyan; NEVER plain `console.log` in production code paths)

   ```ts
   logger.info({
     service: 'ohanafy-plan-webapp',
     customer_id_hash: hashCustomerId(customerId),   // NEVER raw customer id
     track: 'a',
     event_type: 'suggestion_surfaced',
     suggestion_id: 'upcoming-rivalry-week',
     confidence: 'medium',
     trace_id: tracer.scope().active()?.context().toTraceId(),
   }, 'Proactive suggestion surfaced');
   ```

3. **Custom metrics** (Datadog metrics API)
   - `ohanafy_plan.suggestions.surfaced` (count, tags: `customer_id_hash`, `suggestion_id`, `confidence`)
   - `ohanafy_plan.feedback.captured` (count, tags: `customer_id_hash`, `verdict`, `action_type`)
   - `ohanafy_plan.mcp.tool_call` (count, tags: `server`, `tool`, `outcome`)
   - `ohanafy_plan.mcp.tool_duration_ms` (histogram, tags: `server`, `tool`)

PII rules (absolute):

- NEVER log raw customer names, email addresses, API keys, auth tokens
- ALWAYS hash `customer_id` before logging or tagging
- Configure pino redaction for sensitive keys by default

Service naming (exact strings, don't vary):

- `ohanafy-plan-webapp` — Next.js app + API routes
- `ohanafy-plan-mcp-forecast`
- `ohanafy-plan-mcp-events`
- `ohanafy-plan-mcp-memory`
- `ohanafy-plan-mcp-network`
- `ohanafy-plan-lwc` — the LWC itself (via custom log forwarder)

See Appendix F.3 for the full dashboard spec.
