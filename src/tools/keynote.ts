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

export function registerKeynoteTools(server: McpServer): void {
  // ── Presentation Management ──

  server.tool(
    "keynote_list_presentations",
    "List all open Keynote presentations",
    {},
    async () => handleJXA(() => runJXA<string[]>(`
      const app = Application("Keynote");
      const docs = app.documents();
      return JSON.stringify(docs.map(d => ({ name: d.name(), path: d.file() ? d.file().toString() : null })));
    `)),
  );

  server.tool(
    "keynote_create_presentation",
    "Create a new Keynote presentation (blank or with a theme)",
    {
      themeName: z.string().optional().describe("Theme name (optional, e.g. 'White', 'Black', 'Gradient')"),
    },
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
      filePath: z.string().describe("Absolute path to the .key file"),
    },
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
      filePath: z.string().optional().describe("File path to save to (for Save As)"),
    },
    async ({ documentName, filePath }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
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
    "keynote_export_presentation",
    "Export a Keynote presentation to PDF, PowerPoint (.pptx), HTML, or images",
    {
      documentName: z.string().describe("Name of the open presentation"),
      filePath: z.string().describe("Absolute path for the exported file"),
      format: z.enum(["PDF", "PowerPoint", "HTML", "images"]).describe("Export format"),
    },
    async ({ documentName, filePath, format }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);
      const formatMap = {
        "PDF": "Keynote PDF",
        "PowerPoint": "Microsoft PowerPoint",
        "HTML": "HTML",
        "images": "slide images",
      };
      const fmt = formatMap[params.format];
      app.export(doc, { to: Path(params.filePath), as: fmt });
      return JSON.stringify({ exported: true, path: params.filePath, format: params.format });
    `, { documentName, filePath, format })),
  );

  server.tool(
    "keynote_close_presentation",
    "Close a Keynote presentation",
    {
      documentName: z.string().describe("Name of the open presentation"),
      saving: z.enum(["yes", "no", "ask"]).optional().describe("Whether to save before closing"),
    },
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
    "keynote_add_slide",
    "Add a new slide to the presentation",
    {
      documentName: z.string().describe("Name of the open presentation"),
      masterSlideName: z.string().optional().describe("Master slide / layout name (e.g. 'Title & Subtitle', 'Blank')"),
      afterSlide: z.number().optional().describe("Insert after this slide number (1-based). Default: end."),
    },
    async ({ documentName, masterSlideName, afterSlide }) => handleJXA(() => runJXA<string>(`
      const app = Application("Keynote");
      const doc = app.documents.byName(params.documentName);

      const props = {};
      if (params.masterSlideName) {
        props.baseSlide = doc.masterSlides.byName(params.masterSlideName);
      }

      const slide = app.Slide(props);

      if (params.afterSlide !== null && params.afterSlide !== undefined) {
        doc.slides.splice(params.afterSlide, 0, slide);
      } else {
        doc.slides.push(slide);
      }

      return JSON.stringify({ slideNumber: doc.slides.length, added: true });
    `, { documentName, masterSlideName: masterSlideName ?? null, afterSlide: afterSlide ?? null })),
  );

  server.tool(
    "keynote_set_slide_title",
    "Set the title text of a slide",
    {
      documentName: z.string().describe("Name of the open presentation"),
      slideNumber: z.number().describe("Slide number (1-based)"),
      title: z.string().describe("Title text"),
    },
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
      slideNumber: z.number().describe("Slide number (1-based)"),
      body: z.string().describe("Body text (use newlines for bullet points)"),
    },
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
      slideNumber: z.number().describe("Slide number (1-based)"),
      filePath: z.string().describe("Absolute path to the image file"),
      x: z.number().optional().describe("X position in points"),
      y: z.number().optional().describe("Y position in points"),
      width: z.number().optional().describe("Width in points"),
      height: z.number().optional().describe("Height in points"),
    },
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
      slideNumber: z.number().describe("Slide number (1-based)"),
      shapeType: z.string().optional().describe("Shape type (e.g. 'rectangle', 'circle', 'rounded rectangle')"),
      text: z.string().optional().describe("Text content for the shape"),
      x: z.number().optional().describe("X position in points"),
      y: z.number().optional().describe("Y position in points"),
      width: z.number().optional().describe("Width in points (default: 200)"),
      height: z.number().optional().describe("Height in points (default: 100)"),
    },
    async ({ documentName, slideNumber, shapeType, text, x, y, width, height }) => handleJXA(() => runJXA<string>(`
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
    `, { documentName, slideNumber, shapeType: shapeType ?? null, text: text ?? null, x: x ?? null, y: y ?? null, width: width ?? 200, height: height ?? 100 })),
  );

  server.tool(
    "keynote_set_presenter_notes",
    "Set presenter notes for a slide",
    {
      documentName: z.string().describe("Name of the open presentation"),
      slideNumber: z.number().describe("Slide number (1-based)"),
      notes: z.string().describe("Presenter notes text"),
    },
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
      slideNumber: z.number().describe("Slide number (1-based)"),
      effect: z.string().describe("Transition effect name (e.g. 'dissolve', 'push', 'wipe', 'none')"),
      duration: z.number().optional().describe("Duration in seconds (default: 1.0)"),
    },
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
      fromSlide: z.number().optional().describe("Start from this slide number (1-based, default: 1)"),
    },
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
}
