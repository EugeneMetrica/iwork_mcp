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

describe("Keynote Integration", async () => {
  const available = await isAppAvailable("Keynote");
  if (!available) {
    console.log("⏭  Skipping Keynote tests — app not available");
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
          await call(ctx, "keynote_close_presentation", { documentName: docName, saving: "no" });
        } catch {}
      }
      await ctx.cleanup();
    }
  });

  it("creates a new presentation", async () => {
    const { json } = await call(ctx, "keynote_create_presentation");
    docName = json.name;
    assert.ok(docName, "Presentation should have a name");
    assert.ok(json.slideCount >= 1, "Should have at least one slide");
  });

  it("lists slides", async () => {
    const { json: slides } = await call(ctx, "keynote_list_slides", {
      documentName: docName,
    });
    assert.ok(Array.isArray(slides));
    assert.ok(slides.length >= 1);
    assert.equal(slides[0].slideNumber, 1);
  });

  it("adds a new slide", async () => {
    const { json } = await call(ctx, "keynote_add_slide", { documentName: docName });
    assert.ok(json.added);

    const { json: slides } = await call(ctx, "keynote_list_slides", {
      documentName: docName,
    });
    assert.ok(slides.length >= 2);
  });

  it("sets slide title and reads it back", async () => {
    const { json: setResult } = await call(ctx, "keynote_set_slide_title", {
      documentName: docName,
      slideNumber: 1,
      title: "Integration Test Title",
    });
    assert.ok(setResult.set);

    const { json: content } = await call(ctx, "keynote_get_slide_content", {
      documentName: docName,
      slideNumber: 1,
    });
    assert.equal(content.title, "Integration Test Title");
  });

  it("sets slide body and reads it back", async () => {
    const { json: setResult } = await call(ctx, "keynote_set_slide_body", {
      documentName: docName,
      slideNumber: 1,
      body: "Bullet one\nBullet two",
    });
    assert.ok(setResult.set);

    const { json: content } = await call(ctx, "keynote_get_slide_content", {
      documentName: docName,
      slideNumber: 1,
    });
    assert.ok(content.body.includes("Bullet one"));
    assert.ok(content.body.includes("Bullet two"));
  });

  it("sets presenter notes and reads them back", async () => {
    const { json: setResult } = await call(ctx, "keynote_set_presenter_notes", {
      documentName: docName,
      slideNumber: 1,
      notes: "Remember to pause here.",
    });
    assert.ok(setResult.set);

    const { json: content } = await call(ctx, "keynote_get_slide_content", {
      documentName: docName,
      slideNumber: 1,
    });
    assert.equal(content.presenterNotes, "Remember to pause here.");
  });

  // ── Delete slide ──

  it("deletes a slide", async () => {
    // Add an extra slide, then delete it
    await call(ctx, "keynote_add_slide", { documentName: docName });
    const { json: before } = await call(ctx, "keynote_list_slides", { documentName: docName });
    const countBefore = before.length;

    const { json } = await call(ctx, "keynote_delete_slide", {
      documentName: docName,
      slideNumber: countBefore,
    });
    assert.ok(json.deleted);
    assert.equal(json.remainingSlides, countBefore - 1);
  });

  // ── Duplicate slide ──

  it("duplicates a slide", async () => {
    const { json: before } = await call(ctx, "keynote_list_slides", { documentName: docName });
    const countBefore = before.length;

    const { json } = await call(ctx, "keynote_duplicate_slide", {
      documentName: docName,
      slideNumber: 1,
    });
    assert.ok(json.duplicated);
    assert.equal(json.totalSlides, countBefore + 1);

    // Clean up: delete the duplicate
    await call(ctx, "keynote_delete_slide", {
      documentName: docName,
      slideNumber: json.totalSlides,
    });
  });

  // ── Reorder slide ──

  it("reorders slides", async () => {
    // Ensure at least 3 slides
    await call(ctx, "keynote_add_slide", { documentName: docName });
    await call(ctx, "keynote_add_slide", { documentName: docName });

    // Set distinct titles to track
    await call(ctx, "keynote_set_slide_title", { documentName: docName, slideNumber: 1, title: "Slide A" });
    await call(ctx, "keynote_set_slide_title", { documentName: docName, slideNumber: 2, title: "Slide B" });

    // Move slide 2 to position 1
    const { json } = await call(ctx, "keynote_reorder_slide", {
      documentName: docName,
      fromSlideNumber: 2,
      toSlideNumber: 1,
    });
    assert.ok(json.moved);

    // Verify: the first slide should now be "Slide B"
    const { json: content } = await call(ctx, "keynote_get_slide_content", {
      documentName: docName,
      slideNumber: 1,
    });
    assert.equal(content.title, "Slide B");
  });

  // ── Export to PDF ──

  it("exports to PDF", async () => {
    const tmpPath = `/tmp/iwork_test_${suffix}.pdf`;
    const { json } = await call(ctx, "keynote_export_presentation", {
      documentName: docName,
      filePath: tmpPath,
      format: "PDF",
    });
    assert.ok(json.exported);
    assert.equal(json.format, "PDF");
  });

  // ── Error on nonexistent presentation ──

  it("returns isError for a nonexistent presentation", async () => {
    const result = await ctx.client.callTool({
      name: "keynote_list_slides",
      arguments: { documentName: "NoSuchPresentation_999" },
    });
    assert.equal(result.isError, true);
  });

  it("closes the presentation without saving", async () => {
    const { json } = await call(ctx, "keynote_close_presentation", {
      documentName: docName,
      saving: "no",
    });
    assert.ok(json.closed);
    docName = "";
  });
});
