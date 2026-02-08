#!/usr/bin/env node

// Handle `npx iwork-mcp install` before loading MCP deps
if (process.argv[2] === "install") {
  const { install } = await import("./install.js");
  install();
} else {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { registerNumbersTools } = await import("./tools/numbers.js");
  const { registerPagesTools } = await import("./tools/pages.js");
  const { registerKeynoteTools } = await import("./tools/keynote.js");

  const server = new McpServer({
    name: "iwork-mcp",
    version: "0.5.0",
  });

  registerNumbersTools(server);
  registerPagesTools(server);
  registerKeynoteTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("iwork-mcp server running");
}
