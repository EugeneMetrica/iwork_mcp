import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
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
  const tmpFiles: string[] = [];

  before(async () => {
    ctx = await createTestServer();
  });

  after(async () => {
    if (ctx) {
      // Close ALL open Keynote presentations (catches leaked test docs)
      try {
        const { json: docs } = await call(ctx, "keynote_list_presentations");
        for (const doc of docs as Array<{ name: string }>) {
          try { await call(ctx, "keynote_close_presentation", { documentName: doc.name, saving: "no" }); } catch {}
        }
      } catch {}
      // Clean up temp files
      for (const f of tmpFiles) {
        try { unlinkSync(f); } catch {}
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

  // ── Layout tools ──

  it("positions a shape on a slide", async () => {
    // Add a fresh slide with shapes for layout tests
    await call(ctx, "keynote_add_slide", { documentName: docName });
    const { json: slides } = await call(ctx, "keynote_list_slides", { documentName: docName });
    const layoutSlide = slides.length;

    // Add 3 shapes with known positions
    await call(ctx, "keynote_add_shape", {
      documentName: docName, slideNumber: layoutSlide, text: "Shape A",
      x: 50, y: 50, width: 100, height: 80,
    });

    // Position the shape we just added (index 0 on this fresh slide)
    const { json } = await call(ctx, "keynote_position_item", {
      documentName: docName,
      slideNumber: layoutSlide,
      itemType: "shape",
      itemIndex: 0,
      x: 200,
      y: 300,
      width: 150,
    });
    assert.ok(json.positioned);
    assert.ok(Math.abs(json.x - 200) < 2, `Expected x~200, got ${json.x}`);
    assert.ok(Math.abs(json.y - 300) < 2, `Expected y~300, got ${json.y}`);
    assert.equal(json.width, 150);

    // Add two more shapes for align/distribute tests
    await call(ctx, "keynote_add_shape", {
      documentName: docName, slideNumber: layoutSlide, text: "Shape B",
      x: 100, y: 100, width: 80, height: 60,
    });
    await call(ctx, "keynote_add_shape", {
      documentName: docName, slideNumber: layoutSlide, text: "Shape C",
      x: 300, y: 200, width: 80, height: 60,
    });

    // Test align
    const { json: alignResult } = await call(ctx, "keynote_align_items", {
      documentName: docName,
      slideNumber: layoutSlide,
      items: [
        { itemType: "shape", itemIndex: 0 },
        { itemType: "shape", itemIndex: 1 },
        { itemType: "shape", itemIndex: 2 },
      ],
      alignment: "left",
    });
    assert.ok(alignResult.aligned);
    assert.equal(alignResult.itemCount, 3);

    // Test distribute
    const { json: distResult } = await call(ctx, "keynote_distribute_items", {
      documentName: docName,
      slideNumber: layoutSlide,
      items: [
        { itemType: "shape", itemIndex: 0 },
        { itemType: "shape", itemIndex: 1 },
        { itemType: "shape", itemIndex: 2 },
      ],
      direction: "vertical",
    });
    assert.ok(distResult.distributed);
    assert.equal(distResult.itemCount, 3);
  });

  // ── Shape formatting tools ──

  it("reads and formats a shape", async () => {
    // Add a slide with a shape for formatting tests
    await call(ctx, "keynote_add_slide", { documentName: docName });
    const { json: slides } = await call(ctx, "keynote_list_slides", { documentName: docName });
    const fmtSlide = slides.length;

    await call(ctx, "keynote_add_shape", {
      documentName: docName, slideNumber: fmtSlide, text: "Format me",
      x: 100, y: 100, width: 200, height: 100,
    });

    const { json: info } = await call(ctx, "keynote_get_shape_info", {
      documentName: docName,
      slideNumber: fmtSlide,
      shapeIndex: 0,
    });
    assert.ok(info.width > 0);
    assert.ok(info.opacity !== undefined);
    assert.ok(info.text !== undefined);

    const { json: fmtResult } = await call(ctx, "keynote_format_shape", {
      documentName: docName,
      slideNumber: fmtSlide,
      shapeIndex: 0,
      format: { opacity: 75, rotation: 15, fontName: "HelveticaNeue-Bold", fontSize: 18 },
    });
    assert.ok(fmtResult.formatted);

    // Verify
    const { json: after } = await call(ctx, "keynote_get_shape_info", {
      documentName: docName,
      slideNumber: fmtSlide,
      shapeIndex: 0,
    });
    assert.equal(after.opacity, 75);
    assert.equal(after.rotation, 15);
  });

  // ── Export to PDF ──

  it("exports to PDF", async () => {
    const tmpPath = `/tmp/iwork_test_${suffix}.pdf`;
    tmpFiles.push(tmpPath);
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

  // ── Compound tool ──

  it("creates a presentation with multiple slides in one call", async () => {
    const { json } = await call(ctx, "keynote_create_presentation_with_slides", {
      slides: [
        {
          title: "Welcome",
          body: "First slide body",
          presenterNotes: "Greet the audience",
          transition: { effect: "dissolve", duration: 1.5 },
        },
        {
          title: "Agenda",
          body: "Item 1\nItem 2\nItem 3",
          presenterNotes: "Walk through agenda",
        },
      ],
    });
    const compoundDocName = json.name;
    assert.ok(compoundDocName);
    assert.equal(json.slideCount, 2);
    assert.equal(json.slides.length, 2);
    assert.equal(json.slides[0].slideNumber, 1);
    assert.equal(json.slides[0].title, "Welcome");
    assert.ok(json.slides[0].hasNotes);
    assert.equal(json.slides[1].slideNumber, 2);
    assert.equal(json.slides[1].title, "Agenda");
    assert.ok(json.slides[1].hasBody);
    assert.ok(json.slides[1].hasNotes);

    // Verify via get_slide_content
    const { json: slide1 } = await call(ctx, "keynote_get_slide_content", {
      documentName: compoundDocName,
      slideNumber: 1,
    });
    assert.equal(slide1.title, "Welcome");
    assert.equal(slide1.presenterNotes, "Greet the audience");

    // Clean up
    await call(ctx, "keynote_close_presentation", { documentName: compoundDocName, saving: "no" });
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
