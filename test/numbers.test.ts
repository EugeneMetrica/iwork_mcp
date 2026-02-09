import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTestServer, type TestContext } from "./helpers/server.js";
import { isAppAvailable } from "./helpers/app-check.js";

/** Helper: call a tool and return parsed text content. */
async function call(ctx: TestContext, name: string, args: Record<string, unknown> = {}) {
  const result = await ctx.client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  return { text, json: JSON.parse(text), isError: result.isError };
}

describe("Numbers Integration", async () => {
  const available = await isAppAvailable("Numbers");
  if (!available) {
    console.log("⏭  Skipping Numbers tests — app not available");
    return;
  }

  let ctx: TestContext;
  let docName: string;
  const suffix = Date.now();

  before(async () => {
    ctx = await createTestServer();
  });

  after(async () => {
    if (ctx) {
      // Attempt cleanup: close any test documents
      if (docName) {
        try {
          await call(ctx, "numbers_close_document", { documentName: docName, saving: "no" });
        } catch {}
      }
      await ctx.cleanup();
    }
  });

  it("creates a new document", async () => {
    const { json } = await call(ctx, "numbers_create_document");
    docName = json.name;
    assert.ok(docName, "Document should have a name");
    assert.ok(json.sheets.length > 0, "Should have at least one sheet");
  });

  it("writes a cell and reads it back", async () => {
    const { json: writeResult } = await call(ctx, "numbers_write_cell", {
      documentName: docName,
      cellRef: "A1",
      value: "Hello",
    });
    assert.ok(writeResult.written);

    const { json: readResult } = await call(ctx, "numbers_read_cell", {
      documentName: docName,
      cellRef: "A1",
    });
    assert.equal(readResult.value, "Hello");
  });

  it("writes a number and sets a formula", async () => {
    await call(ctx, "numbers_write_cell", { documentName: docName, cellRef: "B1", value: 10 });
    await call(ctx, "numbers_write_cell", { documentName: docName, cellRef: "B2", value: 20 });
    await call(ctx, "numbers_set_formula", {
      documentName: docName,
      cellRef: "B3",
      formula: "=B1+B2",
    });

    const { json } = await call(ctx, "numbers_read_cell", { documentName: docName, cellRef: "B3" });
    assert.equal(json.value, 30, "Formula should compute 10+20=30");
  });

  it("bulk writes a table", async () => {
    const data = [
      ["Name", "Score"],
      ["Alice", 95],
      ["Bob", 87],
    ];
    const { json } = await call(ctx, "numbers_write_table", {
      documentName: docName,
      data,
    });
    assert.equal(json.cellsWritten, 6);
    assert.equal(json.rows, 3);
    assert.equal(json.columns, 2);
  });

  it("reads back the full table", async () => {
    const { json: data } = await call(ctx, "numbers_read_table", {
      documentName: docName,
    });
    assert.ok(Array.isArray(data));
    assert.equal(data[0][0], "Name");
    assert.equal(data[1][0], "Alice");
    assert.equal(data[1][1], 95);
    assert.equal(data[2][0], "Bob");
    assert.equal(data[2][1], 87);
  });

  it("formats cells", async () => {
    const { json } = await call(ctx, "numbers_format_cells", {
      documentName: docName,
      cellRange: "A1:B1",
      format: { bold: true, fontSize: 14 },
    });
    assert.ok(json.formatted);
  });

  it("adds a new sheet and lists sheets", async () => {
    const sheetName = `TestSheet_${suffix}`;
    const { json: addResult } = await call(ctx, "numbers_add_sheet", {
      documentName: docName,
      sheetName,
    });
    assert.equal(addResult.name, sheetName);

    const { json: sheets } = await call(ctx, "numbers_list_sheets", {
      documentName: docName,
    });
    assert.ok(Array.isArray(sheets));
    const found = sheets.find((s: { name: string }) => s.name === sheetName);
    assert.ok(found, `Sheet "${sheetName}" should appear in sheet list`);
  });

  it("closes the document without saving", async () => {
    const { json } = await call(ctx, "numbers_close_document", {
      documentName: docName,
      saving: "no",
    });
    assert.ok(json.closed);
    docName = ""; // prevent double-close in after()
  });
});
