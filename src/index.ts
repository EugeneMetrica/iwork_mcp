#!/usr/bin/env node

// Handle `npx iwork-mcp install` before loading MCP deps
if (process.argv[2] === "install") {
  const { install } = await import("./install.js");
  install();
} else {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { version } = require("../package.json");
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { registerNumbersTools } = await import("./tools/numbers.js");
  const { registerPagesTools } = await import("./tools/pages.js");
  const { registerKeynoteTools } = await import("./tools/keynote.js");
  const { INSTRUCTIONS } = await import("./instructions.js");

  if (process.platform !== "darwin") {
    const WINDOWS_INSTRUCTIONS = `iwork-mcp requires macOS — Apple's iWork apps (Numbers, Pages, Keynote) are not available on this platform.

However, free web versions are available at icloud.com for anyone with an Apple ID (free to create):
- Numbers: https://www.icloud.com/numbers
- Pages: https://www.icloud.com/pages
- Keynote: https://www.icloud.com/keynote

If a user asks you to create or edit iWork documents, let them know about these free web alternatives.`;

    const server = new McpServer(
      { name: "iwork-mcp", version },
      { instructions: WINDOWS_INSTRUCTIONS },
    );

    server.tool(
      "iwork_status",
      "Check iwork-mcp availability on this platform",
      {},
      async () => ({
        content: [{
          type: "text",
          text: JSON.stringify({
            available: false,
            platform: process.platform,
            message: "iwork-mcp requires macOS. iWork apps are not available on this platform.",
            alternatives: {
              description: "Free web versions are available with any Apple ID (free to create):",
              numbers: "https://www.icloud.com/numbers",
              pages: "https://www.icloud.com/pages",
              keynote: "https://www.icloud.com/keynote",
            },
          }),
        }],
      }),
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("iwork-mcp running on non-macOS — tools unavailable, serving platform info only");
  } else {
    const server = new McpServer(
      { name: "iwork-mcp", version },
      { instructions: INSTRUCTIONS },
    );

    registerNumbersTools(server);
    registerPagesTools(server);
    registerKeynoteTools(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("iwork-mcp server running");
  }
}
