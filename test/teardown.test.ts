import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createTestServer, type TestContext } from "./helpers/server.js";
import { isAppAvailable } from "./helpers/app-check.js";
import { teardownAppDocuments, TEST_DOC_PREFIX, ARTIFACTS_DIR } from "./helpers/teardown.js";

async function call(ctx: TestContext, name: string, args: Record<string, unknown> = {}) {
  const result = await ctx.client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = null; }
  return { text, json, isError: result.isError };
}

describe("Teardown isolation", async () => {
  const available = await isAppAvailable("Numbers");
  if (!available) {
    console.log("⏭  Skipping teardown isolation — Numbers not available");
    return;
  }

  let ctx: TestContext;
  const tracked = new Set<string>();
  let testDoc = "";
  let foreignDoc = "";

  before(async () => {
    ctx = await createTestServer();
  });

  after(async () => {
    if (ctx) {
      // The foreign document is this test's own artifact — close it directly.
      if (foreignDoc) {
        try { await call(ctx, "numbers_close_document", { documentName: foreignDoc, saving: "no" }); } catch {}
      }
      await ctx.cleanup();
    }
  });

  it("closes tracked documents, exports them, and leaves foreign documents open", async () => {
    const { json: created } = await call(ctx, "numbers_create_document") as { json: { name: string } };
    testDoc = created.name;
    tracked.add(testDoc);

    // A document the "user" had open: NOT tracked, no test prefix.
    const { json: foreign } = await call(ctx, "numbers_create_document") as { json: { name: string } };
    foreignDoc = foreign.name;

    await teardownAppDocuments({ client: ctx.client, app: "Numbers", tracked, wasRunning: true });

    const docs = await call(ctx, "numbers_list_documents") as { json: Array<{ name: string }> };
    const names = docs.json.map(d => d.name);
    assert.ok(!names.includes(testDoc), `tracked doc "${testDoc}" must be closed`);
    assert.ok(names.includes(foreignDoc), `foreign doc "${foreignDoc}" must survive teardown`);
  });

  it("does not close untracked documents without the test prefix", () => {
    assert.ok(!foreignDoc.startsWith(TEST_DOC_PREFIX));
  });

  it("exported the tracked document to Microsoft format before closing", () => {
    const artifact = join(ARTIFACTS_DIR, testDoc.replace(/[\\/:]/g, "-") + ".xlsx");
    assert.ok(existsSync(artifact), `expected artifact at ${artifact}`);
  });
});
