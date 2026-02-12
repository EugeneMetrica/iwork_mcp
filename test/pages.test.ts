import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTestServer, type TestContext } from "./helpers/server.js";
import { isAppAvailable } from "./helpers/app-check.js";

async function call(ctx: TestContext, name: string, args: Record<string, unknown> = {}) {
  const result = await ctx.client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = null; }
  return { text, json, isError: result.isError };
}

describe("Pages Integration", async () => {
  const available = await isAppAvailable("Pages");
  if (!available) {
    console.log("⏭  Skipping Pages tests — app not available");
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
      if (docName) {
        try {
          await call(ctx, "pages_close_document", { documentName: docName, saving: "no" });
        } catch {}
      }
      await ctx.cleanup();
    }
  });

  it("creates a document with formatted content", async () => {
    const { json } = await call(ctx, "pages_create_document_with_content", {
      paragraphs: [
        { text: "Test Title", fontSize: 24, fontName: "HelveticaNeue-Bold" },
        { text: "This is body text for testing.", fontSize: 12 },
        { text: "A third paragraph.", fontSize: 12 },
      ],
    });
    docName = json.name;
    assert.ok(docName, "Document should have a name");
    assert.equal(json.paragraphCount, 3);
  });

  it("reads body text", async () => {
    const { json } = await call(ctx, "pages_get_body_text", { documentName: docName });
    assert.ok(json.text.includes("Test Title"));
    assert.ok(json.text.includes("body text for testing"));
    assert.ok(json.text.includes("third paragraph"));
  });

  it("reads paragraphs with formatting info", async () => {
    const { json: paragraphs } = await call(ctx, "pages_get_paragraphs", {
      documentName: docName,
    });
    assert.ok(Array.isArray(paragraphs));
    assert.ok(paragraphs.length >= 3);
    assert.ok(paragraphs[0].text.includes("Test Title"));
  });

  it("appends text", async () => {
    const { json } = await call(ctx, "pages_add_text", {
      documentName: docName,
      text: "Appended paragraph.\n",
    });
    assert.ok(json.appended);

    const { json: body } = await call(ctx, "pages_get_body_text", { documentName: docName });
    assert.ok(body.text.includes("Appended paragraph"));
  });

  it("replaces text", async () => {
    const { json } = await call(ctx, "pages_replace_text", {
      documentName: docName,
      find: "Appended paragraph.",
      replace: "Replaced paragraph.",
    });
    assert.ok(json.replacements >= 1);

    const { json: body } = await call(ctx, "pages_get_body_text", { documentName: docName });
    assert.ok(body.text.includes("Replaced paragraph"));
    assert.ok(!body.text.includes("Appended paragraph"));
  });

  // ── Format text ──

  it("formats a paragraph", async () => {
    const { json } = await call(ctx, "pages_format_text", {
      documentName: docName,
      paragraphIndex: 0,
      format: { fontName: "Georgia-Bold", fontSize: 28, textColor: "#FF0000" },
    });
    assert.ok(json.formatted);

    const { json: paragraphs } = await call(ctx, "pages_get_paragraphs", { documentName: docName });
    const first = paragraphs[0];
    assert.equal(first.font, "Georgia-Bold");
    assert.equal(first.size, 28);
    // Color roundtrip is lossy due to JXA color space conversion — verify it's approximately red
    assert.ok(first.color, "color should be present");
    const r = parseInt(first.color.slice(1, 3), 16);
    const g = parseInt(first.color.slice(3, 5), 16);
    const b = parseInt(first.color.slice(5, 7), 16);
    assert.ok(r > 200, `red channel ${r} should be high`);
    assert.ok(g < 20, `green channel ${g} should be low`);
    assert.ok(b < 20, `blue channel ${b} should be low`);
  });

  // ── Insert text at position ──

  it("inserts text at beginning and middle", async () => {
    // Insert at beginning (afterParagraph = -1)
    const { json: r1 } = await call(ctx, "pages_insert_text_at", {
      documentName: docName,
      text: "Inserted at beginning.\n",
      afterParagraph: -1,
    });
    assert.ok(r1.inserted);

    const { json: body1 } = await call(ctx, "pages_get_body_text", { documentName: docName });
    const lines1 = body1.text.split("\n").filter((l: string) => l.length > 0);
    assert.equal(lines1[0], "Inserted at beginning.");

    // Insert after paragraph 1 (middle)
    const { json: r2 } = await call(ctx, "pages_insert_text_at", {
      documentName: docName,
      text: "Inserted in middle.\n",
      afterParagraph: 1,
    });
    assert.ok(r2.inserted);

    const { json: body2 } = await call(ctx, "pages_get_body_text", { documentName: docName });
    const lines2 = body2.text.split("\n").filter((l: string) => l.length > 0);
    assert.equal(lines2[2], "Inserted in middle.");
  });

  // ── Delete text ──

  it("deletes a paragraph by index", async () => {
    // Get current paragraphs to know what we're deleting
    const { json: before } = await call(ctx, "pages_get_paragraphs", { documentName: docName });
    const countBefore = before.length;
    const deletedText = before[0].text;

    const { json } = await call(ctx, "pages_delete_text", {
      documentName: docName,
      paragraphIndex: 0,
    });
    assert.ok(json.deleted);

    const { json: body } = await call(ctx, "pages_get_body_text", { documentName: docName });
    assert.ok(!body.text.startsWith(deletedText));

    const { json: afterParas } = await call(ctx, "pages_get_paragraphs", { documentName: docName });
    assert.ok(afterParas.length < countBefore);
  });

  // ── Export to PDF ──

  it("exports to PDF", async () => {
    const tmpPath = `/tmp/iwork_test_${suffix}.pdf`;
    const { json } = await call(ctx, "pages_export_document", {
      documentName: docName,
      filePath: tmpPath,
      format: "PDF",
    }) as { json: { exported: boolean; format: string } };
    assert.ok(json.exported);
    assert.equal(json.format, "PDF");
  });

  // ── Save/close/reopen cycle ──

  it("saves, closes, and reopens a document", async () => {
    const tmpPath = `/tmp/iwork_test_reopen_${suffix}.pages`;

    const { json: saveResult } = await call(ctx, "pages_save_document", {
      documentName: docName,
      filePath: tmpPath,
    }) as { json: { saved: boolean; name: string } };
    assert.ok(saveResult.saved);
    docName = saveResult.name;

    await call(ctx, "pages_close_document", { documentName: docName, saving: "no" });

    const { json: openResult } = await call(ctx, "pages_open_document", { filePath: tmpPath }) as { json: { name: string } };
    docName = openResult.name;

    const { json: body } = await call(ctx, "pages_get_body_text", { documentName: docName }) as { json: { text: string } };
    assert.ok(body.text.includes("Test Title"));
  });

  // ── Error on invalid document ──

  it("returns isError for a nonexistent document", async () => {
    const result = await ctx.client.callTool({
      name: "pages_get_body_text",
      arguments: { documentName: "NoSuchDocument_999" },
    });
    assert.equal(result.isError, true);
  });

  it("closes the document without saving", async () => {
    const { json } = await call(ctx, "pages_close_document", {
      documentName: docName,
      saving: "no",
    });
    assert.ok(json.closed);
    docName = "";
  });
});
