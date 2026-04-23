---
name: mcp-server-builder
description: Scaffolds MCP servers using modelcontextprotocol/sdk TypeScript. Trigger when user says "new MCP server" or "add a tool to <server>" or creates files under packages/mcp-servers/.
---

When asked to build or extend an MCP server:
1. Use `@modelcontextprotocol/sdk` and Zod for tool schemas
2. Every tool has: `name`, `description`, `inputSchema` (Zod), handler
3. Tools return structured content, never prose
4. Errors throw `McpError` with specific codes
5. The server exports a default that `main()` calls
6. Reference `references/modelcontextprotocol/servers` for patterns
7. Reference `references/anthropics/financial-services-plugins` for financial tool patterns

Write the server, write a README with tool docs, write a one-page smoke test script.
