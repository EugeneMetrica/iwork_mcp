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

export function registerPagesTools(server: McpServer): void {
  // ── Document Management ──

  server.tool(
    "pages_list_documents",
    "List all open Pages documents",
    {},
    async () => handleJXA(() => runJXA<string[]>(`
      const app = Application("Pages");
      const docs = app.documents();
      return JSON.stringify(docs.map(d => ({ name: d.name(), path: d.file() ? d.file().toString() : null })));
    `)),
  );

  server.tool(
    "pages_create_document",
    "Create a new blank Pages document (or from a template)",
    {
      templateName: z.string().optional().describe("Template name (optional)"),
    },
    async ({ templateName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      let doc;
      if (params.templateName) {
        doc = app.Document({ documentTemplate: app.templates[params.templateName] });
        app.documents.push(doc);
      } else {
        doc = app.Document();
        app.documents.push(doc);
      }
      return JSON.stringify({ name: doc.name() });
    `, { templateName: templateName ?? null })),
  );

  server.tool(
    "pages_open_document",
    "Open a .pages file from disk",
    {
      filePath: z.string().describe("Absolute path to the .pages file"),
    },
    async ({ filePath }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.open(Path(params.filePath));
      return JSON.stringify({ name: doc.name() });
    `, { filePath })),
  );

  server.tool(
    "pages_save_document",
    "Save a Pages document",
    {
      documentName: z.string().describe("Name of the open document"),
      filePath: z.string().optional().describe("File path to save to (for Save As)"),
    },
    async ({ documentName, filePath }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
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
    "pages_export_document",
    "Export a Pages document to PDF, Word (.docx), EPUB, or plain text",
    {
      documentName: z.string().describe("Name of the open document"),
      filePath: z.string().describe("Absolute path for the exported file"),
      format: z.enum(["PDF", "Word", "EPUB", "Text"]).describe("Export format"),
    },
    async ({ documentName, filePath, format }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      const formatMap = {
        "PDF": "Pages PDF",
        "Word": "Microsoft Word",
        "EPUB": "EPUB",
        "Text": "unformatted text",
      };
      const fmt = formatMap[params.format];
      app.export(doc, { to: Path(params.filePath), as: fmt });
      return JSON.stringify({ exported: true, path: params.filePath, format: params.format });
    `, { documentName, filePath, format })),
  );

  server.tool(
    "pages_close_document",
    "Close a Pages document",
    {
      documentName: z.string().describe("Name of the open document"),
      saving: z.enum(["yes", "no", "ask"]).optional().describe("Whether to save before closing"),
    },
    async ({ documentName, saving }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
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

  // ── Text Reading Tools ──

  server.tool(
    "pages_get_body_text",
    "Read all body text from a Pages document",
    {
      documentName: z.string().describe("Name of the open document"),
    },
    async ({ documentName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      const text = doc.bodyText();
      return JSON.stringify({ text: text });
    `, { documentName })),
  );

  server.tool(
    "pages_get_paragraphs",
    "Get all paragraphs from a Pages document as an indexed array",
    {
      documentName: z.string().describe("Name of the open document"),
    },
    async ({ documentName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      const paragraphs = doc.paragraphs();
      return JSON.stringify(paragraphs.map((p, i) => ({
        index: i,
        text: p.text ? p.text() : "",
      })));
    `, { documentName })),
  );

  // ── Text Writing Tools ──

  server.tool(
    "pages_add_text",
    "Append text to the end of the document body (preserves existing formatting)",
    {
      documentName: z.string().describe("Name of the open document"),
      text: z.string().describe("Text to append"),
    },
    async ({ documentName, text }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      // Append by adding a new paragraph to preserve existing formatting
      const para = app.Paragraph({ text: params.text });
      doc.paragraphs.push(para);
      return JSON.stringify({ appended: true, paragraphCount: doc.paragraphs.length });
    `, { documentName, text })),
  );

  server.tool(
    "pages_insert_text_at",
    "Insert text at a specific paragraph index",
    {
      documentName: z.string().describe("Name of the open document"),
      text: z.string().describe("Text to insert"),
      afterParagraph: z.number().describe("Insert after this paragraph index (0-based). Use -1 to insert at the beginning."),
    },
    async ({ documentName, text, afterParagraph }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      const para = app.Paragraph({ text: params.text });
      if (params.afterParagraph < 0) {
        doc.paragraphs.unshift(para);
      } else {
        doc.paragraphs.splice(params.afterParagraph + 1, 0, para);
      }
      return JSON.stringify({ inserted: true, paragraphCount: doc.paragraphs.length });
    `, { documentName, text, afterParagraph })),
  );

  server.tool(
    "pages_delete_text",
    "Delete a paragraph by index",
    {
      documentName: z.string().describe("Name of the open document"),
      paragraphIndex: z.number().describe("Paragraph index to delete (0-based)"),
    },
    async ({ documentName, paragraphIndex }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      app.delete(doc.paragraphs[params.paragraphIndex]);
      return JSON.stringify({ deleted: true, paragraphCount: doc.paragraphs.length });
    `, { documentName, paragraphIndex })),
  );

  server.tool(
    "pages_replace_text",
    "Find and replace text in a Pages document (operates per-paragraph to preserve formatting)",
    {
      documentName: z.string().describe("Name of the open document"),
      find: z.string().describe("Text to find"),
      replace: z.string().describe("Replacement text"),
      all: z.boolean().optional().describe("Replace all occurrences (default: true)"),
    },
    async ({ documentName, find, replace, all }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      const paragraphs = doc.paragraphs();
      let count = 0;
      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        let text;
        try { text = p.text ? p.text() : ""; } catch(e) { continue; }
        if (text.indexOf(params.find) === -1) continue;
        if (params.all !== false) {
          const parts = text.split(params.find);
          count += parts.length - 1;
          doc.paragraphs[i].text = parts.join(params.replace);
        } else if (count === 0) {
          const idx = text.indexOf(params.find);
          doc.paragraphs[i].text = text.substring(0, idx) + params.replace + text.substring(idx + params.find.length);
          count = 1;
          break;
        }
      }
      return JSON.stringify({ replacements: count });
    `, { documentName, find, replace, all: all ?? true })),
  );

  server.tool(
    "pages_format_text",
    "Set formatting on a paragraph: font, size, color, bold, italic",
    {
      documentName: z.string().describe("Name of the open document"),
      paragraphIndex: z.number().describe("Paragraph index (0-based)"),
      format: z.object({
        bold: z.boolean().optional().describe("Set bold"),
        italic: z.boolean().optional().describe("Set italic"),
        fontSize: z.number().optional().describe("Font size in points"),
        fontName: z.string().optional().describe("Font name"),
        textColor: z.string().optional().describe("Text color as hex, e.g. '#FF0000'"),
      }).describe("Formatting options"),
    },
    async ({ documentName, paragraphIndex, format }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      const paragraph = doc.paragraphs[params.paragraphIndex];
      const fmt = params.format;

      if (fmt.fontSize !== undefined) paragraph.fontSize = fmt.fontSize;
      if (fmt.fontName !== undefined) paragraph.fontName = fmt.fontName;
      if (fmt.bold !== undefined) paragraph.bold = fmt.bold;
      if (fmt.italic !== undefined) paragraph.italic = fmt.italic;
      if (fmt.textColor !== undefined) {
        const hex = fmt.textColor;
        const r = parseInt(hex.slice(1, 3), 16) * 257;
        const g = parseInt(hex.slice(3, 5), 16) * 257;
        const b = parseInt(hex.slice(5, 7), 16) * 257;
        paragraph.color = [r, g, b];
      }

      return JSON.stringify({ formatted: true, paragraphIndex: params.paragraphIndex });
    `, { documentName, paragraphIndex, format })),
  );

  server.tool(
    "pages_add_image",
    "Insert an image into the document",
    {
      documentName: z.string().describe("Name of the open document"),
      filePath: z.string().describe("Absolute path to the image file"),
    },
    async ({ documentName, filePath }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      const image = app.Image({ file: Path(params.filePath) });
      doc.images.push(image);
      return JSON.stringify({ added: true, path: params.filePath });
    `, { documentName, filePath })),
  );

  server.tool(
    "pages_add_table",
    "Insert a table into the document",
    {
      documentName: z.string().describe("Name of the open document"),
      rows: z.number().optional().describe("Number of rows (default: 3)"),
      columns: z.number().optional().describe("Number of columns (default: 3)"),
    },
    async ({ documentName, rows, columns }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      const props = {};
      if (params.rows) props.rowCount = params.rows;
      if (params.columns) props.columnCount = params.columns;
      const table = app.Table(props);
      doc.tables.push(table);
      return JSON.stringify({ added: true, name: table.name() });
    `, { documentName, rows: rows ?? null, columns: columns ?? null })),
  );
}
