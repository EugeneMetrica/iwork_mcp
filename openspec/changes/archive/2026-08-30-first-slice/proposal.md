## Why

The single-engine iwork-mcp runtime still carries safety bugs that can destroy user state: a broken `claude_desktop_config.json` makes `iwork-mcp install` overwrite the live config with a fresh one, integration test teardown closes every open Numbers/Pages/Keynote document including foreign ones, and AppleScript bridge code escapes strings JS-style (`\"`, `\n`) which AppleScript does not parse. This slice ports the proven rules from the Aeroflot keynote-ops stack (honest quoting, NBSP/NFC normalization, RU↔EN theme lookup, per-op timeouts, 1920×1080) and removes the per-tool copy-paste, so MCP can become the only agent interface.

## What Changes

- AppleScript literals: shared `asLiteral()` (backslashes doubled, quotes escaped as `\"`, CR/LF cut — verified against osascript; `""` doubling is invalid AppleScript) replacing the broken JS-style escapers in `keynote.ts` (master-slide lookup, set layout, add slide, compound create) and the local `asQuote` in `pages.ts`, and quoting the currently-raw `doc.name()` embedded into the Numbers chart bridge script and the menu names in `clickMenuItem` (`src/jxa.ts:88`).
- `install.ts`: when the existing config is unparseable JSON — back it up and abort with a clear error; never write a fresh config over it.
- Integration test teardown: close only documents whose name starts with `iwork-mcp-test-`; never touch other open documents. Post-run hygiene: export every created test document to a Microsoft Office format (xlsx/docx/pptx) into a local artifacts directory, then quit the apps the suite itself launched (already-running apps stay open).
- Creator Studio honesty: `keynote/numbers/pages_save_*` without `filePath` on CS returns an error result instead of `{"saved": true}` without saving; `isCreatorStudio()` becomes `isCreatorStudio(app?)` for per-app detection.
- `OsascriptError`: readable timeout message (label + timeout ms, "hung" wording) instead of raw `exit null` noise; after a timeout the same Apple Event is never retried (hang minimum).
- Deduplicate: `handleJXA` / `toolResult` move from the three tool files into `src/handle-jxa.ts`; `isCreatorStudio(app?)` lives next to `resolveAppName`.
- Port from keynote-ops: `_norm` (NFC, NBSP `\xa0`→space, `—`→`-`) for name lookups; RU↔EN theme/layout map (`Простая белая`/`White`, `Пустой`/`Blank`, `Заголовок и пункты`/`Bullets`, `Только заголовок`/`Title`); per-op timeouts instead of the blanket 30 s (create/image 90 s, export 180 s); created Keynote decks default to 1920×1080 slides.
- Repo tooling: ESLint (typescript-eslint `strictTypeChecked`) with `npm run lint` (`eslint src test`) and `npm run typecheck` (`tsc --noEmit`); `npm run test:e2e` (renamed from `test:integration`) restricted to own docs; `.githooks/pre-commit` = lint+typecheck, `.githooks/pre-push` = lint+typecheck+unit plus `test:e2e` on Darwin (skipped when the iWork apps are absent); wired via local `git config core.hooksPath .githooks` and one README line. GitHub CI stays ubuntu build+unit.

## Capabilities

### New Capabilities

- `runtime-safety`: AppleScript literal escaping, install-config protection, honest CS save behaviour, per-app CS detection, readable timeout errors, no-retry-after-timeout rule.
- `app-parity`: name normalization (NFC/NBSP), RU↔EN theme/layout mapping, per-op timeouts, default 1920×1080 slide size.
- `test-isolation`: integration teardown and e2e hygiene — only `iwork-mcp-test-`-prefixed documents are ever closed, created documents are exported to Microsoft formats as artifacts, apps launched by the suite are quit afterwards.
- `repo-tooling`: lint and git-hook behaviour (pre-commit lint+typecheck, pre-push unit tests).

### Modified Capabilities

(none — `openspec/specs/` is empty; this is the first slice)

## Impact

- Code: `src/jxa.ts`, `src/install.ts`, new `src/handle-jxa.ts`, all three `src/tools/*.ts`, `test/*.test.ts`, `test/helpers/`, new gitignored `test/artifacts/` for e2e exports.
- Scripts: `test:integration` is renamed to `test:e2e` (contributor-visible change; `test:all` updated accordingly).
- Tooling: new ESLint config, `.githooks/` in the repo (no `core.hooksPath` today — set locally), devDependencies only — **no new runtime dependency**.
- **No MCP tools are added, renamed or removed — the tool count stays 117**; `npm run sync-counts` gate is unaffected.
- Verification is required on **both** generations: standard iWork and Creator Studio 15.x — the quoting sites and save-honesty path live in CS-specific code, and CI cannot run Apple apps, so bridge-behaviour tasks are machine-verified.

## Non-goals

- No version bump, `npm publish`, tags or GitHub release (release is a separate manual step).
- No `add-movie` tool, no title/body text-colour palette (need a separate tool + sdef verification).
- No full hang-protocol (perl-alarm/SIGTERM), no GUI mutex, no filesystem allowlist.
- No splitting of `numbers.ts` into modules; no "runtime / locale / fs policy / tools" layering (next change).
- No merge into `metrica-pro/mcp`, no replacement of `keynote_ctl.py`.
- No e2e in GitHub CI (ubuntu stays build+unit); e2e is not run until the close-all fix lands — the local Mac is the only e2e gate.
