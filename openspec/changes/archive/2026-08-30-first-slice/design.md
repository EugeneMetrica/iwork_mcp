## Context

See proposal.md — Why. Current facts this design rests on:

- AppleScript-bridge sites escape quotes JS-style today: `keynote.ts:390,450-451,494-495,1189,1201,1217` use `.replace(/"/g, '\\"')`; `pages.ts` has an in-script `asQuote` (`pages.ts:549`) that also emits `\n`/`\r`/`\t`; the Numbers chart bridge embeds `doc.name()` unquoted (`numbers.ts:1658+`); `clickMenuItem` interpolates menu names raw (`src/jxa.ts:88`).
- `install.ts:23-27` backs up an unparseable config, then proceeds with `{}` and overwrites the live file at `install.ts:50`.
- All three integration suites close every open document in their app teardown (`test/{numbers,pages,keynote}.test.ts:31-46`).
- `isCreatorStudio()` (`src/jxa.ts:52`) is machine-global: true if any Creator Studio bundle is on disk.
- CS `save` without `filePath` returns `{"saved": true}` without saving (`keynote.ts:141` and the Numbers/Pages twins).
- `OsascriptError` (`src/jxa.ts:383`) reports raw `exit null` on execFile timeout; nothing anywhere retries after a timeout.
- One blanket `runJXA` timeout: 30 s (`src/jxa.ts:426`).
- `handleJXA` + `toolResult` are identical copy-paste at the top of all three `src/tools/*.ts`.
- No `core.hooksPath`, no ESLint config, no `typecheck`/`lint` scripts exist.

## Goals / Non-Goals

**Goals:**

- One escaping contract for AppleScript literals, correct through the TS → JXA-source → AppleScript-source layering.
- Install, save, teardown and timeout behaviour that never destroys or misreports user state.
- RU-localized iWork parity for theme/layout lookup, plus per-op timeouts and 1920×1080 decks.
- Copy-paste extraction only (`handleJXA`, `toolResult`, `asLiteral`, `isCreatorStudio(app)`), no module split.
- Local quality gates: ESLint strictTypeChecked, `.githooks` pre-commit/pre-push, `test:e2e` rename.

**Non-Goals:**

- See proposal.md — Non-goals (no movie/text-colour tools, no full hang-protocol, no `numbers.ts` split, no CI e2e, no publish).

## Decisions

### D1: Execution bridges — unchanged, justified per site
Plain JXA (`osascript -l JavaScript`) remains the default bridge. The NSAppleScript ObjC bridge stays only where JXA is documented broken: Pages tables (-2763 TMAScriptTableInfoProxy) and Keynote master slides (-1700 name bridge failures). UI scripting stays a last resort and is used only by `pagesInsertTableViaUI` and `clickMenuItem` — both already require the **Accessibility permission** for the host app; no new UI-scripting site is introduced by this change. The quoting fix does not move any site between bridges; it only fixes what strings those bridges receive.

### D2: One escaping contract, two carriers (`asLiteral`)
Verified against osascript on this machine: AppleScript string escapes are `\\` and `\"` only — quote doubling (`""`) is a syntax error (-2740), which disproved the plan's original `""` premise mid-implementation. The contract is: double backslashes, escape quotes as `\"`, remove CR/LF (raw newlines are illegal in a string literal). The real historical bug at the Keynote sites was missing backslash escaping and unescaped embeddings (numbers chart, clickMenuItem) — not the quote style. Escaping must happen at the layer where the value is known, hence two carriers of one contract in `src/handle-jxa.ts`:
- `asLiteral(s)` — TS-side, for strings known before script construction (Numbers chart `doc.name()` fallback paths, `clickMenuItem` menu names).
- `AS_LITERAL_JXA_HELPER` — a JXA snippet constant inlined into script templates, replacing the in-script `asQuote` (Pages) and the inline `.replace(/"/g, '\\"')` chains (Keynote), because some values (e.g. `doc.name()` read inside the script) only exist at JXA runtime.

