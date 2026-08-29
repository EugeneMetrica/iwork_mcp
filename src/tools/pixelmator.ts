import { existsSync, copyFileSync, mkdirSync, statSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runJXA } from "../jxa.js";
import { ANNOTATIONS } from "../annotations.js";
import { handleJXA, AS_LITERAL_JXA_HELPER, TIMEOUT_CREATE, TIMEOUT_EXPORT } from "../handle-jxa.js";

// ── Bridge choice (task 1.3 probe) ─────────────────────────────────────────
// Operations run as AppleScript source through the NSAppleScript-inside-JXA
// bridge below, using the Aeroflot pixelmator_ops.py phrasings (proven against
// Pixelmator Pro 3.8). Plain-JXA object specifiers are used only for document
// enumeration, where they are proven responsive. NOTE: document opening
// requires a window-capable session — with the macOS session locked the serial
// Apple event queue jams on `open` and every later event times out.

const APP = "Pixelmator Pro";
const DEFAULT_BUNDLE = "/Applications/Pixelmator Pro.app";

// ── Missing-app seam (injectable for unit tests) ───────────────────────────
const defaultDetector = (): boolean => existsSync(DEFAULT_BUNDLE);
let appDetector: () => boolean = defaultDetector;
export function setPixelmatorDetectorForTests(fn: (() => boolean) | undefined): void {
  appDetector = fn ?? defaultDetector;
}
function requireApp(): void {
  if (!appDetector()) {
    throw new Error("Pixelmator Pro is not installed. Install it from the Mac App Store (com.pixelmatorteam.pixelmator.x), then retry.");
  }
}

// ── Colour math (pure, unit-tested) ────────────────────────────────────────
export interface Rgb8 { r: number; g: number; b: number }

