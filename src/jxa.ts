import { execFile } from "node:child_process";
import { existsSync } from "node:fs";

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

  const args = ["-l", "JavaScript", "-e", rewriteAppNames(fullScript)];
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