Two carriers, one contract, both in the new `src/handle-jxa.ts`:
- `asLiteral(s)` — TS-side, for strings known before script construction (Numbers chart `doc.name()`, `clickMenuItem` menu names).
- `AS_LITERAL_JXA_HELPER` — a JXA snippet constant inlined into script templates, replacing the in-script `asQuote` (Pages) and the inline `.replace(/"/g, '\\"')` chains (Keynote), because some values (e.g. `doc.name()` read inside the script) only exist at JXA runtime.

Alternative rejected: pre-escaping everything TS-side — impossible for runtime-read values, and it keeps the backslash layering hazard.

### D3: Install aborts on unparseable config
On `JSON.parse` failure: write `<config>.backup-<timestamp>`, print an error naming the path and parse error, exit non-zero — never write the live file. Valid configs keep today's merge behaviour (all foreign `mcpServers` entries preserved — spec'd). Alternative rejected: interactive repair prompt.

### D4: Honest CS save — error, not UI scripting
CS save without `filePath` returns `isError` text telling the client an absolute `filePath` is required. Alternative rejected: synthesizing Cmd+S via menu clicks — fragile, needs Accessibility, and the plan explicitly chooses honesty over emulation. The standard-iWork in-place save path is untouched.

### D5: `isCreatorStudio(app?: IWorkApp)` next to `resolveAppName`
Signature becomes per-app with an optional argument (no argument = "any CS on disk", keeping existing call sites valid). All tool call sites pass their own app, so a mixed installation routes each app by its own generation. Detection stays filesystem-based (`/Applications/<App> Creator Studio.app`) — same mechanism as today.

### D6: Timeouts per operation class + readable "hung" errors
Per-op constants in `src/handle-jxa.ts` (single source): `TIMEOUT_CREATE = 90_000` (create/open of documents, image ops incl. `keynote_super_resolution`), `TIMEOUT_EXPORT = 180_000` (all export tools). Default stays 30 s. On execFile timeout (`error.killed` / SIGTERM), `OsascriptError` message becomes `<label> timed out after <ms> ms (hung)` — no retry logic is added anywhere, and the no-retry rule is stated at the call contract level (hang minimum; full alarm/SIGTERM protocol is out of scope).

### D7: Locale matcher — alias candidates, try-in-order
`normName(s)` (NFC, NBSP→space, `—`→`-`) plus `THEME_ALIASES`/`LAYOUT_ALIASES` (`Простая белая`↔`White`, `Пустой`↔`Blank`, `Заголовок и пункты`↔`Bullets`, `Только заголовок`↔`Title`) live in `src/handle-jxa.ts` for this slice (layering into a dedicated locale module is the next change). Resolution builds a candidate list — requested name, its alias, the canonical pair — normalized, and tries `byName` in order until one resolves; all failing yields the existing friendly -1728 error. This works on both RU- and EN-localized Keynote without knowing the app locale.

### D8: 1920×1080 at create time
Resolved empirically against the running apps: a document created without a theme is already 1920×1080, while creating WITH a theme locks the deck to that theme's own size (theme "White" → 1024×768), and AppleScript `set slide size` is broken (-1728 both directions). Therefore the create tools build a plain document, apply the requested theme via `doc.documentTheme = ...` afterwards (candidates loop, see D7), and return `width`/`height` read back via JXA so the result reflects the real deck. Two new quirks from this investigation are appended to the AGENTS.md bug list (theme-locks-size; RU-localized theme specs fail in `Document({documentTheme})` but resolve via `byName` and via assignment).

### D9: Test isolation — tracked names, no blanket close
A shared test helper tracks every document the suite creates (all names prefixed `iwork-mcp-test-`); teardown lists the app's documents and closes only tracked/prefixed ones with `saving: "no"`. The `after()` hooks in all three suites are replaced by this helper; e2e keeps needing the real apps, so those tasks are machine-verified.

