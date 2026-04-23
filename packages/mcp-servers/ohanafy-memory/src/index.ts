import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, SERVER_INFO } from "./server.js";

export { SERVER_INFO };
export { TOOL_REGISTRY } from "./tools.js";
export * from "./logic.js";
export { MemoryStore, sharedStore } from "./store.js";

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
