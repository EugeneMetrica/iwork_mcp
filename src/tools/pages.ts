import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runJXA, OsascriptError, isCreatorStudio, creatorStudioSaveAs, creatorStudioExportPDF } from "../jxa.js";
import { ANNOTATIONS } from "../annotations.js";

function toolResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

async function handleJXA<T>(fn: () => Promise<T>): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  try {
    const result = await fn();
    const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    return toolResult(text);
  } catch (err) {
    // Creator Studio auto-save can rename documents mid-operation, causing transient -1728.
    // Retry once so the document name resolution injection picks up the new name.
    if (err instanceof OsascriptError && err.appleScriptErrorCode === -1728 && isCreatorStudio()) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const result = await fn();
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        return toolResult(text);
      } catch (retryErr) {
        if (retryErr instanceof OsascriptError) return toolResult(retryErr.message, true);
        return toolResult(String(retryErr), true);
      }
    }
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
    ANNOTATIONS.readOnly,
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
    ANNOTATIONS.readWrite,
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
      filePath: z.string().startsWith("/").describe("Absolute path to the .pages file"),
    },
    ANNOTATIONS.readWrite,
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
      filePath: z.string().startsWith("/").optional().describe("File path to save to (for Save As)"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, filePath }) => handleJXA(async () => {
      if (isCreatorStudio()) {
        if (filePath) {
          const newName = await creatorStudioSaveAs("Pages", documentName, filePath);
          return JSON.stringify({ saved: true, name: newName });
        }
        return JSON.stringify({ saved: true, name: documentName });
      }
      return runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      if (params.filePath) {
        doc.save({ in: Path(params.filePath) });
        doc.close({ saving: "no" });
        const newDoc = app.open(Path(params.filePath));
        return JSON.stringify({ saved: true, name: newDoc.name() });
      } else {
        doc.save();
      }
      return JSON.stringify({ saved: true, name: doc.name() });
    `, { documentName, filePath: filePath ?? null });
    }),
  );

  server.tool(
    "pages_export_document",
    "Export a Pages document to PDF, Word (.docx), EPUB, or plain text",
    {
      documentName: z.string().describe("Name of the open document"),
      filePath: z.string().startsWith("/").describe("Absolute path for the exported file"),
      format: z.enum(["PDF", "Word", "EPUB", "Text"]).describe("Export format"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, filePath, format }) => handleJXA(async () => {
      if (isCreatorStudio() && format === "PDF") {
        await creatorStudioExportPDF("Pages", documentName, filePath);
        return JSON.stringify({ exported: true, path: filePath, format: "PDF" });
      }
      return runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      const formatMap = {
        "PDF": "PDF",
        "Word": "Microsoft Word",
        "EPUB": "EPUB",
        "Text": "unformatted text",
      };
      const fmt = formatMap[params.format];
      app.export(doc, { to: Path(params.filePath), as: fmt });
      return JSON.stringify({ exported: true, path: params.filePath, format: params.format });
    `, { documentName, filePath, format });
    }),
  );

  server.tool(
    "pages_close_document",
    "Close a Pages document",
    {
      documentName: z.string().describe("Name of the open document"),
      saving: z.enum(["yes", "no", "ask"]).optional().describe("Whether to save before closing"),
    },
    ANNOTATIONS.destructive,
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
    ANNOTATIONS.readOnly,
    async ({ documentName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      const text = doc.bodyText();
      return JSON.stringify({ text: text });
    `, { documentName })),
  );

  server.tool(
    "pages_get_paragraphs",
    "Get all paragraphs from a Pages document with their text, font, size, and color",
    {
      documentName: z.string().describe("Name of the open document"),
    },
    ANNOTATIONS.readOnly,
    async ({ documentName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      const paras = doc.bodyText.paragraphs;
      const count = paras.length;
      const result = [];
      for (let i = 0; i < count; i++) {
        const p = paras[i];
        const text = p();
        if (text === "" && i === count - 1) continue;  // skip trailing empty paragraph
        const entry = { index: i, text: text };
        try { entry.font = p.font(); } catch(e) {}
        try { entry.size = p.size(); } catch(e) {}
        result.push(entry);
      }
      return JSON.stringify(result);
    `, { documentName })),
  );

  // ── Text Writing Tools ──

  server.tool(
    "pages_add_text",
    "Append text to the end of the document body (preserves existing formatting). Include a trailing newline to start a new paragraph.",
    {
      documentName: z.string().describe("Name of the open document"),
      text: z.string().describe("Text to append (include trailing newline for a new paragraph)"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, text }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      // Save formatting on all existing paragraphs
      const paras = doc.bodyText.paragraphs;
      const count = paras.length;
      const formats = [];
      for (let i = 0; i < count; i++) {
        try { formats.push({ font: paras[i].font(), size: paras[i].size(), color: paras[i].color() }); }
        catch(e) { formats.push(null); }
      }
      // Append
      doc.bodyText = doc.bodyText() + params.text;
      // Restore formatting on pre-existing paragraphs
      for (let i = 0; i < formats.length; i++) {
        if (!formats[i]) continue;
        try {
          const p = doc.bodyText.paragraphs[i];
          p.font = formats[i].font;
          p.size = formats[i].size;
          p.color = formats[i].color;
        } catch(e) {}
      }
      return JSON.stringify({ appended: true, paragraphCount: doc.bodyText.paragraphs.length });
    `, { documentName, text })),
  );

  server.tool(
    "pages_insert_text_at",
    "Insert text at a specific paragraph index (preserves formatting on other paragraphs)",
    {
      documentName: z.string().describe("Name of the open document"),
      text: z.string().describe("Text to insert (include trailing newline)"),
      afterParagraph: z.number().int().min(-1).describe("Insert after this paragraph index (0-based). Use -1 to insert at the beginning."),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, text, afterParagraph }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      // Save formatting
      const paras = doc.bodyText.paragraphs;
      const count = paras.length;
      const formats = [];
      for (let i = 0; i < count; i++) {
        try { formats.push({ font: paras[i].font(), size: paras[i].size(), color: paras[i].color() }); }
        catch(e) { formats.push(null); }
      }
      // Insert via string manipulation
      const bt = doc.bodyText();
      const lines = bt.split("\\n");
      const insertIdx = params.afterParagraph < 0 ? 0 : params.afterParagraph + 1;
      const newText = params.text.endsWith("\\n") ? params.text.slice(0, -1) : params.text;
      lines.splice(insertIdx, 0, newText);
      doc.bodyText = lines.join("\\n");
      // Restore formatting (shift indices after insert point)
      for (let i = 0; i < formats.length; i++) {
        if (!formats[i]) continue;
        const newIdx = i < insertIdx ? i : i + 1;
        try {
          const p = doc.bodyText.paragraphs[newIdx];
          p.font = formats[i].font;
          p.size = formats[i].size;
          p.color = formats[i].color;
        } catch(e) {}
      }
      return JSON.stringify({ inserted: true, paragraphCount: doc.bodyText.paragraphs.length });
    `, { documentName, text, afterParagraph })),
  );

  server.tool(
    "pages_delete_text",
    "Delete a paragraph by index (preserves formatting on other paragraphs)",
    {
      documentName: z.string().describe("Name of the open document"),
      paragraphIndex: z.number().int().min(0).describe("Paragraph index to delete (0-based)"),
    },
    ANNOTATIONS.destructive,
    async ({ documentName, paragraphIndex }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      // Save formatting
      const paras = doc.bodyText.paragraphs;
      const count = paras.length;
      const formats = [];
      for (let i = 0; i < count; i++) {
        try { formats.push({ font: paras[i].font(), size: paras[i].size(), color: paras[i].color() }); }
        catch(e) { formats.push(null); }
      }
      // Delete via string manipulation
      const lines = doc.bodyText().split("\\n");
      if (params.paragraphIndex < 0 || params.paragraphIndex >= lines.length) {
        throw new Error("Paragraph index " + params.paragraphIndex + " out of range (0-" + (lines.length - 1) + ")");
      }
      lines.splice(params.paragraphIndex, 1);
      formats.splice(params.paragraphIndex, 1);
      doc.bodyText = lines.join("\\n");
      // Restore formatting
      for (let i = 0; i < formats.length; i++) {
        if (!formats[i]) continue;
        try {
          const p = doc.bodyText.paragraphs[i];
          p.font = formats[i].font;
          p.size = formats[i].size;
          p.color = formats[i].color;
        } catch(e) {}
      }
      return JSON.stringify({ deleted: true, paragraphCount: doc.bodyText.paragraphs.length });
    `, { documentName, paragraphIndex })),
  );

  server.tool(
    "pages_replace_text",
    "Find and replace text in a Pages document (preserves formatting)",
    {
      documentName: z.string().describe("Name of the open document"),
      find: z.string().describe("Text to find"),
      replace: z.string().describe("Replacement text"),
      all: z.boolean().optional().describe("Replace all occurrences (default: true)"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, find, replace, all }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      const paras = doc.bodyText.paragraphs;
      const count = paras.length;
      let total = 0;
      for (let i = 0; i < count; i++) {
        const text = paras[i]();
        if (text.indexOf(params.find) === -1) continue;
        if (params.all !== false) {
          const parts = text.split(params.find);
          total += parts.length - 1;
          doc.bodyText.paragraphs[i] = parts.join(params.replace);
        } else if (total === 0) {
          const idx = text.indexOf(params.find);
          doc.bodyText.paragraphs[i] = text.substring(0, idx) + params.replace + text.substring(idx + params.find.length);
          total = 1;
          break;
        }
      }
      return JSON.stringify({ replacements: total });
    `, { documentName, find, replace, all: all ?? true })),
  );

  server.tool(
    "pages_format_text",
    "Set formatting on a paragraph: font (PostScript name), size, color. For bold use a bold font name like 'HelveticaNeue-Bold', for italic use 'HelveticaNeue-Italic'.",
    {
      documentName: z.string().describe("Name of the open document"),
      paragraphIndex: z.number().int().min(0).describe("Paragraph index (0-based)"),
      format: z.object({
        fontSize: z.number().positive().optional().describe("Font size in points"),
        fontName: z.string().optional().describe("PostScript font name (e.g. 'HelveticaNeue-Bold' for bold, 'Georgia-Italic' for italic)"),
        textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().describe("Text color as hex, e.g. '#FF0000'"),
      }).describe("Formatting options"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, paragraphIndex, format }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      const doc = app.documents.byName(params.documentName);
      const paragraph = doc.bodyText.paragraphs[params.paragraphIndex];
      const fmt = params.format;

      if (fmt.fontSize !== undefined) paragraph.size = fmt.fontSize;
      if (fmt.fontName !== undefined) paragraph.font = fmt.fontName;
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
      filePath: z.string().startsWith("/").describe("Absolute path to the image file"),
    },
    ANNOTATIONS.readWrite,
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
      rows: z.number().int().positive().optional().describe("Number of rows (default: 3)"),
      columns: z.number().int().positive().optional().describe("Number of columns (default: 3)"),
    },
    ANNOTATIONS.readWrite,
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

  // ── Compound Tools ──

  server.tool(
    "pages_create_document_with_content",
    "Create a Pages document with multiple formatted paragraphs in one call (much faster than adding paragraphs individually). For bold/italic, use PostScript font names like 'HelveticaNeue-Bold' or 'Georgia-Italic'.",
    {
      paragraphs: z.array(z.object({
        text: z.string().describe("Paragraph text (no trailing newline needed)"),
        fontSize: z.number().positive().optional().describe("Font size in points (default: 12)"),
        fontName: z.string().optional().describe("PostScript font name, e.g. 'HelveticaNeue-Bold', 'Georgia-Italic'"),
        textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().describe("Text color as hex, e.g. '#FF0000'"),
      })).describe("Array of paragraphs with optional formatting"),
      filePath: z.string().startsWith("/").optional().describe("Absolute path to save as .pages file"),
    },
    ANNOTATIONS.readWrite,
    async ({ paragraphs, filePath }) => handleJXA(() => runJXA<string>(`
      const app = Application("Pages");
      let doc = app.Document();
      app.documents.push(doc);

      // Build full text with newlines between paragraphs
      let fullText = "";
      for (let i = 0; i < params.paragraphs.length; i++) {
        fullText += params.paragraphs[i].text + "\\n";
      }
      doc.bodyText = fullText;

      // Format each paragraph via bodyText.paragraphs
      // A single input paragraph with \\n creates multiple Pages paragraphs,
      // so we track the real index offset and apply formatting to all sub-paragraphs.
      let paraIdx = 0;
      for (let i = 0; i < params.paragraphs.length; i++) {
        const p = params.paragraphs[i];
        const nlCount = (p.text.match(/\\n/g) || []).length;
        let r, g, b;
        if (p.textColor !== undefined) {
          const hex = p.textColor;
          r = parseInt(hex.slice(1, 3), 16) * 257;
          g = parseInt(hex.slice(3, 5), 16) * 257;
          b = parseInt(hex.slice(5, 7), 16) * 257;
        }
        for (let j = 0; j <= nlCount; j++) {
          const para = doc.bodyText.paragraphs[paraIdx + j];
          if (p.fontSize !== undefined) para.size = p.fontSize;
          if (p.fontName !== undefined) para.font = p.fontName;
          if (r !== undefined) para.color = [r, g, b];
        }
        paraIdx += nlCount + 1;
      }

      if (params.filePath) {
        doc.save({ in: Path(params.filePath) });
        doc.close({ saving: "no" });
        const newDoc = app.open(Path(params.filePath));
        return JSON.stringify({ name: newDoc.name(), paragraphCount: params.paragraphs.length });
      }

      return JSON.stringify({ name: doc.name(), paragraphCount: params.paragraphs.length });
    `, {
      paragraphs,
      filePath: filePath ?? null,
    })),
  );
}
