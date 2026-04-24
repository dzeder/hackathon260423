# Budget Forecasting Agent — Architecture & Goals

## What we're building

A Salesforce-native AI agent that lets a budget analyst at a Gulf-Coast beverage wholesaler (Gulf Distributing: FL panhandle, southern AL, coastal MS) ask natural-language "what if" questions and get back a **quantified dollar-and-margin answer** grounded in their actual baseline data — not a generic LLM guess.

Example questions the agent is expected to answer:

- *"What happens if Alabama football has two extra home games?"*
- *"What if a Cat 2 hurricane hits Pensacola over Labor Day weekend?"*
- *"What's better for our 2027 budget — cannabis beverages or more Molson Coors SKUs?"*
- *"What if we lose Anheuser-Busch exclusivity in Q4?"*
- *"Should we run a 15% promo in July or wait until Memorial Day?"*

Every answer should lead with a headline dollar delta (e.g. `+$1.11M revenue, +$270K margin`) produced by running the scenario against the actual baseline data — never hand-waved.

## Where it lives

Everything is deployed to a Salesforce scratch org and exposed as a Lightning Web Component chat widget (`forecastingAgentChat`) that drops into any record page or app page. The LWC talks to an Apex controller, which drives a multi-stage agent pipeline that calls the Anthropic Messages API.

| Layer | File / path |
|---|---|
| Chat UI | `force-app/main/default/lwc/forecastingAgentChat/` |
| Controller (AuraEnabled entry point) | `classes/controllers/ForecastingAgentController.cls` |
| Main agent orchestration | `classes/services/ForecastingAgentService.cls` |
| Critic sub-agent | `classes/services/ResponseCritic.cls` |
| Anthropic HTTP client | `classes/services/AnthropicClient.cls` |
| Tool registry + implementations | `classes/services/ToolRegistry.cls`, `classes/services/tools/*` |
| Knowledge search tool | `classes/services/tools/KnowledgeSearchTool.cls` |
| Cross-conversation recall | `classes/services/ConversationRecall.cls` |
| Conversation persistence | `classes/services/ConversationStore.cls` |
| Per-session tool cache | uses Salesforce Platform Cache via `CacheHelper` |
| Seed data (knowledge base) | `scripts/apex/seedKnowledge.apex` |

## Current architecture

```
┌─────────────────────────────────────────────────────────────┐
│  LWC (forecastingAgentChat)                                 │
│  - Persists conversationId across reloads                   │
│  - Awaits history load before allowing send (race-safe)     │
│  - Shows tool trace + scenario-vs-baseline modal            │
└──────────────────────────┬──────────────────────────────────┘
                           │ @AuraEnabled sendMessage()
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  ForecastingAgentController                                 │
│  - Loads / creates Forecasting_Conversation__c              │
│  - Persists every user + assistant turn                     │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  ForecastingAgentService.run()  (2-stage pipeline)          │
│                                                             │
│  Stage 1 — MAIN LOOP (ReAct, up to 5 iterations)            │
│    ├─ System prompt: role + core principles + flows         │
│    ├─ Tools: ~55 (baseline, scenario, weather, FRED,        │
│    │          BLS, NHC, SEC schedule, knowledge, etc.)      │
│    ├─ Per-session tool cache (baseline, weather, knowledge) │
│    └─ ConversationRecall prepended to system prompt         │
│                                                             │
│  Stage 2 — CRITIC SUB-AGENT                                 │
│    ├─ Reads {question, response, tool trace}                │
│    ├─ Checks: quantified? both sides of comparison?         │
│    │          refusal phrases? unfamiliar categories        │
│    │          modeled? assumptions stated?                  │
│    └─ Outputs PASS or REVISE+instruction (strict JSON)      │
│                                                             │
│  If REVISE → append instruction as user msg, re-run         │
│  Stage 1 once more, keep the revised response               │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
                    final response → UI
```

## The journey — what problems drove each piece

### 1. Conversation history
**Problem**: Turn 2 lost Turn 1's context. The agent got "does it matter if those two games are in August vs January?" with no memory of the Alabama football scenario we just ran.

**Fix**: (a) Persisted conversations/messages to `Forecasting_Conversation__c` + `Forecasting_Message__c`. (b) Fixed a race condition in the LWC where `loadHistory()` was async but the composer was enabled immediately — user could send Turn 2 before the prior messages had loaded, so the controller got `conversationId=null` and started a fresh thread. Now the composer is disabled until `historyLoaded === true`.

### 2. RAG over prior conversations
**Problem**: The agent had no memory beyond the current thread. Useful patterns from prior analyses were lost.

**Fix**: `ConversationRecall` queries recent user/assistant message pairs for the same user across conversations, formats them as bullets, and prepends to the system prompt. Budget-capped at 5 pairs.

