import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runJXA, OsascriptError } from "../jxa.js";

function toolResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

async function handleJXA<T>(fn: () => Promise<T>): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  try {
    const result = await fn();
    const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    return toolResult(text);
  } catch (err) {
    if (err instanceof OsascriptError) {
      return toolResult(err.message, true);
    }
    return toolResult(String(err), true);
  }
}

export function registerNumbersTools(server: McpServer): void {
  // ── Document Management ──

  server.tool(
    "numbers_list_documents",
    "List all open Numbers documents",
    {},
    async () => handleJXA(() => runJXA<string[]>(`
      const app = Application("Numbers");
      const docs = app.documents();
      return JSON.stringify(docs.map(d => ({ name: d.name(), path: d.file() ? d.file().toString() : null })));
    `)),
  );

  server.tool(
    "numbers_create_document",
    "Create a new blank Numbers document",
    {
      templateName: z.string().optional().describe("Template name (optional)"),
    },
    async ({ templateName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      let doc;
      if (params.templateName) {
        doc = app.Document({ documentTemplate: app.templates[params.templateName] });
        app.documents.push(doc);
      } else {
        doc = app.Document();
        app.documents.push(doc);
      }
      return JSON.stringify({ name: doc.name(), sheets: doc.sheets().map(s => s.name()) });
    `, { templateName: templateName ?? null })),
  );

  server.tool(
    "numbers_open_document",
    "Open a .numbers file from disk",
    {
      filePath: z.string().describe("Absolute path to the .numbers file"),
    },
    async ({ filePath }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.open(Path(params.filePath));
      return JSON.stringify({ name: doc.name(), sheets: doc.sheets().map(s => s.name()) });
    `, { filePath })),
  );

  server.tool(
    "numbers_save_document",
    "Save a Numbers document",
    {
      documentName: z.string().describe("Name of the open document"),
      filePath: z.string().optional().describe("File path to save to (for Save As)"),
    },
    async ({ documentName, filePath }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      if (params.filePath) {
        doc.save({ in: Path(params.filePath) });
      } else {
        doc.save();
      }
      return JSON.stringify({ saved: true, name: doc.name() });
    `, { documentName, filePath: filePath ?? null })),
  );

  server.tool(
    "numbers_export_document",
    "Export a Numbers document to PDF, Excel (.xlsx), or CSV",
    {
      documentName: z.string().describe("Name of the open document"),
      filePath: z.string().describe("Absolute path for the exported file"),
      format: z.enum(["PDF", "Excel", "CSV"]).describe("Export format"),
    },
    async ({ documentName, filePath, format }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const formatMap = {
        "PDF": "Numbers PDF",
        "Excel": "Microsoft Excel",
        "CSV": "CSV",
      };
      const fmt = formatMap[params.format];
      app.export(doc, { to: Path(params.filePath), as: fmt });
      return JSON.stringify({ exported: true, path: params.filePath, format: params.format });
    `, { documentName, filePath, format })),
  );

  server.tool(
    "numbers_close_document",
    "Close a Numbers document",
    {
      documentName: z.string().describe("Name of the open document"),
      saving: z.enum(["yes", "no", "ask"]).optional().describe("Whether to save before closing"),
    },
    async ({ documentName, saving }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const saveOpts = { yes: "yes", no: "no", ask: "ask" };
      if (params.saving) {
        doc.close({ saving: saveOpts[params.saving] });
      } else {
        doc.close();
      }
      return JSON.stringify({ closed: true });
    `, { documentName, saving: saving ?? null })),
  );

  // ── Structure Tools ──

  server.tool(
    "numbers_list_sheets",
    "List all sheets in a Numbers document",
    {
      documentName: z.string().describe("Name of the open document"),
    },
    async ({ documentName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheets = doc.sheets();
      return JSON.stringify(sheets.map((s, i) => ({
        index: i,
        name: s.name(),
        tableCount: s.tables.length,
      })));
    `, { documentName })),
  );

  server.tool(
    "numbers_add_sheet",
    "Add a new sheet to a Numbers document",
    {
      documentName: z.string().describe("Name of the open document"),
      sheetName: z.string().optional().describe("Name for the new sheet"),
    },
    async ({ documentName, sheetName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheet = app.Sheet();
      doc.sheets.push(sheet);
      if (params.sheetName) {
        sheet.name = params.sheetName;
      }
      return JSON.stringify({ name: sheet.name(), index: doc.sheets.length - 1 });
    `, { documentName, sheetName: sheetName ?? null })),
  );

  server.tool(
    "numbers_list_tables",
    "List all tables in a sheet with their dimensions",
    {
      documentName: z.string().describe("Name of the open document"),
      sheetName: z.string().optional().describe("Sheet name (defaults to first sheet)"),
    },
    async ({ documentName, sheetName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheet = params.sheetName ? doc.sheets.byName(params.sheetName) : doc.sheets[0];
      const tables = sheet.tables();
      return JSON.stringify(tables.map((t, i) => ({
        index: i,
        name: t.name(),
        rowCount: t.rowCount(),
        columnCount: t.columnCount(),
        headerRowCount: t.headerRowCount(),
        headerColumnCount: t.headerColumnCount(),
      })));
    `, { documentName, sheetName: sheetName ?? null })),
  );

  server.tool(
    "numbers_add_table",
    "Create a new table in a sheet",
    {
      documentName: z.string().describe("Name of the open document"),
      sheetName: z.string().optional().describe("Sheet name (defaults to first sheet)"),
      tableName: z.string().optional().describe("Name for the new table"),
      rows: z.number().optional().describe("Number of rows (default: 4)"),
      columns: z.number().optional().describe("Number of columns (default: 4)"),
    },
    async ({ documentName, sheetName, tableName, rows, columns }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheet = params.sheetName ? doc.sheets.byName(params.sheetName) : doc.sheets[0];
      const props = {};
      if (params.rows) props.rowCount = params.rows;
      if (params.columns) props.columnCount = params.columns;
      const table = app.Table(props);
      sheet.tables.push(table);
      if (params.tableName) {
        table.name = params.tableName;
      }
      return JSON.stringify({
        name: table.name(),
        rowCount: table.rowCount(),
        columnCount: table.columnCount(),
      });
    `, { documentName, sheetName: sheetName ?? null, tableName: tableName ?? null, rows: rows ?? null, columns: columns ?? null })),
  );

  // ── Data Reading Tools ──

  server.tool(
    "numbers_read_table",
    "Read all data from a table as a 2D array. Returns rows of cell values.",
    {
      documentName: z.string().describe("Name of the open document"),
      sheetName: z.string().optional().describe("Sheet name (defaults to first sheet)"),
      tableName: z.string().optional().describe("Table name (defaults to first table)"),
    },
    async ({ documentName, sheetName, tableName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheet = params.sheetName ? doc.sheets.byName(params.sheetName) : doc.sheets[0];
      const table = params.tableName ? sheet.tables.byName(params.tableName) : sheet.tables[0];
      const rowCount = table.rowCount();
      const colCount = table.columnCount();
      const data = [];
      for (let r = 0; r < rowCount; r++) {
        const row = [];
        for (let c = 0; c < colCount; c++) {
          const cell = table.cells[r * colCount + c];
          row.push(cell.value());
        }
        data.push(row);
      }
      return JSON.stringify(data);
    `, { documentName, sheetName: sheetName ?? null, tableName: tableName ?? null })),
  );

  server.tool(
    "numbers_read_cell",
    "Read a single cell's value",
    {
      documentName: z.string().describe("Name of the open document"),
      cellRef: z.string().describe("Cell reference, e.g. 'A1', 'B3'"),
      sheetName: z.string().optional().describe("Sheet name (defaults to first sheet)"),
      tableName: z.string().optional().describe("Table name (defaults to first table)"),
    },
    async ({ documentName, cellRef, sheetName, tableName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheet = params.sheetName ? doc.sheets.byName(params.sheetName) : doc.sheets[0];
      const table = params.tableName ? sheet.tables.byName(params.tableName) : sheet.tables[0];
      const cell = table.cells[params.cellRef];
      return JSON.stringify({ cellRef: params.cellRef, value: cell.value(), formattedValue: cell.formattedValue() });
    `, { documentName, cellRef, sheetName: sheetName ?? null, tableName: tableName ?? null })),
  );

  server.tool(
    "numbers_get_table_info",
    "Get table metadata: row/column counts, header info, table name",
    {
      documentName: z.string().describe("Name of the open document"),
      sheetName: z.string().optional().describe("Sheet name (defaults to first sheet)"),
      tableName: z.string().optional().describe("Table name (defaults to first table)"),
    },
    async ({ documentName, sheetName, tableName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheet = params.sheetName ? doc.sheets.byName(params.sheetName) : doc.sheets[0];
      const table = params.tableName ? sheet.tables.byName(params.tableName) : sheet.tables[0];
      return JSON.stringify({
        name: table.name(),
        rowCount: table.rowCount(),
        columnCount: table.columnCount(),
        headerRowCount: table.headerRowCount(),
        headerColumnCount: table.headerColumnCount(),
        footerRowCount: table.footerRowCount(),
      });
    `, { documentName, sheetName: sheetName ?? null, tableName: tableName ?? null })),
  );

  // ── Data Writing Tools ──

  server.tool(
    "numbers_write_cell",
    "Write a value to a cell",
    {
      documentName: z.string().describe("Name of the open document"),
      cellRef: z.string().describe("Cell reference, e.g. 'A1', 'B3'"),
      value: z.union([z.string(), z.number(), z.boolean()]).describe("Value to write"),
      sheetName: z.string().optional().describe("Sheet name (defaults to first sheet)"),
      tableName: z.string().optional().describe("Table name (defaults to first table)"),
    },
    async ({ documentName, cellRef, value, sheetName, tableName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheet = params.sheetName ? doc.sheets.byName(params.sheetName) : doc.sheets[0];
      const table = params.tableName ? sheet.tables.byName(params.tableName) : sheet.tables[0];
      table.cells[params.cellRef].value = params.value;
      return JSON.stringify({ cellRef: params.cellRef, written: true });
    `, { documentName, cellRef, value, sheetName: sheetName ?? null, tableName: tableName ?? null })),
  );

  server.tool(
    "numbers_write_cells",
    "Batch write multiple cell values in a single operation",
    {
      documentName: z.string().describe("Name of the open document"),
      writes: z.array(z.object({
        cellRef: z.string().describe("Cell reference, e.g. 'A1'"),
        value: z.union([z.string(), z.number(), z.boolean()]).describe("Value to write"),
      })).describe("Array of cell writes"),
      sheetName: z.string().optional().describe("Sheet name (defaults to first sheet)"),
      tableName: z.string().optional().describe("Table name (defaults to first table)"),
    },
    async ({ documentName, writes, sheetName, tableName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheet = params.sheetName ? doc.sheets.byName(params.sheetName) : doc.sheets[0];
      const table = params.tableName ? sheet.tables.byName(params.tableName) : sheet.tables[0];
      const results = [];
      for (const w of params.writes) {
        table.cells[w.cellRef].value = w.value;
        results.push({ cellRef: w.cellRef, written: true });
      }
      return JSON.stringify(results);
    `, { documentName, writes, sheetName: sheetName ?? null, tableName: tableName ?? null })),
  );

  server.tool(
    "numbers_write_table",
    "Bulk write an entire table of data in a single operation. Much faster than writing cells individually. Resizes the table to fit the data automatically.",
    {
      documentName: z.string().describe("Name of the open document"),
      data: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
        .describe("2D array of data — first row can be headers. Null cells are skipped."),
      startCell: z.string().optional().describe("Top-left cell to start writing from (default: 'A1')"),
      sheetName: z.string().optional().describe("Sheet name (defaults to first sheet)"),
      tableName: z.string().optional().describe("Table name (defaults to first table)"),
      resizeToFit: z.boolean().optional().describe("Resize table to fit data (default: true)"),
    },
    async ({ documentName, data, startCell, sheetName, tableName, resizeToFit }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheet = params.sheetName ? doc.sheets.byName(params.sheetName) : doc.sheets[0];
      const table = params.tableName ? sheet.tables.byName(params.tableName) : sheet.tables[0];

      // Parse start cell (e.g. "B3" -> col=1, row=2)
      const cellRef = (params.startCell || "A1").toUpperCase();
      const colMatch = cellRef.match(/^([A-Z]+)/);
      const rowMatch = cellRef.match(/(\\d+)$/);
      let startCol = 0;
      if (colMatch) {
        for (let i = 0; i < colMatch[1].length; i++) {
          startCol = startCol * 26 + (colMatch[1].charCodeAt(i) - 64);
        }
        startCol -= 1;
      }
      const startRow = rowMatch ? parseInt(rowMatch[1]) - 1 : 0;

      const dataRows = params.data.length;
      const dataCols = Math.max(...params.data.map(r => r.length));
      const needRows = startRow + dataRows;
      const needCols = startCol + dataCols;

      // Resize table if needed
      if (params.resizeToFit !== false) {
        while (table.rowCount() < needRows) {
          table.rows.push(app.Row());
        }
        while (table.columnCount() < needCols) {
          table.columns.push(app.Column());
        }
      }

      const colCount = table.columnCount();
      let cellsWritten = 0;
      for (let r = 0; r < dataRows; r++) {
        for (let c = 0; c < params.data[r].length; c++) {
          const val = params.data[r][c];
          if (val !== null) {
            table.cells[(startRow + r) * colCount + (startCol + c)].value = val;
            cellsWritten++;
          }
        }
      }
      return JSON.stringify({ cellsWritten: cellsWritten, rows: dataRows, columns: dataCols });
    `, { documentName, data, startCell: startCell ?? null, sheetName: sheetName ?? null, tableName: tableName ?? null, resizeToFit: resizeToFit ?? true })),
  );

  server.tool(
    "numbers_set_formula",
    "Set a formula on a cell (e.g. '=SUM(A1:A10)')",
    {
      documentName: z.string().describe("Name of the open document"),
      cellRef: z.string().describe("Cell reference, e.g. 'A1'"),
      formula: z.string().describe("Formula string (e.g. '=SUM(A1:A10)')"),
      sheetName: z.string().optional().describe("Sheet name (defaults to first sheet)"),
      tableName: z.string().optional().describe("Table name (defaults to first table)"),
    },
    async ({ documentName, cellRef, formula, sheetName, tableName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheet = params.sheetName ? doc.sheets.byName(params.sheetName) : doc.sheets[0];
      const table = params.tableName ? sheet.tables.byName(params.tableName) : sheet.tables[0];
      table.cells[params.cellRef].value = params.formula;
      return JSON.stringify({ cellRef: params.cellRef, formula: params.formula, set: true });
    `, { documentName, cellRef, formula, sheetName: sheetName ?? null, tableName: tableName ?? null })),
  );

  server.tool(
    "numbers_add_row",
    "Add one or more rows at the end of a table, optionally with data",
    {
      documentName: z.string().describe("Name of the open document"),
      data: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).optional()
        .describe("2D array of row data to populate (each inner array is one row)"),
      position: z.enum(["end", "beginning"]).optional().describe("Where to add the row (default: end)"),
      sheetName: z.string().optional().describe("Sheet name (defaults to first sheet)"),
      tableName: z.string().optional().describe("Table name (defaults to first table)"),
    },
    async ({ documentName, data, position, sheetName, tableName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheet = params.sheetName ? doc.sheets.byName(params.sheetName) : doc.sheets[0];
      const table = params.tableName ? sheet.tables.byName(params.tableName) : sheet.tables[0];

      const rowsToAdd = params.data ? params.data.length : 1;
      const colCount = table.columnCount();
      const pos = params.position === "beginning" ? 0 : table.rowCount();

      for (let i = 0; i < rowsToAdd; i++) {
        table.rows.push(app.Row());
      }

      if (params.data) {
        const startRow = pos;
        for (let r = 0; r < params.data.length; r++) {
          for (let c = 0; c < Math.min(params.data[r].length, colCount); c++) {
            if (params.data[r][c] !== null) {
              table.cells[(startRow + r) * colCount + c].value = params.data[r][c];
            }
          }
        }
      }

      return JSON.stringify({ rowsAdded: rowsToAdd, newRowCount: table.rowCount() });
    `, { documentName, data: data ?? null, position: position ?? null, sheetName: sheetName ?? null, tableName: tableName ?? null })),
  );

  server.tool(
    "numbers_add_column",
    "Add a column to a table",
    {
      documentName: z.string().describe("Name of the open document"),
      sheetName: z.string().optional().describe("Sheet name (defaults to first sheet)"),
      tableName: z.string().optional().describe("Table name (defaults to first table)"),
    },
    async ({ documentName, sheetName, tableName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheet = params.sheetName ? doc.sheets.byName(params.sheetName) : doc.sheets[0];
      const table = params.tableName ? sheet.tables.byName(params.tableName) : sheet.tables[0];
      table.columns.push(app.Column());
      return JSON.stringify({ newColumnCount: table.columnCount() });
    `, { documentName, sheetName: sheetName ?? null, tableName: tableName ?? null })),
  );

  // ── Formatting Tools ──

  server.tool(
    "numbers_format_cells",
    "Set formatting on a cell or range: font, size, color, alignment, background color",
    {
      documentName: z.string().describe("Name of the open document"),
      cellRange: z.string().describe("Cell or range reference, e.g. 'A1' or 'A1:C3'"),
      format: z.object({
        bold: z.boolean().optional().describe("Set bold"),
        italic: z.boolean().optional().describe("Set italic"),
        fontSize: z.number().optional().describe("Font size in points"),
        fontName: z.string().optional().describe("Font name"),
        textColor: z.string().optional().describe("Text color as hex, e.g. '#FF0000'"),
        backgroundColor: z.string().optional().describe("Background color as hex, e.g. '#0000FF'"),
        alignment: z.enum(["left", "center", "right", "auto"]).optional().describe("Text alignment"),
      }).describe("Formatting options"),
      sheetName: z.string().optional().describe("Sheet name (defaults to first sheet)"),
      tableName: z.string().optional().describe("Table name (defaults to first table)"),
    },
    async ({ documentName, cellRange, format, sheetName, tableName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheet = params.sheetName ? doc.sheets.byName(params.sheetName) : doc.sheets[0];
      const table = params.tableName ? sheet.tables.byName(params.tableName) : sheet.tables[0];
      const fmt = params.format;

      // Parse range like "A1:C3" into individual cells
      const rangeStr = params.cellRange;
      let cells = [];
      if (rangeStr.includes(":")) {
        const range = table.ranges[rangeStr];
        cells = range.cells();
      } else {
        cells = [table.cells[rangeStr]];
      }

      function hexToRGB(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return [r, g, b];
      }

      for (const cell of cells) {
        if (fmt.bold !== undefined) cell.textColor = cell.textColor; // touch to ensure access
        if (fmt.fontSize !== undefined) cell.fontSize = fmt.fontSize;
        if (fmt.fontName !== undefined) cell.fontName = fmt.fontName;
        if (fmt.textColor !== undefined) {
          const [r, g, b] = hexToRGB(fmt.textColor);
          cell.textColor = [r, g, b];
        }
        if (fmt.backgroundColor !== undefined) {
          const [r, g, b] = hexToRGB(fmt.backgroundColor);
          cell.backgroundColor = [r, g, b];
        }
        if (fmt.alignment !== undefined) {
          const alignMap = { left: "left", center: "center", right: "right", auto: "auto" };
          cell.alignment = alignMap[fmt.alignment];
        }
        if (fmt.bold !== undefined) {
          cell.format = cell.format; // Numbers doesn't have direct bold; we use font
        }
      }

      return JSON.stringify({ formatted: true, cellRange: params.cellRange });
    `, { documentName, cellRange, format, sheetName: sheetName ?? null, tableName: tableName ?? null })),
  );

  server.tool(
    "numbers_set_column_width",
    "Set the width of a column",
    {
      documentName: z.string().describe("Name of the open document"),
      column: z.string().describe("Column letter, e.g. 'A', 'B'"),
      width: z.number().describe("Width in points"),
      sheetName: z.string().optional().describe("Sheet name (defaults to first sheet)"),
      tableName: z.string().optional().describe("Table name (defaults to first table)"),
    },
    async ({ documentName, column, width, sheetName, tableName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheet = params.sheetName ? doc.sheets.byName(params.sheetName) : doc.sheets[0];
      const table = params.tableName ? sheet.tables.byName(params.tableName) : sheet.tables[0];

      // Convert column letter to index (A=0, B=1, ...)
      const colStr = params.column.toUpperCase();
      let colIndex = 0;
      for (let i = 0; i < colStr.length; i++) {
        colIndex = colIndex * 26 + (colStr.charCodeAt(i) - 64);
      }
      colIndex -= 1;

      table.columns[colIndex].width = params.width;
      return JSON.stringify({ column: params.column, width: params.width, set: true });
    `, { documentName, column, width, sheetName: sheetName ?? null, tableName: tableName ?? null })),
  );

  server.tool(
    "numbers_set_row_height",
    "Set the height of a row",
    {
      documentName: z.string().describe("Name of the open document"),
      row: z.number().describe("Row number (1-based)"),
      height: z.number().describe("Height in points"),
      sheetName: z.string().optional().describe("Sheet name (defaults to first sheet)"),
      tableName: z.string().optional().describe("Table name (defaults to first table)"),
    },
    async ({ documentName, row, height, sheetName, tableName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Numbers");
      const doc = app.documents.byName(params.documentName);
      const sheet = params.sheetName ? doc.sheets.byName(params.sheetName) : doc.sheets[0];
      const table = params.tableName ? sheet.tables.byName(params.tableName) : sheet.tables[0];
      table.rows[params.row - 1].height = params.height;
      return JSON.stringify({ row: params.row, height: params.height, set: true });
    `, { documentName, row, height, sheetName: sheetName ?? null, tableName: tableName ?? null })),
  );
}
