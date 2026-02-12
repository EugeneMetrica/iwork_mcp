import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTestServer, type TestContext } from "./helpers/server.js";
import { isAppAvailable } from "./helpers/app-check.js";

/** Helper: call a tool and return parsed text content. */
async function call(ctx: TestContext, name: string, args: Record<string, unknown> = {}) {
  const result = await ctx.client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = null; }
  return { text, json, isError: result.isError };
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

  // ── Insert row/column tests ──

  it("inserts a row in the middle of a table", async () => {
    const sheet = `InsRow_${suffix}`;
    // Use create_sheet_with_table for exact sizing
    await call(ctx, "numbers_create_sheet_with_table", {
      documentName: docName,
      sheetName: sheet,
      tableName: sheet,
      data: [["A", "B"], ["C", "D"], ["E", "F"]],
    });

    const { json } = await call(ctx, "numbers_insert_row_at", {
      documentName: docName,
      rowIndex: 2,
      data: [["X", "Y"]],
      sheetName: sheet,
      tableName: sheet,
    }) as { json: { rowsInserted: number; newRowCount: number } };
    assert.equal(json.rowsInserted, 1);
    assert.equal(json.newRowCount, 4);

    const { json: data } = await call(ctx, "numbers_read_table", {
      documentName: docName,
      sheetName: sheet,
      tableName: sheet,
    }) as { json: (string | null)[][] };
    assert.equal(data[0][0], "A");
    assert.equal(data[1][0], "X");
    assert.equal(data[1][1], "Y");
    assert.equal(data[2][0], "C");
    assert.equal(data[3][0], "E");
  });

  it("inserts a row at the beginning", async () => {
    const sheet = `InsRowFirst_${suffix}`;
    await call(ctx, "numbers_create_sheet_with_table", {
      documentName: docName,
      sheetName: sheet,
      tableName: sheet,
      data: [["A", "B"], ["C", "D"]],
    });

    const { json } = await call(ctx, "numbers_insert_row_at", {
      documentName: docName,
      rowIndex: 1,
      data: [["First", "Row"]],
      sheetName: sheet,
      tableName: sheet,
    }) as { json: { rowsInserted: number } };
    assert.equal(json.rowsInserted, 1);

    const { json: data } = await call(ctx, "numbers_read_table", {
      documentName: docName,
      sheetName: sheet,
      tableName: sheet,
    }) as { json: (string | null)[][] };
    assert.equal(data[0][0], "First");
    assert.equal(data[1][0], "A");
    assert.equal(data[2][0], "C");
  });

  it("inserts a column at a position", async () => {
    const sheet = `InsCol_${suffix}`;
    await call(ctx, "numbers_create_sheet_with_table", {
      documentName: docName,
      sheetName: sheet,
      tableName: sheet,
      data: [["A", "B", "C"], ["D", "E", "F"]],
    });

    const { json } = await call(ctx, "numbers_insert_column_at", {
      documentName: docName,
      column: "B",
      data: [["X", "Y"]],
      sheetName: sheet,
      tableName: sheet,
    }) as { json: { columnsInserted: number; newColumnCount: number } };
    assert.equal(json.columnsInserted, 1);
    assert.equal(json.newColumnCount, 4);

    const { json: data } = await call(ctx, "numbers_read_table", {
      documentName: docName,
      sheetName: sheet,
      tableName: sheet,
    }) as { json: (string | null)[][] };
    assert.equal(data[0][0], "A");
    assert.equal(data[0][1], "X");
    assert.equal(data[0][2], "B");
    assert.equal(data[0][3], "C");
    assert.equal(data[1][1], "Y");
  });

  // ── Delete row test ──

  it("deletes a row and verifies data", async () => {
    const sheet = `DelRow_${suffix}`;
    await call(ctx, "numbers_create_sheet_with_table", {
      documentName: docName,
      sheetName: sheet,
      tableName: sheet,
      data: [["A", 1], ["B", 2], ["C", 3]],
    });

    const { json } = await call(ctx, "numbers_delete_row", {
      documentName: docName,
      rowIndex: 2,
      sheetName: sheet,
      tableName: sheet,
    }) as { json: { deleted: number; newRowCount: number } };
    assert.equal(json.deleted, 1);
    assert.equal(json.newRowCount, 2);

    const { json: data } = await call(ctx, "numbers_read_table", {
      documentName: docName,
      sheetName: sheet,
      tableName: sheet,
    }) as { json: (string | null)[][] };
    assert.equal(data[0][0], "A");
    assert.equal(data[1][0], "C");
  });

  // ── Add/delete table test ──

  it("adds and deletes a table", async () => {
    const sheet = `TableTest_${suffix}`;
    await call(ctx, "numbers_add_sheet", { documentName: docName, sheetName: sheet });

    const { json: addResult } = await call(ctx, "numbers_add_table", {
      documentName: docName,
      sheetName: sheet,
      tableName: "TempTable",
      rows: 2,
      columns: 2,
    });
    assert.equal(addResult.name, "TempTable");

    const { json: tables } = await call(ctx, "numbers_list_tables", {
      documentName: docName,
      sheetName: sheet,
    });
    assert.ok(tables.some((t: { name: string }) => t.name === "TempTable"));

    await call(ctx, "numbers_delete_table", {
      documentName: docName,
      tableName: "TempTable",
      sheetName: sheet,
    });

    const { json: tablesAfter } = await call(ctx, "numbers_list_tables", {
      documentName: docName,
      sheetName: sheet,
    });
    assert.ok(!tablesAfter.some((t: { name: string }) => t.name === "TempTable"));
  });

  // ── Read range test ──

  it("reads a cell range subset", async () => {
    const sheet = `Range_${suffix}`;
    await call(ctx, "numbers_create_sheet_with_table", {
      documentName: docName,
      sheetName: sheet,
      tableName: sheet,
      data: [
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10, 11, 12],
        [13, 14, 15, 16],
      ],
    });

    const { json: data } = await call(ctx, "numbers_read_range", {
      documentName: docName,
      cellRange: "B2:C3",
      sheetName: sheet,
      tableName: sheet,
    }) as { json: number[][] };
    assert.equal(data.length, 2);
    assert.equal(data[0].length, 2);
    assert.equal(data[0][0], 6);
    assert.equal(data[0][1], 7);
    assert.equal(data[1][0], 10);
    assert.equal(data[1][1], 11);
  });

  // ── Merge/unmerge test ──

  it("merges and unmerges cells", async () => {
    const sheet = `Merge_${suffix}`;
    await call(ctx, "numbers_create_sheet_with_table", {
      documentName: docName,
      sheetName: sheet,
      tableName: sheet,
      data: [["A", "B", "C"], ["D", "E", "F"]],
    });

    const { json: mergeResult } = await call(ctx, "numbers_merge_cells", {
      documentName: docName,
      cellRange: "A1:C1",
      sheetName: sheet,
      tableName: sheet,
    }) as { json: { merged: boolean } };
    assert.ok(mergeResult.merged);

    const { json: unmergeResult } = await call(ctx, "numbers_unmerge_cells", {
      documentName: docName,
      cellRange: "A1:C1",
      sheetName: sheet,
      tableName: sheet,
    }) as { json: { unmerged: boolean } };
    assert.ok(unmergeResult.unmerged);
  });

  // ── Save/close/reopen cycle ──

  it("saves, closes, and reopens a document", async () => {
    const tmpPath = `/tmp/iwork_test_${suffix}.numbers`;
    await call(ctx, "numbers_write_cell", { documentName: docName, cellRef: "A1", value: "persist" });

    const { json: saveResult } = await call(ctx, "numbers_save_document", {
      documentName: docName,
      filePath: tmpPath,
    });
    assert.ok(saveResult.saved);
    docName = saveResult.name;

    await call(ctx, "numbers_close_document", { documentName: docName, saving: "no" });

    const { json: openResult } = await call(ctx, "numbers_open_document", { filePath: tmpPath });
    docName = openResult.name;

    const { json: readResult } = await call(ctx, "numbers_read_cell", {
      documentName: docName,
      cellRef: "A1",
    });
    assert.equal(readResult.value, "persist");
  });

  // ── Batch format range test ──

  it("applies multiple format rules in one call", async () => {
    const sheet = `FmtRange_${suffix}`;
    await call(ctx, "numbers_create_sheet_with_table", {
      documentName: docName,
      sheetName: sheet,
      tableName: sheet,
      data: [["Name", "Score", "Grade"], ["Alice", 95, "A"], ["Bob", 87, "B"]],
    });

    const { json } = await call(ctx, "numbers_format_range", {
      documentName: docName,
      rules: [
        { cellRange: "A1:C1", bold: true, fontSize: 14, backgroundColor: "#2C3E50", textColor: "#FFFFFF" },
        { cellRange: "B2:B3", alignment: "right", numberFormat: "number" },
        { cellRange: "C2:C3", alignment: "center" },
      ],
      sheetName: sheet,
      tableName: sheet,
    }) as { json: { rulesApplied: number; cellsFormatted: number } };
    assert.equal(json.rulesApplied, 3);
    assert.ok(json.cellsFormatted >= 7, `Expected at least 7 cells formatted, got ${json.cellsFormatted}`);
  });

  // ── Auto-format test ──

  it("auto-formats currency, percent, and comma numbers", async () => {
    const sheet = `AutoFmt_${suffix}`;
    // Create table with placeholder data (Numbers requires min 2 rows)
    await call(ctx, "numbers_create_sheet_with_table", {
      documentName: docName,
      sheetName: sheet,
      tableName: sheet,
      data: [["a", "b", "c", "d"], ["x", "x", "x", "x"]],
    });

    // Set cells to text format so string values are preserved, not auto-parsed
    await call(ctx, "numbers_format_range", {
      documentName: docName,
      rules: [{ cellRange: "A1:D1", numberFormat: "text" }],
      sheetName: sheet,
      tableName: sheet,
    });

    // Write actual test data
    await call(ctx, "numbers_write_cells", {
      documentName: docName,
      writes: [
        { cellRef: "A1", value: "$1,234.56" },
        { cellRef: "B1", value: "45%" },
        { cellRef: "C1", value: "1,234" },
        { cellRef: "D1", value: "hello" },
      ],
      sheetName: sheet,
      tableName: sheet,
    });

    const { json } = await call(ctx, "numbers_auto_format", {
      documentName: docName,
      cellRange: "A1:D1",
      sheetName: sheet,
      tableName: sheet,
    }) as { json: { autoFormatted: boolean; stats: Record<string, number> } };
    assert.ok(json.autoFormatted);
    assert.equal(json.stats.currency, 1);
    assert.equal(json.stats.percent, 1);
    assert.equal(json.stats.number, 1);
    assert.equal(json.stats.text, 1);

    // Verify numeric conversion
    const { json: data } = await call(ctx, "numbers_read_range", {
      documentName: docName,
      cellRange: "A1:D1",
      sheetName: sheet,
      tableName: sheet,
    }) as { json: (number | string | null)[][] };
    assert.equal(data[0][0], 1234.56);
    assert.ok(Math.abs((data[0][1] as number) - 0.45) < 0.001, `Expected ~0.45, got ${data[0][1]}`);
    assert.equal(data[0][2], 1234);
    assert.equal(data[0][3], "hello");
  });

  // ── Copy range test ──

  it("copies a range between two documents", async () => {
    const sheet = `CopySrc_${suffix}`;
    await call(ctx, "numbers_create_sheet_with_table", {
      documentName: docName,
      sheetName: sheet,
      tableName: sheet,
      data: [["Name", "Score"], ["Alice", 95], ["Bob", 87]],
    });

    // Create a second document
    const { json: doc2 } = await call(ctx, "numbers_create_document");
    const doc2Name = doc2.name;

    const { json: copyResult } = await call(ctx, "numbers_copy_range", {
      sourceDoc: docName,
      sourceRange: "A1:B3",
      destDoc: doc2Name,
      destCell: "A1",
      sourceSheet: sheet,
      sourceTable: sheet,
    }) as { json: { copied: boolean; cellsCopied: number; rows: number; columns: number } };
    assert.ok(copyResult.copied);
    assert.equal(copyResult.rows, 3);
    assert.equal(copyResult.columns, 2);

    // Verify in destination
    const { json: data } = await call(ctx, "numbers_read_table", {
      documentName: doc2Name,
    }) as { json: (string | number | null)[][] };
    assert.equal(data[0][0], "Name");
    assert.equal(data[1][0], "Alice");
    assert.equal(data[1][1], 95);
    assert.equal(data[2][0], "Bob");

    await call(ctx, "numbers_close_document", { documentName: doc2Name, saving: "no" });
  });

  // ── Chart test ──

  it("creates a chart from table data", async () => {
    const sheet = `Chart_${suffix}`;
    await call(ctx, "numbers_create_sheet_with_table", {
      documentName: docName,
      sheetName: sheet,
      tableName: sheet,
      data: [["Month", "Revenue"], ["Jan", 1000], ["Feb", 2000], ["Mar", 3000]],
      headerRowCount: 1,
    });

    const { json } = await call(ctx, "numbers_add_chart", {
      documentName: docName,
      dataRange: "A1:B4",
      chartType: "bar_2d",
      sheetName: sheet,
      tableName: sheet,
    }) as { json: { chartCreated: boolean; chartCount: number; width: number; height: number } };
    assert.ok(json.chartCreated);
    assert.ok(json.chartCount >= 1);
    assert.ok(json.width > 0);
    assert.ok(json.height > 0);
  });

  // ── Error on invalid document ──

  it("returns isError for a nonexistent document", async () => {
    const result = await ctx.client.callTool({
      name: "numbers_read_cell",
      arguments: { documentName: "NoSuchDocument_999", cellRef: "A1" },
    });
    assert.equal(result.isError, true);
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
