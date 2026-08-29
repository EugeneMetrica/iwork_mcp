import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const defaultConfigDir = join(homedir(), "Library", "Application Support", "Claude");
const defaultConfigPath = join(defaultConfigDir, "claude_desktop_config.json");

const iworkEntry = {
  command: "npx",
  args: ["-y", "iwork-mcp"],
};

/**
 * Install the iwork entry into the Claude Desktop config at configPath.
 * Returns false when the install was aborted — currently only when the
 * existing config is not valid JSON: the live file is never overwritten,
 * a .backup copy is written instead, and the user must fix the config.
 */
export function installTo(configPath: string): boolean {
  const configDir = dirname(configPath);

  // Ensure the Claude config directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Read existing config or start fresh
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf-8");
    const abort = (reason: string) => {
      const backupPath = `${configPath}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      writeFileSync(backupPath, raw);
      console.error(`Could not install: ${reason} (${configPath})`);
      console.error(`Saved the original to ${backupPath} and aborted — the config file was NOT modified.`);
      console.error("Fix or remove the broken config, then re-run iwork-mcp install.");
      return false;
    };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return abort("the existing config is valid JSON but not an object");
      }
      config = parsed as Record<string, unknown>;
    } catch (err) {
      return abort(`could not parse the existing config: ${(err as Error).message}`);
    }
  }

  // Ensure mcpServers exists
  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    config.mcpServers = {};
  }

  const servers = config.mcpServers as Record<string, unknown>;

  // Check if already installed and valid
  const existing = servers.iwork as Record<string, unknown> | undefined;
  if (existing && existing.command === iworkEntry.command &&
      JSON.stringify(existing.args) === JSON.stringify(iworkEntry.args)) {
    console.log("iwork-mcp is already installed in Claude Desktop.");
    console.log("Restart Claude Desktop (Cmd+Q, reopen) if it's not showing up.");
    return true;
  }

  const wasPresent = !!existing;
  servers.iwork = iworkEntry;

  // Write config
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

  console.log(wasPresent ? "\niwork-mcp config repaired!\n" : "\niwork-mcp installed successfully!\n");
  console.log("Make sure Numbers, Pages, and Keynote are installed (free from the App Store).");
  console.log("Restart Claude Desktop to activate (Cmd+Q, then reopen).");
  console.log("117 tools for Numbers, Pages, and Keynote — ready to go.");
  return true;
}

export function install(): void {
  if (!installTo(defaultConfigPath)) {
    process.exitCode = 1;
  }
}
