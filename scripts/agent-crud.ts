/**
 * Independent-agent CRUD harness against the in-process MCP server.
 * Prefixes every document with iwork-mcp-test-. Never close-all.
 *
 * Usage: bun scripts/agent-crud.ts
 */
import { mkdtempSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createTestServer } from "../test/helpers/server.ts";
import { teardownAppDocuments, TEST_DOC_PREFIX, ARTIFACTS_DIR } from "../test/helpers/teardown.ts";

const execFileAsync = promisify(execFile);

type Row = { app: string; op: string; ok: boolean; detail: string };

const rows: Row[] = [];
const log = (app: string, op: string, ok: boolean, detail: string) => {
  rows.push({ app, op, ok, detail });
  console.log(JSON.stringify({ app, op, ok, detail }));
};

async function call(
  client: { callTool: (a: { name: string; arguments: Record<string, unknown> }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> },
  name: string,
  args: Record<string, unknown> = {},
) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content[0]?.text ?? "";
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* raw */ }
  return { text, json, isError: Boolean(result.isError) };
}

async function main() {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const ctx = await createTestServer();
  const numbersTracked = new Set<string>();
  const pagesTracked = new Set<string>();
  const keynoteTracked = new Set<string>();
  const pixelTracked = new Set<string>();
  let numbersWas = false;
  let pagesWas = false;
  let keynoteWas = false;
  let pixelWas = false;
  try {
    try {
      const r = await execFileAsync("/usr/bin/osascript", ["-l", "JavaScript", "-e", 'Application("Numbers").running()'], { timeout: 10_000 });
      numbersWas = r.stdout.trim() === "true";
    } catch { /* */ }
    try {
      const r = await execFileAsync("/usr/bin/osascript", ["-l", "JavaScript", "-e", 'Application("Pages").running()'], { timeout: 10_000 });
      pagesWas = r.stdout.trim() === "true";
    } catch { /* */ }
    try {
      const r = await execFileAsync("/usr/bin/osascript", ["-l", "JavaScript", "-e", 'Application("Keynote").running()'], { timeout: 10_000 });
      keynoteWas = r.stdout.trim() === "true";
    } catch { /* */ }
    try {
      const r = await execFileAsync("/usr/bin/osascript", ["-l", "JavaScript", "-e", 'Application("Pixelmator Pro").running()'], { timeout: 10_000 });
      pixelWas = r.stdout.trim() === "true";
    } catch { /* */ }

    // Numbers
    {
      const created = await call(ctx.client, "numbers_create_document", {});
      const n = (created.json as { name?: string } | null)?.name ?? "";
      if (n) numbersTracked.add(n);
      log("numbers", "create", !created.isError && n.length > 0, n || created.text.slice(0, 120));
      const write = await call(ctx.client, "numbers_write_cell", { documentName: n, cellRef: "A1", value: 42 });
      log("numbers", "update", !write.isError, write.text.slice(0, 80));
      const read = await call(ctx.client, "numbers_read_cell", { documentName: n, cellRef: "A1" });
      const val = (read.json as { value?: unknown } | null)?.value;
      log("numbers", "read", !read.isError && Number(val) === 42, String(val));
      const sheet = await call(ctx.client, "numbers_add_sheet", { documentName: n, sheetName: "Extra" });
      log("numbers", "update-sheet", !sheet.isError, sheet.text.slice(0, 80));
      const close = await call(ctx.client, "numbers_close_document", { documentName: n, saving: "no" });
      log("numbers", "delete", !close.isError, close.text.slice(0, 80));
    }

    // Pages
    {
      const created = await call(ctx.client, "pages_create_document_with_content", {
        paragraphs: [{ text: `${TEST_DOC_PREFIX}g43-p body`, fontSize: 14 }],
      });
      const n = (created.json as { name?: string } | null)?.name ?? "";
      if (n) pagesTracked.add(n);
      log("pages", "create", !created.isError && n.length > 0, n || created.text.slice(0, 120));
      const body = await call(ctx.client, "pages_get_body_text", { documentName: n });
      const text = (body.json as { text?: string } | null)?.text ?? "";
      log("pages", "read", !body.isError && text.includes("g43-p body"), text.slice(0, 80));
      const replace = await call(ctx.client, "pages_replace_text", { documentName: n, find: "body", replace: "BODY" });
      log("pages", "update", !replace.isError, replace.text.slice(0, 80));
      const close = await call(ctx.client, "pages_close_document", { documentName: n, saving: "no" });
      log("pages", "delete", !close.isError, close.text.slice(0, 80));
    }

    // Keynote
    {
      const created = await call(ctx.client, "keynote_create_presentation", {});
      const n = (created.json as { name?: string } | null)?.name ?? "";
      if (n) keynoteTracked.add(n);
      log("keynote", "create", !created.isError && n.length > 0, n || created.text.slice(0, 120));
      const add = await call(ctx.client, "keynote_add_slide", { documentName: n });
      log("keynote", "create-slide", !add.isError, add.text.slice(0, 80));
      const title = await call(ctx.client, "keynote_set_slide_title", { documentName: n, slideNumber: 1, title: `${TEST_DOC_PREFIX}g43-k` });
      log("keynote", "update", !title.isError, title.text.slice(0, 80));
      const content = await call(ctx.client, "keynote_get_slide_content", { documentName: n, slideNumber: 1 });
      log("keynote", "read", !content.isError, content.text.slice(0, 80));
      const del = await call(ctx.client, "keynote_delete_slide", { documentName: n, slideNumber: 2 });
      log("keynote", "delete-slide", !del.isError, del.text.slice(0, 80));
      const close = await call(ctx.client, "keynote_close_presentation", { documentName: n, saving: "no" });
      log("keynote", "delete", !close.isError, close.text.slice(0, 80));
    }

    // Pixelmator
    {
      const dir = mkdtempSync(join(tmpdir(), "iwork-mcp-test-g43-"));
      const srcPng = join(dir, "red.png");
      writeFileSync(srcPng, Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
        "base64",
      ));
      const openP = call(ctx.client, "pixelmator_open_image", { filePath: srcPng });
      openP.catch(() => { /* race loser */ });
      const outcome = await Promise.race([
        openP.then((r) => ({ kind: "result" as const, r })),
        new Promise<{ kind: "timeout" }>((resolve) => setTimeout(() => resolve({ kind: "timeout" }), 45_000)),
      ]);
      if (outcome.kind === "timeout") {
        log("pixelmator", "create", false, "SKIP: open canary timed out (locked session?)");
      } else {
        const n = (outcome.r.json as { name?: string } | null)?.name ?? "";
        if (n) pixelTracked.add(n);
        log("pixelmator", "create", !outcome.r.isError && n.length > 0, n || outcome.r.text.slice(0, 120));
        if (!outcome.r.isError && n) {
          const info = await call(ctx.client, "pixelmator_get_document_info", { documentName: n });
          log("pixelmator", "read", !info.isError, info.text.slice(0, 80));
          const out = join(ARTIFACTS_DIR, `${TEST_DOC_PREFIX}g43.png`);
          const exp = await call(ctx.client, "pixelmator_export_image", { documentName: n, filePath: out, format: "png" });
          log("pixelmator", "export", !exp.isError && existsSync(out), out);
          const close = await call(ctx.client, "pixelmator_close_document", { documentName: n, saving: "no" });
          log("pixelmator", "delete", !close.isError, close.text.slice(0, 80));
        }
      }
    }
  } finally {
    await teardownAppDocuments({ client: ctx.client, app: "Numbers", tracked: numbersTracked, wasRunning: numbersWas });
    await teardownAppDocuments({ client: ctx.client, app: "Pages", tracked: pagesTracked, wasRunning: pagesWas });
    await teardownAppDocuments({ client: ctx.client, app: "Keynote", tracked: keynoteTracked, wasRunning: keynoteWas });
    await teardownAppDocuments({ client: ctx.client, app: "Pixelmator", tracked: pixelTracked, wasRunning: pixelWas });
    await ctx.cleanup();
  }

  const failed = rows.filter((r) => !r.ok && !r.detail.startsWith("SKIP"));
  const skipped = rows.filter((r) => r.detail.startsWith("SKIP"));
  console.error(`summary: ${rows.filter((r) => r.ok).length} ok, ${failed.length} fail, ${skipped.length} skip`);
  if (failed.length) process.exit(1);
}

await main();
