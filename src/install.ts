import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const configDir = join(homedir(), "Library", "Application Support", "Claude");
const configPath = join(configDir, "claude_desktop_config.json");

const iworkEntry = {
  command: "npx",
  args: ["-y", "iwork-mcp"],
};

export function install(): void {
  // Ensure the Claude config directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Read existing config or start fresh
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      console.error("Could not parse existing config. Backing up and creating new one.");
      writeFileSync(configPath + ".backup", readFileSync(configPath));
    }
  }

  // Ensure mcpServers exists
  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    config.mcpServers = {};
  }

  const servers = config.mcpServers as Record<string, unknown>;

  // Check if already installed
  if (servers.iwork) {
    console.log("iwork-mcp is already installed in Claude Desktop.");
    console.log("Restart Claude Desktop (Cmd+Q, reopen) if it's not showing up.");
    return;
  }

  // Add iwork entry
  servers.iwork = iworkEntry;

  // Write config
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

  console.log("iwork-mcp installed successfully!");
  console.log("");
  console.log("Restart Claude Desktop to activate (Cmd+Q, then reopen).");
  console.log("You'll get 49 tools for Numbers, Pages, and Keynote.");
}
