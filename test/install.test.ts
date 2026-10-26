import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { installTo } from "../src/install.js";

function tmpConfig(): string {
  const dir = mkdtempSync(join(tmpdir(), "iwork-install-test-"));
  return join(dir, "claude_desktop_config.json");
}

describe("installTo", () => {
  it("aborts on broken JSON: file byte-identical, backup written, nothing installed", () => {
    const path = tmpConfig();
    const broken = '{ not json';
    writeFileSync(path, broken);

    const ok = installTo(path);

    assert.equal(ok, false, "install must abort on unparseable config");
    assert.equal(readFileSync(path, "utf-8"), broken, "original file must stay byte-identical");
    const backups = readdirSync(dirname(path)).filter(f => f.startsWith("claude_desktop_config.json.backup"));
    assert.ok(backups.length >= 1, "a backup copy must be written");
  });

  it("aborts on valid JSON that is not an object", () => {
    const path = tmpConfig();
    writeFileSync(path, "null");

    const ok = installTo(path);

    assert.equal(ok, false, "null config must abort, not crash or overwrite");
    assert.equal(readFileSync(path, "utf-8"), "null", "original file must stay byte-identical");
  });

  it("merges the iwork entry into a valid config, preserving foreign mcpServers", () => {
    const path = tmpConfig();
    writeFileSync(path, JSON.stringify({
      mcpServers: { other: { command: "foo", args: ["bar"] } },
    }));

    const ok = installTo(path);

    assert.equal(ok, true);
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    assert.equal(parsed.mcpServers.iwork.command, "npx");
    assert.deepEqual(parsed.mcpServers.other, { command: "foo", args: ["bar"] });
  });

  it("is a no-op when the iwork entry is already correct", () => {
    const path = tmpConfig();
    const existing = JSON.stringify({
      mcpServers: {
        iwork: { command: "npx", args: ["-y", "iwork-mcp"] },
        other: { command: "foo" },
      },
    });
    writeFileSync(path, existing);

    const ok = installTo(path);

    assert.equal(ok, true);
    assert.equal(readFileSync(path, "utf-8"), existing, "config must not be rewritten");
  });
});
