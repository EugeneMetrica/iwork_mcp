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

export function registerKeynoteTools(server: McpServer): void {
  // ── Presentation Management ──

  server.tool(
    "keynote_list_presentations",
    "List all open Keynote presentations",
    {},
    ANNOTATIONS.readOnly,
    async () => handleJXA(() => runJXA<string[]>(`
      const app = Application("Keynote");
      const docs = app.documents();
      return JSON.stringify(docs.map(d => ({ name: d.name(), path: d.file() ? d.file().toString() : null })));
    `)),
  );

  server.tool(
    "keynote_list_themes",
    "List all available Keynote themes (e.g. White, Black, Gradient)",
    {},
    ANNOTATIONS.readOnly,
    async () => handleJXA(() => runJXA<string[]>(`
      const app = Application("Keynote");
      return JSON.stringify(app.themes().map(t => t.name()));
    `)),
  );

  server.tool(
    "keynote_create_presentation",
    "Create a new Keynote presentation (optionally with a theme — use keynote_list_themes to see available themes)",
    {
      themeName: z.string().optional().describe("Theme name (optional, e.g. 'White', 'Black', 'Gradient')"),
    },
    ANNOTATIONS.readWrite,
    async ({ themeName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      let doc;
      if (params.themeName) {
        doc = app.Document({ documentTheme: app.themes[params.themeName] });
        app.documents.push(doc);
      } else {
        doc = app.Document();
        app.documents.push(doc);
      }
      return JSON.stringify({ name: doc.name(), slideCount: doc.slides.length });
    `, { themeName: themeName ?? null })),
  );

  server.tool(
    "keynote_open_presentation",
    "Open a .key file from disk",
    {
      filePath: z.string().startsWith("/").describe("Absolute path to the .key file"),
    },
    ANNOTATIONS.readWrite,
    async ({ filePath }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.open(Path(params.filePath));
      return JSON.stringify({ name: doc.name(), slideCount: doc.slides.length });
    `, { filePath })),
  );

  server.tool(
    "keynote_save_presentation",
    "Save a Keynote presentation",
    {
      documentName: z.string().describe("Name of the open presentation"),
      filePath: z.string().startsWith("/").optional().describe("File path to save to (for Save As)"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, filePath }) => handleJXA(async () => {
      if (isCreatorStudio()) {
        if (filePath) {
          const newName = await creatorStudioSaveAs("Keynote", documentName, filePath);
          return JSON.stringify({ saved: true, name: newName });
        }
        return JSON.stringify({ saved: true, name: documentName });
      }
      return runJXA<string>(`
      const app = Application("Keynote");
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
    "keynote_export_presentation",
    "Export a Keynote presentation to PDF, PowerPoint (.pptx), HTML, or images",
    {
      documentName: z.string().describe("Name of the open presentation"),
      filePath: z.string().startsWith("/").describe("Absolute path for the exported file"),
      format: z.enum(["PDF", "PowerPoint", "HTML", "images"]).describe("Export format"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, filePath, format }) => handleJXA(async () => {
      if (isCreatorStudio() && format === "PDF") {
        await creatorStudioExportPDF("Keynote", documentName, filePath);
        return JSON.stringify({ exported: true, path: filePath, format: "PDF" });
      }
      return runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);
      const formatMap = {
        "PDF": "PDF",
        "PowerPoint": "Microsoft PowerPoint",
        "HTML": "HTML",
        "images": "slide images",
      };
      const fmt = formatMap[params.format];
      app.export(doc, { to: Path(params.filePath), as: fmt });
      return JSON.stringify({ exported: true, path: params.filePath, format: params.format });
    `, { documentName, filePath, format });
    }),
  );

  server.tool(
    "keynote_close_presentation",
    "Close a Keynote presentation",
    {
      documentName: z.string().describe("Name of the open presentation"),
      saving: z.enum(["yes", "no", "ask"]).optional().describe("Whether to save before closing"),
    },
    ANNOTATIONS.destructive,
    async ({ documentName, saving }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
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

  // ── Slide Tools ──

  server.tool(
    "keynote_list_slides",
    "List all slides in a presentation with their titles",
    {
      documentName: z.string().describe("Name of the open presentation"),
    },
    ANNOTATIONS.readOnly,
    async ({ documentName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);
      const slides = doc.slides();
      return JSON.stringify(slides.map((s, i) => {
        let title = "";
        try {
          const titleItem = s.defaultTitleItem();
          if (titleItem) title = titleItem.objectText();
        } catch(e) {}
        return { index: i, slideNumber: i + 1, title: title, skipped: s.skipped() };
      }));
    `, { documentName })),
  );

  server.tool(
    "keynote_get_slide_content",
    "Read all content from a slide: title, body, presenter notes, and list of items",
    {
      documentName: z.string().describe("Name of the open presentation"),
      slideNumber: z.number().int().min(1).describe("Slide number (1-based)"),
    },
    ANNOTATIONS.readOnly,
    async ({ documentName, slideNumber }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);
      const slide = doc.slides[params.slideNumber - 1];

      let title = "";
      try { const t = slide.defaultTitleItem(); if (t) title = t.objectText(); } catch(e) {}
      let body = "";
      try { const b = slide.defaultBodyItem(); if (b) body = b.objectText(); } catch(e) {}
      let notes = "";
      try { notes = slide.presenterNotes(); } catch(e) {}

      const textItems = [];
      try {
        const items = slide.textItems();
        for (let i = 0; i < items.length; i++) {
          textItems.push({ index: i, text: items[i].objectText(), width: items[i].width(), height: items[i].height() });
        }
      } catch(e) {}

      const images = [];
      try {
        const imgs = slide.images();
        for (let i = 0; i < imgs.length; i++) {
          images.push({ index: i, width: imgs[i].width(), height: imgs[i].height() });
        }
      } catch(e) {}

      const shapes = [];
      try {
        const shps = slide.shapes();
        for (let i = 0; i < shps.length; i++) {
          shapes.push({ index: i, text: shps[i].objectText(), width: shps[i].width(), height: shps[i].height() });
        }
      } catch(e) {}

      return JSON.stringify({ slideNumber: params.slideNumber, title, body, presenterNotes: notes, textItems, images, shapes });
    `, { documentName, slideNumber })),
  );

  server.tool(
    "keynote_delete_slide",
    "Delete a slide from the presentation",
    {
      documentName: z.string().describe("Name of the open presentation"),
      slideNumber: z.number().int().min(1).describe("Slide number to delete (1-based)"),
    },
    ANNOTATIONS.destructive,
    async ({ documentName, slideNumber }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);
      app.delete(doc.slides[params.slideNumber - 1]);
      return JSON.stringify({ deleted: true, slideNumber: params.slideNumber, remainingSlides: doc.slides.length });
    `, { documentName, slideNumber })),
  );

  server.tool(
    "keynote_duplicate_slide",
    "Duplicate an existing slide",
    {
      documentName: z.string().describe("Name of the open presentation"),
      slideNumber: z.number().int().min(1).describe("Slide number to duplicate (1-based)"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, slideNumber }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);
      app.duplicate(doc.slides[params.slideNumber - 1]);
      return JSON.stringify({ duplicated: true, totalSlides: doc.slides.length });
    `, { documentName, slideNumber })),
  );

  server.tool(
    "keynote_list_master_slides",
    "List all available master slide layouts in the current theme",
    {
      documentName: z.string().describe("Name of the open presentation"),
    },
    ANNOTATIONS.readOnly,
    async ({ documentName }) => handleJXA(() => runJXA<string>(`
      ObjC.import("Foundation");
      const script = $.NSAppleScript.alloc.initWithSource(
        'tell application "Keynote" to tell document "' + params.documentName.replace(/"/g, '\\\\"') + '" to return name of every master slide'
      );
      const errDict = Ref();
      const result = script.executeAndReturnError(errDict);
      if (!result) throw new Error("Failed to list master slides");
      const count = result.numberOfItems;
      const names = [];
      for (let i = 1; i <= count; i++) {
        names.push({ index: i - 1, name: result.descriptorAtIndex(i).stringValue.js });
      }
      return JSON.stringify(names);
    `, { documentName })),
  );

  server.tool(
    "keynote_reorder_slide",
    "Move a slide from one position to another",
    {
      documentName: z.string().describe("Name of the open presentation"),
      fromSlideNumber: z.number().int().min(1).describe("Current slide number (1-based)"),
      toSlideNumber: z.number().int().min(1).describe("Target slide number (1-based)"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, fromSlideNumber, toSlideNumber }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);
      const slide = doc.slides[params.fromSlideNumber - 1];
      app.move(slide, { to: doc.slides[params.toSlideNumber - 1] });
      return JSON.stringify({ moved: true, from: params.fromSlideNumber, to: params.toSlideNumber, totalSlides: doc.slides.length });
    `, { documentName, fromSlideNumber, toSlideNumber })),
  );

  server.tool(
    "keynote_skip_slide",
    "Mark a slide as skipped (hidden) or unskipped",
    {
      documentName: z.string().describe("Name of the open presentation"),
      slideNumber: z.number().int().min(1).describe("Slide number (1-based)"),
      skipped: z.boolean().describe("True to skip/hide, false to unskip/show"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, slideNumber, skipped }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);
      doc.slides[params.slideNumber - 1].skipped = params.skipped;
      return JSON.stringify({ slideNumber: params.slideNumber, skipped: params.skipped });
    `, { documentName, slideNumber, skipped })),
  );

  server.tool(
    "keynote_stop_slideshow",
    "Stop a running slideshow",
    {
      documentName: z.string().describe("Name of the open presentation"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      app.stop(app.documents.byName(params.documentName));
      return JSON.stringify({ stopped: true });
    `, { documentName })),
  );

  server.tool(
    "keynote_add_slide",
    "Add a new slide to the presentation",
    {
      documentName: z.string().describe("Name of the open presentation"),
      masterSlideName: z.string().optional().describe("Master slide / layout name (e.g. 'Title & Subtitle', 'Blank')"),
      afterSlide: z.number().int().min(1).optional().describe("Insert after this slide number (1-based). Default: end."),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, masterSlideName, afterSlide }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);

      if (params.masterSlideName) {
        // JXA masterSlides bridge is broken — use AppleScript via ObjC
        ObjC.import("Foundation");
        const docName = params.documentName.replace(/"/g, '\\\\"');
        const masterName = params.masterSlideName.replace(/"/g, '\\\\"');
        let asCode;
        if (params.afterSlide !== null && params.afterSlide !== undefined) {
          asCode = 'tell application "Keynote" to tell document "' + docName + '" to make new slide after slide ' + params.afterSlide + ' with properties {base slide:master slide "' + masterName + '"}';
        } else {
          asCode = 'tell application "Keynote" to tell document "' + docName + '" to make new slide with properties {base slide:master slide "' + masterName + '"}';
        }
        const script = $.NSAppleScript.alloc.initWithSource(asCode);
        const errDict = Ref();
        const result = script.executeAndReturnError(errDict);
        if (!result) {
          const errInfo = ObjC.deepUnwrap(errDict[0]);
          throw new Error(errInfo.NSAppleScriptErrorBriefMessage || "Failed to add slide");
        }
      } else {
        const slide = app.Slide({});
        if (params.afterSlide !== null && params.afterSlide !== undefined) {
          doc.slides.splice(params.afterSlide, 0, slide);
        } else {
          doc.slides.push(slide);
        }
      }

      const insertedAt = (params.afterSlide !== null && params.afterSlide !== undefined) ? params.afterSlide + 1 : doc.slides.length;
      return JSON.stringify({ slideNumber: insertedAt, added: true });
    `, { documentName, masterSlideName: masterSlideName ?? null, afterSlide: afterSlide ?? null })),
  );

  server.tool(
    "keynote_set_slide_title",
    "Set the title text of a slide",
    {
      documentName: z.string().describe("Name of the open presentation"),
      slideNumber: z.number().int().min(1).describe("Slide number (1-based)"),
      title: z.string().describe("Title text"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, slideNumber, title }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);
      const slide = doc.slides[params.slideNumber - 1];
      const titleItem = slide.defaultTitleItem();
      titleItem.objectText = params.title;
      return JSON.stringify({ slideNumber: params.slideNumber, title: params.title, set: true });
    `, { documentName, slideNumber, title })),
  );

  server.tool(
    "keynote_set_slide_body",
    "Set the body text of a slide (bullet points separated by newlines)",
    {
      documentName: z.string().describe("Name of the open presentation"),
      slideNumber: z.number().int().min(1).describe("Slide number (1-based)"),
      body: z.string().describe("Body text (use newlines for bullet points)"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, slideNumber, body }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);
      const slide = doc.slides[params.slideNumber - 1];
      const bodyItem = slide.defaultBodyItem();
      bodyItem.objectText = params.body;
      return JSON.stringify({ slideNumber: params.slideNumber, set: true });
    `, { documentName, slideNumber, body })),
  );

  server.tool(
    "keynote_add_image_to_slide",
    "Add an image to a slide",
    {
      documentName: z.string().describe("Name of the open presentation"),
      slideNumber: z.number().int().min(1).describe("Slide number (1-based)"),
      filePath: z.string().startsWith("/").describe("Absolute path to the image file"),
      x: z.number().optional().describe("X position in points"),
      y: z.number().optional().describe("Y position in points"),
      width: z.number().positive().optional().describe("Width in points"),
      height: z.number().positive().optional().describe("Height in points"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, slideNumber, filePath, x, y, width, height }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);
      const slide = doc.slides[params.slideNumber - 1];
      const props = { file: Path(params.filePath) };
      if (params.x !== null) props.position = [params.x, params.y || 0];
      if (params.width !== null) props.width = params.width;
      if (params.height !== null) props.height = params.height;
      const image = app.Image(props);
      slide.images.push(image);
      return JSON.stringify({ added: true, slideNumber: params.slideNumber });
    `, { documentName, slideNumber, filePath, x: x ?? null, y: y ?? null, width: width ?? null, height: height ?? null })),
  );

  server.tool(
    "keynote_add_shape",
    "Add a shape with text to a slide",
    {
      documentName: z.string().describe("Name of the open presentation"),
      slideNumber: z.number().int().min(1).describe("Slide number (1-based)"),
      text: z.string().optional().describe("Text content for the shape"),
      x: z.number().optional().describe("X position in points"),
      y: z.number().optional().describe("Y position in points"),
      width: z.number().positive().optional().describe("Width in points (default: 200)"),
      height: z.number().positive().optional().describe("Height in points (default: 100)"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, slideNumber, text, x, y, width, height }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);
      const slide = doc.slides[params.slideNumber - 1];
      const props = {};
      if (params.x !== null && params.y !== null) props.position = [params.x, params.y];
      if (params.width !== null) props.width = params.width;
      if (params.height !== null) props.height = params.height;
      const shape = app.Shape(props);
      slide.shapes.push(shape);
      if (params.text) {
        shape.objectText = params.text;
      }
      return JSON.stringify({ added: true, slideNumber: params.slideNumber });
    `, { documentName, slideNumber, text: text ?? null, x: x ?? null, y: y ?? null, width: width ?? 200, height: height ?? 100 })),
  );

  server.tool(
    "keynote_set_presenter_notes",
    "Set presenter notes for a slide",
    {
      documentName: z.string().describe("Name of the open presentation"),
      slideNumber: z.number().int().min(1).describe("Slide number (1-based)"),
      notes: z.string().describe("Presenter notes text"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, slideNumber, notes }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);
      const slide = doc.slides[params.slideNumber - 1];
      slide.presenterNotes = params.notes;
      return JSON.stringify({ slideNumber: params.slideNumber, set: true });
    `, { documentName, slideNumber, notes })),
  );

  server.tool(
    "keynote_set_transition",
    "Set a transition effect on a slide",
    {
      documentName: z.string().describe("Name of the open presentation"),
      slideNumber: z.number().int().min(1).describe("Slide number (1-based)"),
      effect: z.string().describe("Transition effect name (e.g. 'dissolve', 'push', 'wipe', 'none')"),
      duration: z.number().positive().optional().describe("Duration in seconds (default: 1.0)"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, slideNumber, effect, duration }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);
      const slide = doc.slides[params.slideNumber - 1];
      const transition = {
        transitionEffect: params.effect,
        transitionDuration: params.duration || 1.0,
      };
      slide.transitionProperties = transition;
      return JSON.stringify({ slideNumber: params.slideNumber, effect: params.effect, set: true });
    `, { documentName, slideNumber, effect, duration: duration ?? null })),
  );

  server.tool(
    "keynote_start_slideshow",
    "Start playing the presentation slideshow",
    {
      documentName: z.string().describe("Name of the open presentation"),
      fromSlide: z.number().int().min(1).optional().describe("Start from this slide number (1-based, default: 1)"),
    },
    ANNOTATIONS.readWrite,
    async ({ documentName, fromSlide }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);
      if (params.fromSlide) {
        doc.slides[params.fromSlide - 1].skipped = false;
        app.startFrom(doc.slides[params.fromSlide - 1]);
      } else {
        app.start(doc);
      }
      return JSON.stringify({ playing: true });
    `, { documentName, fromSlide: fromSlide ?? null })),
  );

  // ── Compound Tool ──

  server.tool(
    "keynote_create_presentation_with_slides",
    "Create a Keynote presentation with multiple fully-configured slides in one call (theme, layout, title, body, notes, transitions)",
    {
      themeName: z.string().optional().describe("Theme name (e.g. 'White', 'Black', 'Gradient')"),
      slides: z.array(z.object({
        masterSlideName: z.string().optional().describe("Master slide layout (e.g. 'Title & Subtitle', 'Bullets', 'Blank')"),
        title: z.string().optional().describe("Slide title text"),
        body: z.string().optional().describe("Slide body text (use newlines for bullet points)"),
        presenterNotes: z.string().optional().describe("Presenter notes"),
        transition: z.object({
          effect: z.string().describe("Transition effect (e.g. 'dissolve', 'push', 'wipe', 'none')"),
          duration: z.number().positive().optional().describe("Duration in seconds"),
        }).optional().describe("Slide transition"),
      })).min(1).describe("Array of slides to create"),
    },
    ANNOTATIONS.readWrite,
    async ({ themeName, slides }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");

      // Create presentation
      let doc;
      if (params.themeName) {
        doc = app.Document({ documentTheme: app.themes[params.themeName] });
        app.documents.push(doc);
      } else {
        doc = app.Document();
        app.documents.push(doc);
      }

      ObjC.import("Foundation");
      const docName = doc.name().replace(/"/g, '\\\\"');
      const results = [];

      // New presentations always have 1 auto-generated slide.
      // Reuse it for the first user slide, then add the rest.
      for (let i = 0; i < params.slides.length; i++) {
        const s = params.slides[i];

        if (i === 0) {
          // Reuse the existing first slide — but if a master slide is requested,
          // add the new slide first, then delete the default one.
          if (s.masterSlideName) {
            const masterName = s.masterSlideName.replace(/"/g, '\\\\"');
            const asCode = 'tell application "Keynote" to tell document "' + docName + '" to make new slide with properties {base slide:master slide "' + masterName + '"}';
            const script = $.NSAppleScript.alloc.initWithSource(asCode);
            const errDict = Ref();
            const result = script.executeAndReturnError(errDict);
            if (!result) {
              const errInfo = ObjC.deepUnwrap(errDict[0]);
              throw new Error("Slide " + (i + 1) + ": " + (errInfo.NSAppleScriptErrorBriefMessage || "Failed to add slide"));
            }
            // Delete the original default slide (now at index 0)
            app.delete(doc.slides[0]);
          }
          // else: reuse the auto-generated slide as-is
        } else {
          // Add subsequent slides
          if (s.masterSlideName) {
            const masterName = s.masterSlideName.replace(/"/g, '\\\\"');
            const asCode = 'tell application "Keynote" to tell document "' + docName + '" to make new slide with properties {base slide:master slide "' + masterName + '"}';
            const script = $.NSAppleScript.alloc.initWithSource(asCode);
            const errDict = Ref();
            const result = script.executeAndReturnError(errDict);
            if (!result) {
              const errInfo = ObjC.deepUnwrap(errDict[0]);
              throw new Error("Slide " + (i + 1) + ": " + (errInfo.NSAppleScriptErrorBriefMessage || "Failed to add slide"));
            }
          } else {
            doc.slides.push(app.Slide({}));
          }
        }

        const slide = doc.slides[doc.slides.length - 1];

        // Set title
        if (s.title) {
          try { slide.defaultTitleItem().objectText = s.title; } catch(e) {}
        }

        // Set body
        if (s.body) {
          try { slide.defaultBodyItem().objectText = s.body; } catch(e) {}
        }

        // Set presenter notes
        if (s.presenterNotes) {
          slide.presenterNotes = s.presenterNotes;
        }

        // Set transition
        if (s.transition) {
          slide.transitionProperties = {
            transitionEffect: s.transition.effect,
            transitionDuration: s.transition.duration || 1.0,
          };
        }

        let title = "";
        try { const t = slide.defaultTitleItem(); if (t) title = t.objectText(); } catch(e) {}
        let hasBody = false;
        try { const b = slide.defaultBodyItem(); if (b) hasBody = b.objectText().length > 0; } catch(e) {}
        let hasNotes = false;
        try { hasNotes = slide.presenterNotes().length > 0; } catch(e) {}

        results.push({ slideNumber: i + 1, title, hasBody, hasNotes });
      }

      return JSON.stringify({ name: doc.name(), slideCount: doc.slides.length, slides: results });
    `, { themeName: themeName ?? null, slides })),
  );
}