### D10: Tooling — flat ESLint config + `.githooks`
`eslint.config.js` (typescript-eslint `strictTypeChecked`), devDeps `eslint`, `typescript-eslint`, `@eslint/js` — devDependencies only, no runtime dependency. Scripts: `lint` = `eslint src test`, `typecheck` = `tsc --noEmit`, `test:e2e` replaces `test:integration` (`test:all` updated). `.githooks/pre-commit` = lint + typecheck; `.githooks/pre-push` = lint + typecheck + unit + (Darwin only, apps present) e2e. Enabled via local `git config core.hooksPath .githooks` (documented as one README line). GitHub CI stays ubuntu build + unit.

### D11: Post-run hygiene — export artifacts, quit what the suite launched
Teardown order per tracked document: export to the app's Microsoft format (Numbers→`xlsx`, Pages→`docx`, Keynote→`pptx`) via the same MCP export tools the suite already exercises (dogfooding the export path), writing into `test/artifacts/` (gitignored), then close the document. After documents, the helper quits an app only if the suite launched it (recorded `wasRunning` per app at suite start) and only if no non-test documents remain open in it — an app the user had open is left exactly as found. Exports are best-effort: a failed export is reported but does not block closing or quitting.

## Applicable known quirks (AGENTS.md check)

- Keynote masterSlides JXA bridge broken → NSAppleScript bridge stays (D1); quoting fix lands inside those scripts (D2).
- Pages tables unreachable via JXA (-2763) → bridge stays; CS table creation still via UI scripting (Accessibility) — untouched.
- CS auto-save rename race → `injectDocumentNameResolution` and the stable-id polling in the Pages table bridge stay as-is.
- CS save/export hang → `creatorStudioSaveAs` / `creatorStudioExportPDF` stay; only the no-path lie is fixed (D4).
- New workaround to append to the AGENTS.md "Critical JXA Bugs (FIXED)" list: AppleScript literal escaping by `""` doubling via `asLiteral` (JS-style `\"`/`\n` escapes break across the TS→JXA→AS layering). If D8 uncovers a slide-size quirk, it is appended too.

## Tool surface

No tool is added, renamed or removed; counts stay 117 and `npm run sync-counts` is unaffected. Save tools keep their zod raw shapes (`filePath` stays optional) and `ANNOTATIONS.readWrite`; only the no-path-on-CS result changes to `isError`. `src/instructions.ts` gains three short notes (CS save needs an explicit `filePath`; per-op timeouts 90/180 s; RU theme/layout aliases accepted). README gains the hooks one-liner, the `test:e2e` rename, and whatever `sync-counts` requires.

## Risks / Trade-offs

- [In-script helper drifts from the TS escaper] → both carriers live in `src/handle-jxa.ts` from one contract; unit test asserts their outputs agree on a shared corpus (quotes, NBSP, CR/LF, em dash).
- [Alias map incomplete for other locales/themes] → try-in-order falls through to the existing friendly -1728 error; table is data, extensible without spec change.
- [Hooks are local-only (`core.hooksPath` is not committed)] → README one-liner; GitHub CI already enforces build+unit, hooks add local lint/typecheck/e2e.
- [e2e on pre-push could still surprise] → e2e is gated on Darwin + apps-present and runs only after the teardown fix (plan order), and closes only `iwork-mcp-test-` docs.
- [Timeout raise masks hangs longer] → acceptable: readable "hung" error after 90/180 s beats false timeouts at 30 s; no-retry keeps a hung AE from stacking.

## Migration Plan

No data or config migration. Contributors: run `git config core.hooksPath .githooks` once, use `npm run test:e2e` instead of `test:integration`. Rollback = revert the slice; no user-facing artifacts change.

## Open Questions

None blocking. D8's exact slide-size setter and D7's full alias coverage are resolved during implementation against the running apps, within the spec'd behaviour.
