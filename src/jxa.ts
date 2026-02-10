import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ── iWork app name resolution ──
// iWork 15.1 "Creator Studio" ships as separate bundles (e.g. "Numbers Creator Studio.app").
// Prefer Creator Studio when available; fall back to standard names.

const IWORK_APPS = ["Numbers", "Pages", "Keynote"] as const;
type IWorkApp = (typeof IWORK_APPS)[number];

let resolvedNames: Record<IWorkApp, string> | undefined;

function detectAppNames(): Record<IWorkApp, string> {
  const result = {} as Record<IWorkApp, string>;
  for (const app of IWORK_APPS) {
    result[app] = existsSync(`/Applications/${app} Creator Studio.app`)
      ? `${app} Creator Studio`
      : app;
  }
  return result;
}

/** Resolve the JXA application name for an iWork app. */
export function resolveAppName(app: IWorkApp): string {
  resolvedNames ??= detectAppNames();
  return resolvedNames[app];
}

/** Apply app-name substitutions to a script string. */
function rewriteAppNames(script: string): string {
  resolvedNames ??= detectAppNames();
  let s = script;
  for (const app of IWORK_APPS) {
    const resolved = resolvedNames[app];
    if (resolved === app) continue;
    // JXA: Application("Numbers") → Application("Numbers Creator Studio")
    s = s.replaceAll(`Application("${app}")`, `Application("${resolved}")`);
    // AppleScript (used in Keynote master slide ops):
    // application "Keynote" → application "Keynote Creator Studio"
    s = s.replaceAll(`application "${app}"`, `application "${resolved}"`);
  }
  return s;
}

/** Check if the current machine has Creator Studio iWork apps installed. */
export function isCreatorStudio(): boolean {
  resolvedNames ??= detectAppNames();
  return IWORK_APPS.some((app) => resolvedNames![app] !== app);
}

/**
 * Creator Studio workaround for "Save As" (doc.save({in:}) hangs).
 * Copies the auto-saved iCloud file, then closes + reopens from the new path.
 * Returns the new document name.
 */
export async function creatorStudioSaveAs(
  appName: IWorkApp,
  documentName: string,
  targetPath: string,
): Promise<string> {
  // Get the auto-save path, close with save to flush changes, copy, and reopen
  const autoSavePath = await runJXA<string>(
    `
    const app = Application("${resolveAppName(appName)}");
    const doc = app.documents.byName(params.documentName);
    // Poll for file() to become available (auto-save can take a moment)
    for (let i = 0; i < 15; i++) {
      const f = doc.file();
      if (f) return f.toString();
      delay(1);
    }
    throw new Error("Timed out waiting for document auto-save path");
    `,
    { documentName },
    { timeout: 20_000, label: "creatorStudioSaveAs:getFile" },
  );

  // Close with saving:"yes" to flush all in-memory changes to the auto-save location
  await runJXA<void>(
    `
    const app = Application("${resolveAppName(appName)}");
    const doc = app.documents.byName(params.documentName);
    doc.close({ saving: "yes" });
    `,
    { documentName },
    { timeout: 10_000, label: "creatorStudioSaveAs:close" },
  );

  // Copy the saved file to the target path
  await execFileAsync("/bin/cp", ["-R", autoSavePath, targetPath]);

  // Reopen from the new path
  const newName = await runJXA<string>(
    `
    const app = Application("${resolveAppName(appName)}");
    const newDoc = app.open(Path(params.targetPath));
    return JSON.stringify(newDoc.name());
    `,
    { targetPath },
    { label: "creatorStudioSaveAs:reopen" },
  );

  return newName;
}

/**
 * Creator Studio workaround for PDF export (app.export() fails with error 6).
 * Uses qlmanage Quick Look to generate a PDF from the auto-saved file.
 */
