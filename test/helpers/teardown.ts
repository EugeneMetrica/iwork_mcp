import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { resolveAppName } from "../../src/jxa.js";

const suiteAppName = (app: SuiteApp): string => (app === "Pixelmator" ? "Pixelmator Pro" : resolveAppName(app));

const execFileAsync = promisify(execFile);

/** Every document the e2e suite creates or renames to must carry this prefix in its tracking. */
export const TEST_DOC_PREFIX = "iwork-mcp-test-";

/** Microsoft-format exports of created test documents land here (gitignored). */
export const ARTIFACTS_DIR = join(process.cwd(), "test", "artifacts");

export type SuiteApp = "Numbers" | "Pages" | "Keynote" | "Pixelmator";

const TOOLS: Record<SuiteApp, { list: string; close: string; export: string }> = {
  Numbers: { list: "numbers_list_documents", close: "numbers_close_document", export: "numbers_export_document" },
  Pages: { list: "pages_list_documents", close: "pages_close_document", export: "pages_export_document" },
  Keynote: { list: "keynote_list_presentations", close: "keynote_close_presentation", export: "keynote_export_presentation" },
  Pixelmator: { list: "pixelmator_list_documents", close: "pixelmator_close_document", export: "pixelmator_export_image" },
};

// Pixelmator exports images (PNG), not Microsoft formats — same artifact rule, different extension.
const ARTIFACT_FORMAT: Record<SuiteApp, string> = { Numbers: "Excel", Pages: "Word", Keynote: "PowerPoint", Pixelmator: "png" };
const ARTIFACT_EXT: Record<SuiteApp, string> = { Numbers: ".xlsx", Pages: ".docx", Keynote: ".pptx", Pixelmator: ".png" };

interface McpLikeClient {
  callTool(args: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
}

async function call(client: McpLikeClient, name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> {
  const result = (await client.callTool({ name, arguments: args })) as {
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  return {
    text: result.content?.[0]?.text ?? "",
    isError: result.isError ?? false,
  };
}

async function listDocNames(client: McpLikeClient, app: SuiteApp): Promise<string[]> {
  try {
    const res = await call(client, TOOLS[app].list);
    const docs = JSON.parse(res.text) as Array<{ name: string }>;
    return Array.isArray(docs) ? docs.map(d => d.name) : [];
  } catch {
    return [];
  }
}

export interface TeardownOptions {
  client: McpLikeClient;
  app: SuiteApp;
  /** Document names this suite created (or was renamed to) — the only ones it may close. */
  tracked: Iterable<string>;
  /** Whether the app was already running before the suite started (then it is not quit). */
  wasRunning: boolean;
  /** Where Microsoft-format exports are written. Defaults to test/artifacts. */
  artifactsDir?: string;
}

/**
 * Suite teardown: export every tracked (and leaked test-prefixed) document to a
 * Microsoft format, then close it without saving. Never touches untracked
 * documents that do not carry the test prefix — user work survives. Quits the
 * app only when the suite launched it and no foreign documents remain open.
 */
export async function teardownAppDocuments(opts: TeardownOptions): Promise<void> {
  const dir = opts.artifactsDir ?? ARTIFACTS_DIR;
  const open = new Set(await listDocNames(opts.client, opts.app));
  const targets = new Set([...opts.tracked].filter(name => open.has(name)));
  for (const name of open) {
    if (name.startsWith(TEST_DOC_PREFIX)) targets.add(name);
  }

  for (const name of targets) {
    // Best-effort artifact export first: a failed export must not block closing.
    try {
      mkdirSync(dir, { recursive: true });
      const file = join(dir, name.replace(/[\\/:]/g, "-") + ARTIFACT_EXT[opts.app]);
      const res = await call(opts.client, TOOLS[opts.app].export, {
        documentName: name,
        filePath: file,
        format: ARTIFACT_FORMAT[opts.app],
      });
      if (res.isError) {
        console.warn(`[teardown] ${opts.app}: export failed for "${name}": ${res.text.slice(0, 160)}`);
      }
    } catch (err) {
      console.warn(`[teardown] ${opts.app}: export failed for "${name}": ${(err as Error).message}`);
    }
    try {
      await call(opts.client, TOOLS[opts.app].close, { documentName: name, saving: "no" });
    } catch {
      // already closed or gone — nothing to do
    }
  }

  if (!opts.wasRunning) {
    const remaining = await listDocNames(opts.client, opts.app);
    const foreign = remaining.filter(name => !targets.has(name) && !name.startsWith(TEST_DOC_PREFIX));
    if (foreign.length === 0) {
      try {
        await execFileAsync("/usr/bin/osascript", [
          "-e", `tell application "${suiteAppName(opts.app)}" to quit`,
        ]);
      } catch {
        // app already gone or quit refused — leave it be
      }
    }
  }
}