export function hexToRgb8(hex: string): Rgb8 {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error(`Invalid hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function rgb8ToRgb16({ r, g, b }: Rgb8): [number, number, number] {
  return [r * 257, g * 257, b * 257];
}

export function rgb8ToHex({ r, g, b }: Rgb8): string {
  const to2 = (v: number) => v.toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase();
}

function srgbToLab({ r, g, b }: Rgb8): [number, number, number] {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const R = lin(r), G = lin(g), B = lin(b);
  let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  X = f(X); Z = f(Z);
  const fy = f(Y);
  return [116 * fy - 16, 500 * (f(X) - fy), 200 * (fy - f(Z))];
}

/** CIE ΔE-2000 between two sRGB colours (kL = kC = kH = 1). */
export function deltaE2000(a: Rgb8, b: Rgb8): number {
  const [L1, A1, B1] = srgbToLab(a);
  const [L2, A2, B2] = srgbToLab(b);
  const C1 = Math.hypot(A1, B1), C2 = Math.hypot(A2, B2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * A1, a2p = (1 + G) * A2;
  const C1p = Math.hypot(a1p, B1), C2p = Math.hypot(a2p, B2);
  const hue = (x: number, y: number): number => {
    if (x === 0 && y === 0) return 0;
    const deg = (Math.atan2(y, x) * 180) / Math.PI;
    return deg < 0 ? deg + 360 : deg;
  };
  const h1p = hue(a1p, B1), h2p = hue(a2p, B2);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    else hbp = (h1p + h2p) / 2;
  }
  const T = 1 - 0.17 * Math.cos(((hbp - 30) * Math.PI) / 180) + 0.24 * Math.cos((2 * hbp * Math.PI) / 180)
    + 0.32 * Math.cos(((3 * hbp + 6) * Math.PI) / 180) - 0.20 * Math.cos(((4 * hbp - 63) * Math.PI) / 180);
  const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin((2 * dTheta * Math.PI) / 180) * Rc;
  return Math.sqrt(
    Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2)
    + Rt * (dCp / Sc) * (dHp / Sh),
  );
}

export function rgbEuclid(a: Rgb8, b: Rgb8): number {
  return Math.sqrt(Math.pow(a.r - b.r, 2) + Math.pow(a.g - b.g, 2) + Math.pow(a.b - b.b, 2));
}

// ── AppleScript plumbing ───────────────────────────────────────────────────
const PAS_HELPERS = `
  ObjC.import("Foundation");
  ${AS_LITERAL_JXA_HELPER}
  function osType(s) { let n = 0; for (let i = 0; i < 4; i++) n = n * 256 + s.charCodeAt(i); return n; }
  function descToJS(d) {
    const t = d.descriptorType;
    if (t === osType("msng")) return null;
    if (t === osType("doub")) return d.doubleValue;
    if (t === osType("long")) return d.int32Value;
    if (t === osType("bool")) return d.booleanValue;
    if (t === osType("true")) return true;
    if (t === osType("fals")) return false;
    if (t === osType("list")) {
      const arr = [];
      for (let i = 1; i <= d.numberOfItems; i++) arr.push(descToJS(d.descriptorAtIndex(i)));
      return arr;
    }
    const s = d.stringValue;
    return (s && !s.isNil()) ? s.js : null;
  }
  function runAS(src) {
    const script = $.NSAppleScript.alloc.initWithSource(src);
    const err = $();
    const result = script.executeAndReturnError(err);
    if (!result || (result.isNil && result.isNil())) {
      const errInfo = ObjC.deepUnwrap(err) || {};
      throw new Error(errInfo.NSAppleScriptErrorBriefMessage || errInfo.NSAppleScriptErrorMessage || "AppleScript execution failed");
    }
    return result;
  }
`;

/** Run AppleScript (Aeroflot pixelmator_ops phrasings) and convert a list result to JS. */
async function runASJXA(src: string, timeout: number): Promise<unknown> {
  // runJXA already parses the osascript stdout JSON (JSON string of descToJS
  // output) with a raw-string fallback; parsing it a second time would only
  // mangle it (String(array) drops brackets/quotes).
  return runJXA(
    `${PAS_HELPERS}\nreturn JSON.stringify(descToJS(runAS(${JSON.stringify(src)})));`,
    undefined,
    { timeout },
  );
}

const DOC_EXT = /\.(png|jpeg|jpg|tiff|heic|webp|gif|bmp|pxd|psd)$/i;

/** Fast document list via plain JXA object specifiers (immune to the open-reply stall). */
async function listDocNames(): Promise<string[]> {
  const parsed: unknown = await runJXA(
    `return JSON.stringify(Application("${APP}").documents().map(d => d.name()));`,
    undefined,
    { timeout: 10_000 },
  );
  const list = Array.isArray(parsed) ? parsed : JSON.parse(String(parsed)) as unknown[];
  return list.filter((n): n is string => typeof n === "string");
}

/**
 * Resolve a possibly-stale document name against the live document list.
 * Pixelmator autosave drifts names ("X.png" becomes "X", a duplicate open of
 * the same file becomes "X 2", autosaved copies become "X.pxd"), so a name
 * captured at open time can be stale by the next call. Exact match wins,
 * then the .pxd variant, then a stem match after stripping extension and
 * " N" duplicate suffixes.
 */
async function resolveDocName(target: string): Promise<string> {
  const list = await listDocNames();
  if (list.includes(target)) return target;
  const stem = target.replace(DOC_EXT, "").replace(/ \d+$/, "");
  const pxd = list.find((n) => n === `${stem}.pxd`);
  if (pxd) return pxd;
  return list.find((n) => n.replace(DOC_EXT, "").replace(/ \d+$/, "") === stem) ?? target;
}

/**
 * Run a document-targeting script with name resolution and the design-D2
 * autosave retry: on a not-found failure, re-resolve the name once (Pixelmator
 * renames documents behind our back) and retry; then try the .pxd-suffixed name.
 */
async function runDocAS(build: (docLiteral: string) => string, documentName: string, timeout: number): Promise<unknown> {
  const resolved = await resolveDocName(documentName);
  try {
    return await runASJXA(build(asl(resolved)), timeout);
  } catch (err) {
    const msg = String(err);
    if (!/can.t get document|-1728|not found/i.test(msg)) throw err;
    const again = await resolveDocName(resolved);
    if (again !== resolved) {
      try {
        return await runASJXA(build(asl(again)), timeout);
      } catch { /* fall through to the .pxd retry */ }
    }
    const alt = resolved.replace(DOC_EXT, "") + ".pxd";
    return runASJXA(build(asl(alt)), timeout);
  }
}

// AppleScript string literal escaping, TS-side (same contract as asLiteral).
const asl = (s: string): string => '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, "") + '"';

// ── Schemas ────────────────────────────────────────────────────────────────
const absPath = z.string().startsWith("/").describe("Absolute POSIX path");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Hex colour like #FF0000");
const documentName = z.string().describe("Name of the open Pixelmator document");
const layerNumber = z.number().int().min(1).optional().describe("Layer number, 1-based (default: current layer)");

// ── Tool implementations ───────────────────────────────────────────────────
export function registerPixelmatorTools(server: McpServer): void {
  server.tool(
    "pixelmator_open_image",
    "Open an image in Pixelmator Pro as a disposable copy (the original file is never touched). Returns the copy path, source sha256, document name, size and stable id.",
    { filePath: absPath.describe("Absolute path of the image to open") },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      const filePath = args.filePath;
      if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
      const hash = createHash("sha256").update(readFileSync(filePath)).digest("hex");
      const workDir = join(tmpdir(), "iwork-mcp-pixelmator");
      mkdirSync(workDir, { recursive: true });
      const copyPath = join(workDir, `${hash.slice(0, 12)}-${basename(filePath)}`);
      copyFileSync(filePath, copyPath);
      const stemNoExt = `${hash.slice(0, 12)}-${basename(filePath)}`.replace(/\.[^.]+$/, "");
      // Pixelmator Pro's `open` Apple event may never send its reply (the
      // document still loads, but the sender hangs until the AE timeout —
      // observed on a healthy, freshly launched app). Dispatch the open
      // inside a bounded `with timeout` (its -1712 is expected and ignored),
      // then poll the fast document list until the copy shows up.
      const dispatchAS = `with timeout of 10 seconds
tell application "${APP}" to open POSIX file ${asl(copyPath)}
end timeout`;
      await runJXA(
        `${PAS_HELPERS}\ntry { runAS(${JSON.stringify(dispatchAS)}); } catch (e) {}\nreturn "dispatched";`,
        undefined,
        { timeout: 20_000 },
      );
      const deadline = Date.now() + 60_000;
      let docName = "";
      while (Date.now() < deadline) {
        const names = await listDocNames();
        const found = names.find((n) => n.includes(stemNoExt));
        if (found !== undefined) { docName = found; break; }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!docName) {
        throw new Error(`Pixelmator Pro did not open the document within 60 s (copy: ${copyPath}). Is the macOS session window-capable?`);
      }
      const out = await runASJXA(`tell application "${APP}"
        set d to document ${asl(docName)}
        return {name of d, width of d, height of d, (id of d) as text}
      end tell`, 30_000) as [string, number, number, string];
      return JSON.stringify({ name: out[0], width: out[1], height: out[2], id: out[3], sha256: hash, copyPath, source: filePath });
    }),
  );

  server.tool(
    "pixelmator_list_documents",
    "List open Pixelmator Pro documents with their names and stable ids (ids are informational; tools address documents by name).",
    {},
    ANNOTATIONS.readOnly,
    async () => handleJXA(async () => {
      requireApp();
      return runJXA<string>(`
        const app = Application("${APP}");
        return JSON.stringify(app.documents().map(d => ({ name: d.name(), id: String(d.id()) })));
      `, undefined, { timeout: 30_000 });
    }),
  );

  server.tool(
    "pixelmator_get_document_info",
    "Inspect an open Pixelmator document: size, resolution, bits per channel, colour profile, layer count, current layer. Fields the app does not provide come back as null.",
    { documentName },
    ANNOTATIONS.readOnly,
    async (args) => handleJXA(async () => {
      requireApp();
      const src = (d: string) => `tell application "${APP}"
        set outs to {}
        tell document ${d}
          try
            set end of outs to name
          on error
            set end of outs to missing value
          end try
          try
            set end of outs to width
          on error
            set end of outs to missing value
          end try
          try
            set end of outs to height
          on error
            set end of outs to missing value
          end try
          try
            set end of outs to resolution
          on error
            set end of outs to missing value
          end try
          try
            set end of outs to bits per channel
          on error
            set end of outs to missing value
          end try
          try
            set end of outs to color profile
          on error
            set end of outs to missing value
          end try
          try
            set end of outs to count of layers
          on error
            set end of outs to missing value
          end try
          try
            set end of outs to name of current layer
          on error
            set end of outs to missing value
          end try
        end tell
        return outs
      end tell`;
      const v = await runDocAS(src, args.documentName, 30_000) as Array<unknown>;
      return JSON.stringify({
        name: v[0], width: v[1], height: v[2], resolution: v[3],
        bitsPerChannel: v[4], colorProfile: v[5], layerCount: v[6], currentLayer: v[7],
      });
    }),
  );

  server.tool(
    "pixelmator_close_document",
    "Close a Pixelmator document (saving defaults to no).",
    { documentName, saving: z.enum(["no", "yes", "ask"]).optional().describe("Save policy (default: no)") },
    ANNOTATIONS.destructive,
    async (args) => handleJXA(async () => {
      requireApp();
      const saving = args.saving ?? "no";
      await runDocAS((doc) => `tell application "${APP}" to close document ${doc} saving ${saving}`, args.documentName, 30_000);
      return JSON.stringify({ closed: true, saving });
    }),
  );

  server.tool(
    "pixelmator_save_as",
    "Save a Pixelmator document to a new file (pxd, png, jpeg, tiff, heic, webp, gif, pdf, psd, svg). .pxd under /tmp is rejected by the app sandbox.",
    {
      documentName,
      filePath: absPath.describe("Absolute destination path"),
      format: z.enum(["pxd", "png", "jpeg", "tiff", "heic", "webp", "gif", "pdf", "psd", "svg"]).optional().describe("Format (default: from extension, else pxd)"),
    },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      const filePath = args.filePath;
      const SAVE_FORMATS = ["pxd", "png", "jpeg", "tiff", "heic", "webp", "gif", "pdf", "psd", "svg"] as const;
      const extMap: Record<string, string> = { jpg: "jpeg", tif: "tiff" };
      const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
      const candidate = extMap[ext] ?? ext;
      const format = args.format ?? ((SAVE_FORMATS as readonly string[]).includes(candidate) ? candidate : "pxd");
      if (format === "pxd" && (filePath.toLowerCase().startsWith("/tmp/") || filePath.toLowerCase().startsWith("/private/tmp/"))) {
        throw new Error("Pixelmator's app sandbox cannot save .pxd into /tmp — choose a destination outside /tmp.");
      }
      await runDocAS((doc) => `tell application "${APP}" to save as document ${doc} in POSIX file ${asl(filePath)} as ${format}`, args.documentName, TIMEOUT_EXPORT);
      for (let i = 0; i < 50 && !existsSync(filePath); i++) {
        await new Promise(r => setTimeout(r, 100));
      }
      if (!existsSync(filePath)) throw new Error(`save_as reported success but the file did not appear: ${filePath}`);
      return JSON.stringify({ saved: true, path: filePath, format, bytes: statSync(filePath).size });
    }),
  );

  server.tool(
    "pixelmator_export_image",
    "Export a Pixelmator document (png, jpeg, tiff, heic, webp, gif, pdf, psd, bmp; optional quality/compression factor). Waits until the file exists.",
    {
      documentName,
      filePath: absPath.describe("Absolute output path"),
      format: z.enum(["png", "jpeg", "tiff", "heic", "webp", "gif", "pdf", "psd", "bmp"]).describe("Export format"),
      quality: z.number().min(0).max(1).optional().describe("Compression factor 0..1 (jpeg/tiff/heic)"),
    },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      const filePath = args.filePath;
      const quality = typeof args.quality === "number" ? args.quality : null;
      const src = (doc: string) => `tell application "${APP}" to export document ${doc} to POSIX file ${asl(filePath)} as ${args.format}${quality !== null ? ` with properties {compression factor:${quality}}` : ""}`;
      await runDocAS(src, args.documentName, TIMEOUT_EXPORT);
      for (let i = 0; i < 50 && !existsSync(filePath); i++) {
        await new Promise(r => setTimeout(r, 100));
      }
      if (!existsSync(filePath)) throw new Error(`export reported success but the file did not appear: ${filePath}`);
      return JSON.stringify({ exported: true, path: filePath, format: args.format, bytes: statSync(filePath).size });
    }),
  );

  server.tool(
    "pixelmator_undo",
    "Undo N steps (default 1) on a Pixelmator document.",
    { documentName, times: z.number().int().min(1).max(100).optional().describe("Steps to undo (default 1)") },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      const times = args.times ?? 1;
      await runDocAS((doc) => {
        const undos = Array.from({ length: times }, () => `undo document ${doc}`).join("\n");
        return `tell application "${APP}"\n${undos}\nend tell`;
      }, args.documentName, 30_000);
      return JSON.stringify({ undone: true, times });
    }),
  );

  // ── Selection / colour ──

  server.tool(
    "pixelmator_select",
    "Selection modes: all, none, invert, subject, rect (bounds {x,y,width,height}), color-range (colour + tolerance, default 30).",
    {
      documentName,
      mode: z.enum(["all", "none", "invert", "subject", "rect", "color-range"]).describe("Selection mode"),
      bounds: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional().describe("Required for mode=rect"),
      color: hexColor.optional().describe("Required for mode=color-range"),
      range: z.number().min(0).max(100).optional().describe("color-range tolerance (default 30)"),
    },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      const mode = args.mode;
      if (mode === "rect" && !args.bounds) throw new Error("mode=rect requires bounds {x,y,width,height}");
      if (mode === "color-range" && !args.color) throw new Error("mode=color-range requires color");
      const range = args.range ?? 30;
      const b = args.bounds;
      const colorRangePhrase = mode === "color-range" && args.color
        ? (() => { const [r16, g16, b16] = rgb8ToRgb16(hexToRgb8(args.color)); return `select color range color {${r16},${g16},${b16}} range ${range}`; })()
        : "";
      const phrase: Record<string, string> = {
        all: "select all",
        none: "deselect",
        invert: "invert selection",
        subject: "select subject",
        rect: b ? `draw selection bounds {${b.x},${b.y},${b.width},${b.height}} mode new selection` : "",
        "color-range": colorRangePhrase,
      };
      await runDocAS((doc) => `tell application "${APP}" to tell document ${doc}\n${phrase[mode]}\nreturn "selected"\nend tell`, args.documentName, TIMEOUT_CREATE);
      return JSON.stringify({ selected: true, mode, ...(mode === "color-range" ? { range } : {}) });
    }),
  );

  server.tool(
    "pixelmator_pick_color",
    "Sample the pixel colour at {x,y} of a Pixelmator document. Returns 16-bit RGBA, 8-bit RGB and HEX.",
    { documentName, x: z.number().int().min(0), y: z.number().int().min(0) },
    ANNOTATIONS.readOnly,
    async (args) => handleJXA(async () => {
      requireApp();
      const src = (d: string) => `tell application "${APP}"
        return pick color document ${d} at {${args.x},${args.y}}
      end tell`;
      const [r16, g16, b16, a16] = await runDocAS(src, args.documentName, 30_000) as number[];
      const rgb8 = { r: Math.round(r16 / 257), g: Math.round(g16 / 257), b: Math.round(b16 / 257) };
      return JSON.stringify({ at: { x: args.x, y: args.y }, rgba16: { r: r16, g: g16, b: b16, a: a16 }, rgb8, hex: rgb8ToHex(rgb8) });
    }),
  );

  server.tool(
    "pixelmator_recolor",
    "Deterministic HEX recolor: style (fill colour style) or fill (paints the selection). Fill without an active selection paints the whole layer — refused unless wholeLayer. Returns a measured verification sample (ΔE-2000 by default).",
    {
      documentName,
      color: hexColor.describe("Target colour"),
      mode: z.enum(["style", "fill"]).optional().describe("Recolor mode (default: style)"),
      opacity: z.number().min(0).max(100).optional().describe("Fill opacity percent"),
      preserveTransparency: z.boolean().optional().describe("fill: preserve transparency (default true)"),
      wholeLayer: z.boolean().optional().describe("Explicitly allow filling the whole layer when nothing is selected"),
      layerNumber,
      metric: z.enum(["deltaE2000", "rgb-euclid"]).optional().describe("Verification metric (default deltaE2000)"),
    },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      const mode = args.mode ?? "style";
      const rgb8 = hexToRgb8(args.color);
      const [r16, g16, b16] = rgb8ToRgb16(rgb8);
      const layer = typeof args.layerNumber === "number" ? `layer ${args.layerNumber}` : "current layer";
      const boundsSrc = (doc: string) => `tell application "${APP}" to tell document ${doc}\ntry\nreturn selection bounds\non error\nreturn missing value\nend try\nend tell`;
      const sel = await runDocAS(boundsSrc, args.documentName, 30_000) as Array<number> | null;
      const sb = Array.isArray(sel) && sel.length >= 4 ? sel : null;
      if (mode === "fill" && sb === null && !args.wholeLayer) {
        throw new Error("No active selection: fill would paint the whole layer. Pass wholeLayer: true to confirm, or make a selection first.");
      }
      if (mode === "style") {
        await runDocAS((d) => `tell application "${APP}" to tell document ${d}\nset fill color of styles of ${layer} to {${r16},${g16},${b16}}\nreturn "styled"\nend tell`, args.documentName, TIMEOUT_CREATE);
      } else {
        if (typeof args.opacity === "number") {
          throw new Error("Pixelmator Pro's fill verb does not support opacity; adjust the layer opacity instead.");
        }
        const preserve = args.preserveTransparency === false ? "no" : "yes";
        // The dictionary's fill verb takes the document as its direct
        // parameter ("Fill the current layer or selected area with a color").
        await runDocAS((d) => `tell application "${APP}" to fill document ${d} with color {${r16},${g16},${b16}} preserve transparency ${preserve}\nreturn "filled"`, args.documentName, TIMEOUT_CREATE);
      }
      const centerSrc = (doc: string) => `tell application "${APP}" to tell document ${doc}\nreturn {width, height}\nend tell`;
      const [w, h] = await runDocAS(centerSrc, args.documentName, 30_000) as number[];
      const at = sb
        ? { x: Math.round((sb[0] + sb[2]) / 2), y: Math.round((sb[1] + sb[3]) / 2) }
        : { x: Math.round(w / 2), y: Math.round(h / 2) };
      // pick color returns a plain list {R, G, B, alpha} of 16-bit ints.
      const pickSrc = (doc: string) => `tell application "${APP}"\nreturn pick color document ${doc} at {${at.x},${at.y}}\nend tell`;
      const [pr, pg, pb] = await runDocAS(pickSrc, args.documentName, 30_000) as number[];
      const measured = { r: Math.round(pr / 257), g: Math.round(pg / 257), b: Math.round(pb / 257) };
      const distance = args.metric === "rgb-euclid" ? rgbEuclid(rgb8, measured) : deltaE2000(rgb8, measured);
      return JSON.stringify({
        layer, mode,
        applied: { hex: rgb8ToHex(rgb8), rgb8, rgb16: [r16, g16, b16] },
        measured: { at, hex: rgb8ToHex(measured), rgb8: measured, targetHex: args.color.toUpperCase(), distance, metric: args.metric === "rgb-euclid" ? "rgb-euclid" : "deltaE2000" },
      });
    }),
  );

  server.tool(
    "pixelmator_adjust",
    "Apply colour adjustments (saturation, contrast, hue, exposure, temperature, tint, brightness, vibrance, highlights, shadows, sharpen) to the current layer. Only provided keys are applied.",
    {
      documentName,
      adjustments: z.object({
        saturation: z.number().optional(),
        contrast: z.number().optional(),
        hue: z.number().optional(),
        exposure: z.number().optional(),
        temperature: z.number().optional(),
        tint: z.number().optional(),
        brightness: z.number().optional(),
        vibrance: z.number().optional(),
        highlights: z.number().optional(),
        shadows: z.number().optional(),
        sharpen: z.number().optional(),
      }).describe("Adjustments to apply"),
    },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      const entries = Object.entries(args.adjustments).map(([k, v]) => `${k}:${v}`).join(",");
      await runDocAS((doc) => `tell application "${APP}" to tell document ${doc}\nset color adjustments of current layer to {${entries}}\nreturn "adjusted"\nend tell`, args.documentName, TIMEOUT_CREATE);
      return JSON.stringify({ adjusted: true, layer: "current", applied: args.adjustments });
    }),
  );

  // ── Layers ──

  server.tool(
    "pixelmator_add_image_layer",
    "Create a new image layer in a Pixelmator document from an absolute file path.",
    { documentName, filePath: absPath.describe("Image file to place as a layer") },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      const filePath = args.filePath;
      if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
      const newLayer = await runDocAS((doc) => `tell application "${APP}" to tell document ${doc}\nmake image from POSIX file ${asl(filePath)}\nreturn name of layer 1\nend tell`, args.documentName, TIMEOUT_CREATE);
      return JSON.stringify({ added: true, layer: newLayer, from: filePath });
    }),
  );

  server.tool(
    "pixelmator_duplicate_layer",
    "Duplicate the current layer of a Pixelmator document. The new layer resolves through layer 1 (app quirk).",
    { documentName },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      // duplicate requires an element specifier ("layer N"), not the
      // current-layer property ("The specified object is a property, not an
      // element"), so resolve the current layer's index first.
      const newName = await runDocAS((doc) => `tell application "${APP}" to tell document ${doc}
set li to index of current layer
duplicate layer li to end of layers
return name of layer (count of layers)
end tell`, args.documentName, TIMEOUT_CREATE);
      return JSON.stringify({ duplicated: true, newLayer: newName });
    }),
  );

  server.tool(
    "pixelmator_merge_visible_layers",
    "Merge all visible layers of a Pixelmator document.",
    { documentName },
    ANNOTATIONS.destructive,
    async (args) => handleJXA(async () => {
      requireApp();
      await runDocAS((doc) => `tell application "${APP}" to merge visible document ${doc}`, args.documentName, TIMEOUT_CREATE);
      return JSON.stringify({ merged: true });
    }),
  );

  server.tool(
    "pixelmator_delete_layer",
    "Delete a numbered (1-based) or the current layer of a Pixelmator document.",
    { documentName, layerNumber: z.number().int().min(1).optional() },
    ANNOTATIONS.destructive,
    async (args) => handleJXA(async () => {
      requireApp();
      // Element specifier required: resolve "current layer" to its index
      // (same property-vs-element quirk as duplicate).
      const layer = typeof args.layerNumber === "number"
        ? `layer ${args.layerNumber}`
        : `layer (index of current layer)`;
      await runDocAS((doc) => `tell application "${APP}" to tell document ${doc}\ndelete ${layer}\nend tell`, args.documentName, TIMEOUT_CREATE);
      return JSON.stringify({ deleted: true, layer: args.layerNumber ?? "current layer" });
    }),
  );

  server.tool(
    "pixelmator_add_layer_mask",
    "Add a mask to a Pixelmator layer, optionally initialised from an image file, in reveal or hide mode.",
    {
      documentName,
      layerNumber,
      fromFile: absPath.optional().describe("Optional mask image"),
      mode: z.enum(["reveal", "hide", "reveal all", "hide all"]).optional().describe("Mask mode (default: reveal all)"),
    },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      const layer = typeof args.layerNumber === "number" ? `layer ${args.layerNumber}` : "current layer";
      const maskMode = args.mode === "reveal" ? "reveal all" : args.mode === "hide" ? "hide all" : args.mode ?? "reveal all";
      if (args.fromFile && !existsSync(args.fromFile)) throw new Error(`File not found: ${args.fromFile}`);
      const from = args.fromFile ? ` from POSIX file ${asl(args.fromFile)}` : "";
      await runDocAS((doc) => `tell application "${APP}" to mask ${layer} of document ${doc}${from} mask mode ${maskMode}`, args.documentName, TIMEOUT_CREATE);
      return JSON.stringify({ masked: true, layer, mode: maskMode });
    }),
  );

  // ── Canvas ──

  server.tool(
    "pixelmator_crop_canvas",
    "Crop a Pixelmator document to absolute bounds {x,y,width,height}.",
    { documentName, bounds: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }) },
    ANNOTATIONS.destructive,
    async (args) => handleJXA(async () => {
      requireApp();
      const b = args.bounds;
      await runDocAS((doc) => `tell application "${APP}" to crop document ${doc} bounds {${b.x},${b.y},${b.width},${b.height}}`, args.documentName, TIMEOUT_CREATE);
      return JSON.stringify({ cropped: true, bounds: b });
    }),
  );

  server.tool(
    "pixelmator_resize_image",
    "Resize a Pixelmator document to explicit width/height with a named resampling algorithm.",
    {
      documentName,
      width: z.number().int().min(1),
      height: z.number().int().min(1),
      algorithm: z.enum(["nearest neighbor", "bilinear", "bicubic", "lanczos"]).optional().describe("Resampling algorithm (default: lanczos)"),
    },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      const algorithm = args.algorithm ?? "lanczos";
      await runDocAS((doc) => `tell application "${APP}" to resize image document ${doc} width ${args.width} height ${args.height} algorithm ${algorithm}`, args.documentName, TIMEOUT_CREATE);
      return JSON.stringify({ resized: true, width: args.width, height: args.height, algorithm });
    }),
  );

  server.tool(
    "pixelmator_rotate_canvas",
    "Rotate a Pixelmator document left, right or 180 degrees.",
    { documentName, direction: z.enum(["left", "right", "180"]) },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      await runDocAS((doc) => `tell application "${APP}" to rotate ${args.direction} document ${doc}`, args.documentName, TIMEOUT_CREATE);
      return JSON.stringify({ rotated: true, direction: args.direction });
    }),
  );

  server.tool(
    "pixelmator_flip_canvas",
    "Flip a Pixelmator document horizontally or vertically.",
    { documentName, direction: z.enum(["horizontally", "vertically"]) },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      await runDocAS((doc) => `tell application "${APP}" to flip ${args.direction} document ${doc}`, args.documentName, TIMEOUT_CREATE);
      return JSON.stringify({ flipped: true, direction: args.direction });
    }),
  );

  // ── ML auto ──

  server.tool(
    "pixelmator_enhance",
    "Run Pixelmator's automatic Enhance on a document (long-running, 180 s timeout).",
    { documentName },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      await runDocAS((doc) => `tell application "${APP}" to enhance document ${doc}`, args.documentName, TIMEOUT_EXPORT);
      return JSON.stringify({ enhanced: true });
    }),
  );

  server.tool(
    "pixelmator_denoise",
    "Run Pixelmator Denoise with an intensity 0..1 (long-running, 180 s timeout).",
    { documentName, intensity: z.number().min(0).max(1).optional().describe("Denoise intensity (default 0.5)") },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      const intensity = args.intensity ?? 0.5;
      await runDocAS((doc) => `tell application "${APP}" to denoise document ${doc} intensity ${intensity}`, args.documentName, TIMEOUT_EXPORT);
      return JSON.stringify({ denoised: true, intensity });
    }),
  );

  server.tool(
    "pixelmator_auto_white_balance",
    "Run Pixelmator automatic white balance on a document (long-running, 180 s timeout).",
    { documentName },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      await runDocAS((doc) => `tell application "${APP}" to auto white balance document ${doc}`, args.documentName, TIMEOUT_EXPORT);
      return JSON.stringify({ whiteBalance: true });
    }),
  );

  server.tool(
    "pixelmator_remove_background",
    "Run Pixelmator Remove Background on a document (long-running, 180 s timeout).",
    { documentName },
    ANNOTATIONS.readWrite,
    async (args) => handleJXA(async () => {
      requireApp();
      await runDocAS((doc) => `tell application "${APP}" to remove background document ${doc}`, args.documentName, TIMEOUT_EXPORT);
      return JSON.stringify({ backgroundRemoved: true });
    }),
  );
}