### 3. Tool result caching
**Problem**: Repeated calls to `queryBaseline`, weather, FRED, etc. within a conversation wasted tokens and latency.

**Fix**: `ForecastingAgentService.dispatchToolUses` checks a 30-min Platform Cache entry before invoking any cacheable tool. Cache key is `tr_<conversationId12>_<sha256(toolName+input)>`. Cached calls are tagged `[cached]` in the trace.

### 4. Internal knowledge base
**Problem**: The model was guessing at domain-specific numbers (hurricane demand lift, SEC football weekend effect, supplier share). Wrong priors → wrong answers.

**Fix**: New `Forecasting_Knowledge__c` object + `searchKnowledge` tool. Seeded with 9 entries so far (hurricane playbook, Memorial Day, AB supplier risk, heat wave, new SKU ramp, Mardi Gras, SEC football, hemp-THC category, Molson Coors expansion patterns). The system prompt tells the agent to call `searchKnowledge` EARLY for any question that smells like a known pattern, before quantifying.

### 5. The agent ignored its own rules
**Problem (the one that motivated the critic)**: Even after the system prompt grew to explicitly say *"never refuse a scenario"* and *"always run both sides of a comparison"*, the model kept:
- Asking "Are you referring to..." when context was unambiguous
- Saying "would you like me to model..." instead of just modeling
- Treating unfamiliar categories (hemp-THC beverages) as "outside my charter" even after being taught they are in-scope
- Giving hand-wave answers ("2-3x the case velocity") on follow-ups instead of re-running `applyScenario`

A longer system prompt didn't fix this — it has diminishing returns. The model half-follows whatever rule you add.

**Fix**: `ResponseCritic` sub-agent runs after the main loop. It reads `(question, response, tool trace)` and is instructed to be strict: bias toward REVISE when in doubt. If it sees a refusal phrase, a one-sided comparison, or an unquantified answer, it emits a concrete revision instruction ("Call applyScenario for the THC scenario with ASP=$32, margin=45%..."), which gets appended to the conversation and re-runs the main loop once. Critic appears in the tool trace as `responseCritic` so the behavior is observable.

This is the key architectural insight: **quality rules get enforced by a separate agent, not by more text in the main prompt**. The main agent's prompt stays focused on "what to do"; the critic handles "did you actually do it?"

## What "good" looks like

A good answer on a comparison question like *"cannabis beverages vs more Molson Coors for 2027?"* should:

1. Call `queryBaseline` (or use cached baseline)
2. Call `searchKnowledge` for both categories (THC beverage playbook + Molson Coors expansion patterns)
3. Call `applyScenario` twice — once for each option, with stated assumptions
4. Lead the response with: `Option A: +$X · Option B: +$Y · Gap: $Z (winner: ___)`
5. Follow with 3–6 sentences explaining the drivers
6. Cite the knowledge entries used
7. State the modeling assumptions (ASP, margin, ramp, # SKUs)

And never, under any circumstance, say "would you like me to model..." or "separate conversation" or "outside my charter."

## Open items / possible future work

- **Skills routing**: split the system prompt into per-domain skill files (`weather.md`, `supplier-risk.md`, `thc-launch.md`) and have a cheap first-pass classify the question and load only the relevant 1–2 skills. Keeps the working prompt short.
- **Structured planner**: replace freeform ReAct with a cheap planner (Haiku) that emits `[{tool, params}, ...]` for an executor to run. Cheaper, more deterministic, but loses the model's ability to react to intermediate tool results.
- **Critic on a cheaper model**: currently the critic runs on the same Sonnet as the main loop. Moving it to Haiku would cut critic cost ~3x with probably no quality loss for a pattern-matching task.
- **Tool forcing**: code-level constraint that detects comparison keywords (`vs`, `or`, `better`, `compare`) in the user question and refuses to terminate the main loop until at least 2 `applyScenario` calls are present. Belt-and-suspenders with the critic.
- **Test coverage**: test classes exist but the critic pass isn't yet covered — add fixtures that feed in a known-bad response and assert the critic returns REVISE with the right instruction.
- **Cost observability**: extend `Forecasting_Agent_Log__c` to record the critic's verdict per request so we can see over time how often REVISE fires (and for which failure modes).

## Cost and latency today

- Typical first turn (no cache): ~15-25K input tokens, ~500-1000 output tokens, 8-12 seconds end-to-end, ~$0.05-0.10 per question.
- With critic + revision (when REVISE fires): roughly doubles above numbers. Cost cap is $0.50/request.
- Cached follow-up turn: ~6-10K input tokens, 2-4 seconds, ~$0.02.
