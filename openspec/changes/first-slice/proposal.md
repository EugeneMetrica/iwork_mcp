## Why

The single-engine iwork-mcp runtime still carries safety bugs that can destroy user state: a broken `claude_desktop_config.json` makes `iwork-mcp install` overwrite the live config with a fresh one, integration test teardown closes every open Numbers/Pages/Keynote document including foreign ones, and AppleScript bridge code escapes strings JS-style (`\"`, `\n`) which AppleScript does not parse. This slice ports the proven rules from the Aeroflot keynote-ops stack (honest quoting, NBSP/NFC normalization, RU↔EN theme lookup, per-op timeouts, 1920×1080) and removes the per-tool copy-paste, so MCP can become the only agent interface.

## What Changes

- AppleScript literals: shared `asLiteral()` in `src/handle-jxa.ts` with AppleScript-correct escaping (quote doubling `""`, no JS `\"`, no `\n`/`\r`/`\t` escapes), replacing the broken `.replace(/"/g, '\\"')` sites in `keynote.ts` (master-slide + compound tools) and the local escaper in `pages.ts:549`, and unescaped menu names in `clickMenuItem` (`src/jxa.ts:88`).
- `install.ts`: when the existing config is unparseable JSON — back it up and abort with a clear error; never write a fresh config over it.
- Integration test teardown: close only documents whose name starts with `iwork-mcp-test-`; never touch other open documents.
- Creator Studio honesty: `keynote/numbers/pages_save_*` without `filePath` on CS returns an error result instead of `{"saved": true}` without saving; `isCreatorStudio()` becomes `isCreatorStudio(app?)` for per-app detection.
- `OsascriptError`: readable timeout message (label + timeout ms) instead of bare exit-code noise; guaranteed no retry after a timeout (hang minimum).
- Deduplicate: `handleJXA` / `toolResult` move from the three tool files into `src/handle-jxa.ts`.
- Port from keynote-ops: `_norm` (NFC + NBSP→space) for name lookups; RU↔EN theme/layout name map for Keynote; per-op timeouts (create/document/image 90 s, export 180 s); created presentations default to 1920×1080 slides.
- Repo tooling: ESLint (strict-type-checked) plus git hooks — pre-commit lint+typecheck, pre-push unit tests.

## Capabilities

### New Capabilities

- `runtime-safety`: AppleScript literal escaping, install-config protection, honest CS save behaviour, per-app CS detection, readable timeout errors, no-retry-after-timeout rule.
- `app-parity`: name normalization (NFC/NBSP), RU↔EN theme/layout mapping, per-op timeouts, default 1920×1080 slide size.
- `test-isolation`: integration teardown and e2e hygiene — only `iwork-mcp-test-`-prefixed documents are ever closed.
- `repo-tooling`: lint and git-hook behaviour (pre-commit lint+typecheck, pre-push unit tests).

### Modified Capabilities

(none — `openspec/specs/` is empty; this is the first slice)

## Impact

- Code: `src/jxa.ts`, `src/install.ts`, new `src/handle-jxa.ts`, all three `src/tools/*.ts`, `test/*.test.ts`, `test/helpers/`.
- Tooling: new ESLint config, git hooks in the nested `.git` (no `core.hooksPath` today), devDependencies only — **no new runtime dependency**.
- **No MCP tools are added, renamed or removed — the tool count stays 117**; `npm run sync-counts` gate is unaffected.
- Verification is required on **both** generations: standard iWork and Creator Studio 15.x — the quoting sites and save-honesty path live in CS-specific code, and CI cannot run Apple apps, so bridge-behaviour tasks are machine-verified.

## Non-goals

- No version bump, `npm publish`, tags or GitHub release (release is a separate manual step).
- No port of movie insertion, title/body colour control, or the full hang-protocol (later slices).
- No splitting of `numbers.ts`; no refactor of tool naming or the annotation surface.
- No e2e runner in CI (GitHub CI stays ubuntu unit-only); local e2e stays gated on the teardown fix landing first.
