#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerNumbersTools } from "./tools/numbers.js";
import { registerPagesTools } from "./tools/pages.js";
import { registerKeynoteTools } from "./tools/keynote.js";

const server = new McpServer({
  name: "iwork-mcp",
  version: "0.1.0",
});

registerNumbersTools(server);
registerPagesTools(server);
registerKeynoteTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("iwork-mcp server running");
