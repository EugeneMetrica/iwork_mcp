import { OsascriptError, isCreatorStudio } from "./jxa.js";

/**
 * Escape a string for embedding into AppleScript source: backslashes doubled,
 * quotes escaped as \", CR/LF removed (raw newlines are illegal inside an
 * AppleScript string literal). Verified against osascript: `""` quote doubling
 * is NOT valid AppleScript (-2740); the only string escapes are \\ and \".
 * The escaping must happen at the layer where the value is known — see the
 * JXA helper below for values that only exist at script runtime.
 */
export function asLiteral(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, "") + '"';
}

/**
 * The same escaping contract as asLiteral(), as a JXA function snippet for
 * values that only exist at script runtime (document names read inside the
 * script, cell values). Interpolate into runJXA script bodies that build
 * AppleScript source, then call asLiteral(...) inside the script.
 */
export const AS_LITERAL_JXA_HELPER = `
function asLiteral(s) {
  return '"' + String(s).replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\\\"').replace(/[\\r\\n]+/g, "") + '"';
}
`;

export function toolResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

/** Per-operation osascript timeouts (hang minimum: a timed-out AE is never retried). */
export const TIMEOUT_CREATE = 90_000;
export const TIMEOUT_EXPORT = 180_000;

/**
 * Normalize an iWork name for comparison: NFC, NBSP → space, em dash → hyphen.
 * Matches the Aeroflot keynote-ops `_norm` contract.
 */
export function normName(s: string): string {
  return s.normalize("NFC").replace(/\u00A0/g, " ").replace(/—/g, "-");
}

/** RU↔EN pairs for Keynote theme and master-slide (layout) names. */
const NAME_ALIASES: Array<[string, string]> = [
  ["Простая белая", "White"],
  ["Пустой", "Blank"],
  ["Заголовок и пункты", "Bullets"],
  ["Только заголовок", "Title"],
];

/**
 * Candidate list for a theme/layout name lookup, tried in order against the
 * running app: the name as requested, its normalized form, then the mapped
 * alias (works on both RU- and EN-localized Keynote without knowing the
 * app locale). Unknown names yield just themselves.
 */
export function resolveNameCandidates(name: string): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    if (v && !out.includes(v)) out.push(v);
  };
  push(name);
  const norm = normName(name).toLowerCase();
  push(normName(name));
  for (const [ru, en] of NAME_ALIASES) {
    if (norm === normName(ru).toLowerCase()) { push(ru); push(en); }
    if (norm === normName(en).toLowerCase()) { push(en); push(ru); }
  }
  return out;
}

export async function handleJXA<T>(fn: () => Promise<T>): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
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
