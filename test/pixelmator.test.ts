import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createTestServer, type TestContext } from "./helpers/server.js";
import { teardownAppDocuments, TEST_DOC_PREFIX, ARTIFACTS_DIR } from "./helpers/teardown.js";

const execFileAsync = promisify(execFile);

async function isPixelmatorAvailable(): Promise<boolean> {
  try {
    await execFileAsync("/usr/bin/osascript", ["-l", "JavaScript", "-e", 'Application("Pixelmator Pro").name()'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function call(ctx: TestContext, name: string, args: Record<string, unknown> = {}) {
  const result = await ctx.client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = null; }
  return { text, json, isError: result.isError };
}

describe("Pixelmator e2e", async () => {
  const available = await isPixelmatorAvailable();
  let sessionUsable = available;
  let skipReason = available ? "" : "app not available (installed and responsive required)";

  let ctx: TestContext;
  const tracked = new Set<string>();
  const wasRunning = await (async () => {
    try {
      const r = await execFileAsync("/usr/bin/osascript", ["-l", "JavaScript", "-e", 'Application("Pixelmator Pro").running()'], { timeout: 10_000 });
      return r.stdout.trim() === "true";
    } catch { return false; }
  })();
  let srcPng = "";
  let docName = "";

  before(async () => {
    ctx = await createTestServer();
    // A 64×48 red PNG, upscaled from the canonical 1×1 test pixel.
    const dir = mkdtempSync(join(tmpdir(), "iwork-mcp-test-px-"));
    srcPng = join(dir, "red.png");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64",
    );
    writeFileSync(srcPng, png);
    const { execFile: ef } = await import("node:child_process");
    await promisify(ef)("sips", ["-z", "48", "64", srcPng, "--out", srcPng]);
    // Canary: opening a document needs a window-capable session. With the
    // screen locked the Apple event queue jams and open never returns — skip
    // the suite instead of burning 60 s per test.
    const attempt = call(ctx, "pixelmator_open_image", { filePath: srcPng });
    attempt.catch(() => { }); // the race loser must never become an unhandled rejection
    const outcome = await Promise.race([
      attempt.then(r => ({ kind: "result" as const, r })),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 45_000)),
    ]);
    if (outcome === "timeout") {
      sessionUsable = false;
      skipReason = "open canary timed out — is the macOS session locked?";
    } else if (outcome.r.isError) {
      sessionUsable = false;
      skipReason = `open canary errored: ${outcome.r.text.slice(0, 120)}`;
    } else {
      const json = outcome.r.json as { name: string } | null;
      docName = json?.name ?? "";
      if (docName) tracked.add(docName);
    }
  });

  const skipIf = (t: { skip: (v: string) => void }): boolean => {
    if (!sessionUsable) {
      t.skip(skipReason);
      return true;
    }
    return false;
  };

  after(async () => {
    if (ctx) {
      await teardownAppDocuments({ client: ctx.client, app: "Pixelmator", tracked, wasRunning });
      await ctx.cleanup();
    }
  });

  it("opens a disposable copy and never touches the original", async (t) => {
    if (skipIf(t)) return;
    const { json, isError } = await call(ctx, "pixelmator_open_image", { filePath: srcPng }) as { json: { name: string; width: number; height: number; copyPath: string }; isError: boolean };
    assert.ok(!isError, `open failed: ${JSON.stringify(json)}`);
    docName = json.name;
    tracked.add(docName);
    assert.ok(json.width > 0 && json.height > 0);
    assert.notEqual(json.copyPath, srcPng, "must open a copy, not the original");
    assert.ok(existsSync(srcPng), "original file must survive");
  });

  it("inspects the document", async (t) => {
    if (skipIf(t)) return;
    const { json, isError } = await call(ctx, "pixelmator_get_document_info", { documentName: docName });
    assert.ok(!isError);
    const info = json as { name: string; width: number; height: number };
    assert.ok(info.width > 0 && info.height > 0);
  });

  it("selects a rect and recolors to #FF0000 with a measured sample", async (t) => {
    if (skipIf(t)) return;
    await call(ctx, "pixelmator_select", { documentName: docName, mode: "rect", bounds: { x: 0, y: 0, width: 16, height: 16 } });
    const { json, isError } = await call(ctx, "pixelmator_recolor", { documentName: docName, color: "#FF0000", mode: "fill" }) as { json: { measured: { hex: string; distance: number; metric: string } }; isError: boolean };
    assert.ok(!isError, `recolor failed: ${JSON.stringify(json)}`);
    assert.equal(json.measured.metric, "deltaE2000");
    assert.ok(json.measured.distance < 10, `measured colour should be close to target, got ${json.measured.distance}`);
  });

  it("refuses whole-layer fill without selection and without wholeLayer", async (t) => {
    if (skipIf(t)) return;
    await call(ctx, "pixelmator_select", { documentName: docName, mode: "none" });
    const { isError } = await call(ctx, "pixelmator_recolor", { documentName: docName, color: "#00FF00", mode: "fill" });
    assert.equal(isError, true, "fill without selection must be refused");
  });

  it("crops the canvas", async (t) => {
    if (skipIf(t)) return;
    const { isError } = await call(ctx, "pixelmator_crop_canvas", { documentName: docName, bounds: { x: 0, y: 0, width: 32, height: 24 } });
    assert.ok(!isError);
  });

  it("adds, duplicates and deletes layers", async (t) => {
    if (skipIf(t)) return;
    const add = await call(ctx, "pixelmator_add_image_layer", { documentName: docName, filePath: srcPng }) as { json: { layer: string }; isError: boolean };
    assert.ok(!add.isError, `add layer failed: ${add.text.slice(0, 120)}`);
    assert.ok(add.json.layer, "added layer must be reported by name");

    const dup = await call(ctx, "pixelmator_duplicate_layer", { documentName: docName }) as { json: { newLayer: string }; isError: boolean };
    assert.ok(!dup.isError, `duplicate failed: ${dup.text.slice(0, 120)}`);
    assert.ok(dup.json.newLayer, "duplicated layer must be reported by name");

    const del = await call(ctx, "pixelmator_delete_layer", { documentName: docName, layerNumber: 1 });
    assert.ok(!del.isError);
  });

  it("runs one ML auto operation", async (t) => {
    if (skipIf(t)) return;
    const { isError } = await call(ctx, "pixelmator_enhance", { documentName: docName });
    assert.ok(!isError, "enhance should succeed on an open document");
  });

  it("exports a PNG artifact", async (t) => {
    if (skipIf(t)) return;
    const out = join(ARTIFACTS_DIR, `${TEST_DOC_PREFIX}pixelmator-export.png`);
    const { isError } = await call(ctx, "pixelmator_export_image", { documentName: docName, filePath: out, format: "png" });
    assert.ok(!isError);
    assert.ok(existsSync(out), `expected export at ${out}`);
  });

  it("rejects .pxd saves into /tmp before touching the app", async (t) => {
    if (skipIf(t)) return;
    const { isError, text } = await call(ctx, "pixelmator_save_as", { documentName: docName, filePath: "/tmp/iwork-mcp-test-bad.pxd", format: "pxd" });
    assert.equal(isError, true);
    assert.ok(text.includes("sandbox") || text.includes("/tmp"), `unexpected error: ${text.slice(0, 120)}`);
  });
});
