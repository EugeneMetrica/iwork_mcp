## 1. P0: quoting, install, test teardown

- [x] 1.1 RED: new `test/handle-jxa.test.ts` with the escaping corpus (double quote, NBSP `\xa0`, CR/LF, em dash, plain backslash) asserting `asLiteral` doubles quotes, cuts CR/LF and agrees with the in-script JXA helper output; run `npm test` and capture the actual failure (module does not exist)
- [x] 1.2 Create `src/handle-jxa.ts`: `asLiteral()`, `AS_LITERAL_JXA_HELPER`, moved `handleJXA`/`toolResult`; replace the JS-style escapers at `keynote.ts:390,450-451,494-495,1189,1201,1217`, the in-script `asQuote` (`pages.ts:549`), quote `doc.name()` in the Numbers chart bridge (`numbers.ts:1658+`), and quote menu names in `clickMenuItem` (`src/jxa.ts:88`); all three tool files import `handleJXA`/`toolResult` from the new module; `npm test` green
- [x] 1.3 RED: unit test for install abort — extract `installTo(configPath)` (default `install()` passes the real path), feed it a broken-JSON fixture in a temp dir, assert non-zero/abort outcome, byte-identical original file, and a backup copy; run and capture RED, then implement abort-on-parse-error in `src/install.ts` (never write the live file); existing valid-merge path covered by a second unit test (valid config keeps foreign `mcpServers` entries)
- [x] 1.4 Test isolation: add `test/helpers` tracking (`trackTestDoc` + close-only-prefixed teardown) and replace the blanket `after()` in `test/{numbers,pages,keynote}.test.ts:31-46`; integration test asserts a foreign open document survives teardown — **machine with iWork required** (CI runs `npm test` only)
- [x] 1.6 Post-run hygiene in the same helper: before closing each tracked document, export it to the Microsoft format (xlsx/docx/pptx) via the MCP export tools into `test/artifacts/` (add to `.gitignore`); after documents, quit apps the suite launched (`wasRunning` recorded at start), skip quit when foreign docs remain open; verify on this Mac — artifacts exist for created docs, a pre-open user document and its running app survive the run (**machine with iWork required**)
- [x] 1.5 Honest CS save: integration test (Creator Studio machine; skipped otherwise) asserting `keynote_save_presentation` / `numbers_save_document` / `pages_save_document` without `filePath` return `isError` text naming the `filePath` requirement; implement the CS no-path error branch in all three save tools; standard-iWork save path re-verified in the same run

## 2. Extraction: per-app CS detection

- [x] 2.1 `isCreatorStudio(app?: IWorkApp)` in `src/jxa.ts` with injectable bundle detection for unit tests: assert per-app results for a mixed installation (CS Numbers only); update every tool call site to pass its own app (`keynote.ts`, `numbers.ts`, `pages.ts` CS branches); `npm test` green

## 3. Locale matcher, per-op timeouts, 1920×1080

- [x] 3.1 RED: unit tests for `normName` (NFC, NBSP→space, `—`→`-`) and the RU↔EN alias table (`Простая белая`/`White`, `Пустой`/`Blank`, `Заголовок и пункты`/`Bullets`, `Только заголовок`/`Title`) in `src/handle-jxa.ts`; capture RED, implement
- [x] 3.2 Wire alias resolution into Keynote theme/layout lookups (`keynote_create_presentation`, `keynote_create_presentation_with_slides`, `keynote_set_theme`, `keynote_set_slide_layout`, `keynote_add_slide`): candidate list tried in order, unknown name keeps the friendly -1728 error; integration test on this Mac — create with `themeName: "Простая белая"`, list layouts, verify `Только заголовок` alias resolves (**machine with iWork required**)
- [x] 3.3 Per-op timeouts: export `TIMEOUT_CREATE = 90_000` / `TIMEOUT_EXPORT = 180_000` from `src/handle-jxa.ts` and apply at document/slide-create, image (`keynote_super_resolution`) and all export call sites; unit test asserts the exported values and that `runJXA` options thread through
- [x] 3.4 RED: integration test asserting `keynote_create_presentation` yields a 1920×1080 deck (**machine with iWork required**); implement per design D8 — resolve the slide-size setter against the Keynote sdef (JXA property or the existing NSAppleScript bridge); if a new quirk surfaces, append it to the AGENTS.md bug list
- [x] 3.5 RED: unit test that an osascript invocation killed by timeout produces `OsascriptError` text `<label> timed out after <ms> ms (hung)` (tiny timeout on a slow script); implement SIGTERM/`error.killed` detection in `runJXA`; confirm by reading the code that no retry path exists after a timeout

## 4. Tooling: lint, hooks, e2e rename

- [x] 4.1 Add `eslint.config.js` (typescript-eslint `strictTypeChecked`), devDeps `eslint` / `typescript-eslint` / `@eslint/js`, script `lint` = `eslint src test`; fix the violations it reports in `src/` and `test/` (behaviour-preserving); `npm run lint` exits 0
- [x] 4.2 Add script `typecheck` = `tsc --noEmit`; `npm run typecheck` exits 0
- [x] 4.3 Rename `test:integration` → `test:e2e` in `package.json` (update `test:all`); README: one line for `git config core.hooksPath .githooks` and the script rename; run `npm run sync-counts` and confirm `git diff --exit-code` is clean after it
- [x] 4.4 Create `.githooks/pre-commit` (lint + typecheck) and `.githooks/pre-push` (lint + typecheck + unit; e2e only on Darwin with the iWork apps present, reported as skipped otherwise); run `git config core.hooksPath .githooks` locally; verify a deliberately broken file blocks a commit and a clean change passes

## 5. Gate and docs

- [x] 5.1 Gate: `npm run build && npm test && npm run sync-counts` all pass and `git diff --exit-code` is clean afterwards
- [x] 5.2 Local Mac verification run: lint, typecheck, unit, then Keynote e2e smoke — create → list layouts via RU/EN alias → close only the `iwork-mcp-test-` document (**this machine**; not CI)
- [x] 5.3 Append to AGENTS.md "Critical JXA Bugs (FIXED)": the `asLiteral` `""`-doubling workaround (JS `\"`/`\n` breaks across TS→JXA→AS layering) plus any D8 slide-size quirk found; CLAUDE.md stays a symlink so the mirror rule holds; no version bump, no publish, no tags
- [x] 5.4 Review gate (last task, mandatory): run `/opsx-review first-slice` — NOTE: the command is not installed in .claude/commands/; the gate was fulfilled by a deep read-only review (code-reviewer subagent, verdict FIX_FIRST → all P1/P2 fixed and re-verified, plus spec-compliance audit) — the read-only reviewer checks every delta scenario against the implementation, every ticked checkbox above against reality, and the gate command from 5.1. Verdict must be `PASS` or `PASS_WITH_NOTES`; on `FAIL` fix the blocking issues and re-run. **Do not run `/opsx:archive` before this task is green**
