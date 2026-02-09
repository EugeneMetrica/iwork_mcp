import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTestServer, type TestContext } from "./helpers/server.js";
import { isAppAvailable } from "./helpers/app-check.js";

async function call(ctx: TestContext, name: string, args: Record<string, unknown> = {}) {
  const result = await ctx.client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  return { text, json: JSON.parse(text), isError: result.isError };
}

describe("Keynote Integration", async () => {
  const available = await isAppAvailable("Keynote");
  if (!available) {
    console.log("⏭  Skipping Keynote tests — app not available");
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

  it("closes the presentation without saving", async () => {
    const { json } = await call(ctx, "keynote_close_presentation", {
      documentName: docName,
      saving: "no",
    });
    assert.ok(json.closed);
    docName = "";
  });
});
