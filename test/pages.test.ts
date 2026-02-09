import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTestServer, type TestContext } from "./helpers/server.js";
import { isAppAvailable } from "./helpers/app-check.js";

async function call(ctx: TestContext, name: string, args: Record<string, unknown> = {}) {
  const result = await ctx.client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  return { text, json: JSON.parse(text), isError: result.isError };
}

describe("Pages Integration", async () => {
  const available = await isAppAvailable("Pages");
  if (!available) {
    console.log("⏭  Skipping Pages tests — app not available");
    return;
  }

  let ctx: TestContext;
  let docName: string;

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

  it("closes the document without saving", async () => {
    const { json } = await call(ctx, "pages_close_document", {
      documentName: docName,
      saving: "no",
    });
    assert.ok(json.closed);
    docName = "";
  });
});