export async function creatorStudioExportPDF(
  appName: IWorkApp,
  documentName: string,
  targetPath: string,
): Promise<void> {
  // Get the auto-save file path
  const autoSavePath = await runJXA<string>(
    `
    const app = Application("${resolveAppName(appName)}");
    const doc = app.documents.byName(params.documentName);
    for (let i = 0; i < 15; i++) {
      const f = doc.file();
      if (f) return f.toString();
      delay(1);
    }
    throw new Error("Timed out waiting for document auto-save path");
    `,
    { documentName },
    { timeout: 20_000, label: "creatorStudioExportPDF:getFile" },
  );

  // Generate Quick Look preview (contains a PDF attachment)
  const tmpDir = await mkdtemp(join(tmpdir(), "iwork-mcp-ql-"));
  try {
    await execFileAsync("/usr/bin/qlmanage", ["-p", "-o", tmpDir, autoSavePath], {
      timeout: 30_000,
    });

    // Find the generated PDF
    const { stdout } = await execFileAsync("/usr/bin/find", [tmpDir, "-name", "*.pdf", "-type", "f"]);
    const pdfPath = stdout.trim().split("\n")[0];
    if (!pdfPath) {
      throw new Error("Quick Look did not generate a PDF preview for this document");
    }

    await copyFile(pdfPath, targetPath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

// ── Creator Studio document name resolution ──
// Creator Studio auto-saves rename documents by appending file extensions
// (e.g. "Untitled 1" → "Untitled 1.numbers"), breaking documents.byName() lookups.
// We inject a resolution block that tries the extended name on -1728 errors.

const EXT_MAP: Record<IWorkApp, string> = {
  Numbers: ".numbers",
  Pages: ".pages",
  Keynote: ".key",
};

function detectAppFromScript(script: string): IWorkApp | undefined {
  resolvedNames ??= detectAppNames();
  for (const app of IWORK_APPS) {
    const resolved = resolvedNames[app];
    if (script.includes(`Application("${resolved}")`)) return app;
    if (script.includes(`application "${resolved}"`)) return app;
  }
  return undefined;
}

/**
 * Inject document-name resolution into a JXA script.
 *
 * After `const params = JSON.parse(argv[0]);`, inserts a block that:
 * 1. Tries `app.documents.byName(params.documentName)` — if it works, done.
 * 2. On failure, tries with the file extension appended.
 * 3. If that works, mutates `params.documentName` so all downstream code uses it.
 *
 * Guards: only activates when Creator Studio is detected, the script references
 * `params.documentName`, and the app can be identified.
 */
export function injectDocumentNameResolution(script: string): string {
  // Only needed on Creator Studio machines
  resolvedNames ??= detectAppNames();
  const isCreatorStudio = IWORK_APPS.some((app) => resolvedNames![app] !== app);
  if (!isCreatorStudio) return script;

  // Only relevant for scripts that use params.documentName
  if (!script.includes("params.documentName")) return script;

  const app = detectAppFromScript(script);
  if (!app) return script;

  const ext = EXT_MAP[app];
  const resolved = resolvedNames[app];

  // Determine the application constructor used in the script
  const appExpr = script.includes(`Application("${resolved}")`)
    ? `Application("${resolved}")`
    : undefined;
  if (!appExpr) return script;

  const injection = `
  // [iwork-mcp] Creator Studio document name resolution
  try {
    const __app = ${appExpr};
    __app.documents.byName(params.documentName).name();
  } catch(__e) {
    try {
      const __app2 = ${appExpr};
      const __extName = params.documentName + ${JSON.stringify(ext)};
      __app2.documents.byName(__extName).name();
      params.documentName = __extName;
    } catch(__e2) { /* leave params unchanged; original error will surface */ }
  }`;

  // Insert after the params line
  const anchor = "const params = JSON.parse(argv[0]);";
  if (!script.includes(anchor)) return script;

  return script.replace(anchor, anchor + injection);
}

const COMMON_ERRORS: Record<number, string> = {
  [-1743]: "Permission denied. Open System Settings → Privacy & Security → Automation and allow this app to control the iWork application.",
  [-1728]: "Element not found. The specified document, sheet, table, or cell does not exist.",
  [-128]: "User cancelled the operation.",
  [-10810]: "The application is not running and could not be launched.",
  [-1700]: "Invalid data type for the operation.",
  [-1708]: "The application does not understand this command.",
};

export class OsascriptError extends Error {
  readonly appleScriptErrorCode: number | undefined;
  readonly stderr: string;

  constructor(stderr: string, exitCode: number | null) {
    const errorCode = parseErrorCode(stderr);
    const friendly = errorCode !== undefined ? COMMON_ERRORS[errorCode] : undefined;
    const message = friendly
      ? `${friendly}\n\nosascript stderr: ${stderr}`
      : `osascript failed (exit ${exitCode}): ${stderr}`;

    super(message);
    this.name = "OsascriptError";
    this.appleScriptErrorCode = errorCode;
    this.stderr = stderr;
  }
}

function parseErrorCode(stderr: string): number | undefined {
  // JXA errors look like: "Error: Error: ... (-1743)"
  // or "execution error: ... (-1728)"
  const match = stderr.match(/\((-?\d+)\)\s*$/);
  return match ? parseInt(match[1], 10) : undefined;
}

export interface RunJXAOptions {
  timeout?: number;
  maxBuffer?: number;
  label?: string;
}

/**
 * Execute a JXA (JavaScript for Automation) script via osascript.
 *
 * The script body is wrapped in `function run(argv) { ... }` automatically.
 * If `params` is provided, it's JSON-serialized and passed as argv[0].
 * The script should return a value; it will be JSON.stringify'd and parsed back.
 */
export function runJXA<T = unknown>(
  scriptBody: string,
  params?: Record<string, unknown>,
  options?: RunJXAOptions,
): Promise<T> {
  const timeout = options?.timeout ?? 30_000;
  const maxBuffer = options?.maxBuffer ?? 10 * 1024 * 1024;
  const timing = process.env.IWORK_MCP_TIMING === "1";
  const t0 = timing ? Date.now() : 0;

  // Wrap in run(argv) so osascript calls it with our args
  const fullScript = `
function run(argv) {
  ${params !== undefined ? "const params = JSON.parse(argv[0]);" : ""}
  ${scriptBody}
}
`;

  const rewritten = injectDocumentNameResolution(rewriteAppNames(fullScript));
  const args = ["-l", "JavaScript", "-e", rewritten];
  if (params !== undefined) {
    args.push(JSON.stringify(params));
  }

  const label = options?.label ?? "jxa";

  return new Promise<T>((resolve, reject) => {
    execFile("/usr/bin/osascript", args, { timeout, maxBuffer }, (error, stdout, stderr) => {
      if (timing) {
        const ms = Date.now() - t0;
        process.stderr.write(`[iwork-mcp] ${label} completed in ${ms}ms\n`);
      }

      if (error) {
        const exitCode = typeof error.code === "number" ? error.code : null;
        reject(new OsascriptError(stderr || error.message, exitCode));
        return;
      }

      const trimmed = stdout.trim();
      if (!trimmed) {
        resolve(undefined as T);
        return;
      }

      try {
        resolve(JSON.parse(trimmed) as T);
      } catch {
        // If the output isn't JSON, return the raw string
        resolve(trimmed as T);
      }
    });
  });
}
