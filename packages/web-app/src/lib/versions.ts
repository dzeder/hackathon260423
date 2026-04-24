/**
 * Canonical version constants for the Ohanafy Plan agent. Every call to
 * /api/copilot stamps these onto the response and the Plan_Agent_Log__c
 * row so we can correlate an answer back to the prompt and tool-schema
 * generation that produced it.
 *
 * Bump rules:
 *  - PROMPT_VERSION: bump on any change to the system prompt in
 *    copilotLive.ts or to the scenario-context builder.
 *  - TOOL_SCHEMA_VERSION: bump on any change to the MCP tool input shapes
 *    (customerId, new tool, renamed field, etc.). Keep in lockstep with
 *    ToolCallTrace.SCHEMA_VERSION when they change together.
 *
 * Versions use semver-ish strings (major.minor.patch). Storage uses a
 * 32-char text field, so stay well under that.
 */

export const PROMPT_VERSION = "prompt@1.0.0" as const;
export const TOOL_SCHEMA_VERSION = "tools@1.0.0" as const;

export type PromptVersion = typeof PROMPT_VERSION;
export type ToolSchemaVersion = typeof TOOL_SCHEMA_VERSION;
