## 1. Pipeline first — every commit keeps gates green

- [x] 1.1 Extend `scripts/sync-tool-counts.ts` to the 4th tool file (`src/tools/pixelmator.ts`) and its replacement targets (package.json description, README `### Pixelmator (N tools)` section, `src/install.ts` message wording "…Numbers, Pages, Keynote, and Pixelmator", registration test constants); verify `npm run sync-counts` and `npm test` stay green with an empty pixelmator.ts (counts 117)
- [x] 1.2 Create `src/tools/pixelmator.ts` skeleton: injectable app-detection seam (unit test RED first: missing-app → every tool returns isError naming Pixelmator Pro), shared `documentRef` helper with `.pxd` autosave retry, zod `hexColor` and `absPath` schemas with the `/tmp .pxd` refine; wire `registerPixelmatorTools` into `src/index.ts`; RED→green, then `npm run sync-counts` + `npm test` green at this commit boundary
- [x] 1.3 Bridge probe (design D6a): exercise every Aeroflot AppleScript idiom through JXA against the running Pixelmator Pro 3.8; record the per-tool bridge choice (JXA vs NSAppleScript-inside-JXA) in a comment block at the top of `src/tools/pixelmator.ts`; append newly discovered quirks to AGENTS.md
- [x] 1.4 RED: unit tests for the colour metrics (hex parse, 8→16-bit ×257, ΔE-2000 against known reference pairs, RGB-Euclid fallback) in `test/pixelmator-metrics.test.ts`; capture RED, implement as pure functions in `src/tools/pixelmator.ts`; green; gates green at the commit boundary

## 2. Tools — documents/IO (7)

Each tool lands with its schema validated via InMemoryTransport calls against the injected bridge seam; after each group: `npm run sync-counts && npm test` green (registration counts track the actual `server.tool` count via sync-counts).

- [x] 2.1 `pixelmator_open_image` (copy-first, sha256, dimensions, informational id, workdir-collision rejection), `pixelmator_list_documents`, `pixelmator_get_document_info` (per-field null fallback)
- [x] 2.2 `pixelmator_close_document` (saving enum default no), `pixelmator_save_as` (sandbox refine before any bridge call), `pixelmator_export_image` (waits for file, reports bytes, isError if absent), `pixelmator_undo` (bounded, ≥1, default 1)

## 3. Tools — selection/color (4)

- [x] 3.1 `pixelmator_select` (mode enum; rect bounds / color-range colour+range default 30 validated at the zod boundary), `pixelmator_pick_color` (HEX consistent with 8-bit RGB)
- [x] 3.2 `pixelmator_recolor` (style/fill; no-selection guard → isError unless wholeLayer; measured sample auto-centred on selection/canvas; ΔE-2000 default metric), `pixelmator_adjust` (object of optional numerics, applied-dict result)

## 4. Tools — layers (5), canvas (4), ML auto (4)

- [x] 4.1 `pixelmator_add_image_layer`, `pixelmator_duplicate_layer` (layer-1 quirk internal), `pixelmator_merge_visible_layers`, `pixelmator_delete_layer`, `pixelmator_add_layer_mask` (from-file, reveal/hide)
- [x] 4.2 `pixelmator_crop_canvas`, `pixelmator_resize_image` (width/height required at schema), `pixelmator_rotate_canvas`, `pixelmator_flip_canvas`
- [x] 4.3 `pixelmator_enhance`, `pixelmator_denoise` (intensity), `pixelmator_auto_white_balance`, `pixelmator_remove_background` — export-tier timeout (180 s)
- [x] 4.4 Final surface: registration test asserts 24 pixelmator tools / total 141; `npm run sync-counts` rewrites the last targets; `git diff --exit-code` clean after it; Pixelmator section in `src/instructions.ts` (copy-first, HEX verification, sandbox guard)

## 5. e2e on this Mac

- [x] 5.1 Extend `test/helpers/teardown.ts` with Pixelmator as a suite app (PNG artifact format, same prefix/quit rules); create `test/pixelmator.test.ts` (skips without the app) covering the minimum matrix: open copy (original untouched) → info → select rect → recolor #FF0000 with measured metric → layer add/duplicate/delete → crop → one ML op → export PNG artifact → close; sandbox `/tmp .pxd` rejection asserted; all test docs prefixed `iwork-mcp-test-`; add to `test:e2e` file list
- [x] 5.2 Machine run: full `npm run test:e2e` green including the pixelmator suite (**this Mac**, Pixelmator Pro 3.8 installed, session unlocked for any UI-dependent path). Green 2026-08-30: **86/86, 0 skipped** — pixelmator 9/9 and the pre-existing `Pages adds a table` UI-scripting test both pass after the host process received the ACCESSIBILITY TCC grant (System Events menu/window scripting; separate from the Automation grant). Live-run fixes are in commit `a317cf4`.

## 6. Gate, docs and review

- [x] 6.1 Gate: `npm run build && npm test && npm run lint && npm run typecheck && npm run sync-counts` all pass, `git diff --exit-code` clean after sync-counts
- [x] 6.2 README: `### Pixelmator (24 tools)` section body (counts stay sync-counts-managed) + e2e note; AGENTS.md: registration file list + updated tool totals + any new Pixelmator bridge quirks from 1.3
- [x] 6.3 Deep read-only review gate as the final task (subagent; the `/opsx-review` command is not installed): every delta scenario vs implementation, every ticked checkbox vs reality, gate command from 6.1; verdict must be PASS / PASS_WITH_NOTES — on FAIL, fix and re-run. No version bump, no publish, no tags at any point (release is a separate manual step). Verdict: **PASS_WITH_NOTES** (2026-08-30, post-`a317cf4` re-review; zero blocking issues; 6 LOW notes → backlog).
