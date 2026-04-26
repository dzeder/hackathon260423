import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { TOOL_REGISTRY, type ToolName } from "./tools.js";
import { traceTool } from "./tracing.js";

export const SERVER_INFO = {
  name: "ohanafy-plan-mcp-network",
  version: "0.1.0",
};

export function createServer(): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.entries(TOOL_REGISTRY).map(([name, def]) => ({
      name,
      description: def.description,
      inputSchema: zodToJsonSchema(def.input, { target: "jsonSchema7" }),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name as ToolName;
    const def = TOOL_REGISTRY[name];
    if (!def) {
      throw new Error(`Unknown tool: ${name}`);
    }
    const handler = def.handler as (raw: unknown) => Promise<unknown>;
    const result = await traceTool(name, req.params.arguments, () =>
      handler(req.params.arguments),
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  });

  return server;
}
