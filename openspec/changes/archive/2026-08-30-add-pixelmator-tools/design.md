## Context

See proposal.md — Why. Grounding facts:

- Source stack: Aeroflot `pixelmator_ops.py` (1069 lines, 15 subcommands) + `applescript-map.md` (sdef 210 KB, 81 commands, 15 quirks §7.3, 30+-case CRUD matrix, all green on Pixelmator Pro 3.8). Target app bundle `com.pixelmatorteam.pixelmator.x`; Pixelmator Pro 3.8 is installed on this Mac (`/Applications/Pixelmator Pro.app`).
- The iwork-mcp conventions this port must match: `server.tool(name, description, zodRawShape, ANNOTATIONS, callback)`, `handleJXA`/`toolResult` from `src/handle-jxa.ts`, `asLiteral` escaping, per-op timeouts, e2e teardown hygiene.
- `scripts/sync-tool-counts.ts` is hardcoded to numbers/pages/keynote and rewrites counts into package.json, README.md, test/registration.test.ts, src/install.ts.
- sdef extraction via `sdef` CLI returned empty for this bundle; dictionary facts come from the Aeroflot map and empirical probing during apply.

## Goals / Non-Goals

**Goals:** one zod tool per Aeroflot operation (24 tools, 117→141), same result shapes and honesty rules as iWork packages; registration pipeline extended to the 4th package; e2e coverage with the established teardown hygiene.

**Non-Goals:** see proposal.md (no raw-script tool, no brush/healing, no generative editing, no iWork behaviour changes, no publish).

## Decisions

### D1: Execution bridge — JXA via shared runJXA
All tools go through the existing `runJXA` (`Application("Pixelmator Pro")`), like the iWork packages; strings embedded into AppleScript source use `asLiteral`/`AS_LITERAL_JXA_HELPER`. The Aeroflot stack drove Pixelmator with plain osascript AppleScript; the operations are expressible in JXA syntax, and where a JXA construct misbehaves (discovered empirically per tool), the fallback is the established NSAppleScript-bridge pattern (as for Keynote master slides). No UI scripting anywhere in this package — the dictionary covers everything (applescript-map catalog). Pixelmator Pro participates in `rewriteAppNames`? No — it has no Creator-Studio variant; the app name is constant.

### D2: Document addressing — by name, autosave-tolerant
Tools address documents by name (`documents.byName`); every tool requires `documentName` — the id field in open/list results is informational only, never an addressing key. The Aeroflot window-index/doc-id duality is not exposed: names are the MCP-boundary contract. Pixelmator autosave can transiently rename open documents (extension flip), so document-resolution retries the `.pxd`-suffixed name on -1728, mirroring `injectDocumentNameResolution` (implemented inside `src/tools/pixelmator.ts`, not in the shared jxa.ts — the `.pxd` rule is Pixelmator-specific). The ctl's `open --workdir` flag is intentionally not exposed: open always works on a managed copy (working location is derived, collision with the source directory is rejected with an honest error).

### D3: Colour handling — HEX at the boundary, 16-bit at the bridge
`color` parameters are `#RRGGBB` (zod regex). Internally 8-bit → 16-bit via ×257 — the same convention already documented for Numbers colours in AGENTS.md. `pixelmator_recolor` returns the applied colour (8/16-bit), the selection bounds it acted on, and a measured verification sample (coordinate, measured HEX, distance to target). Distance metrics are small pure-TS functions ported from `pixelmator_ops.py` (ΔE-2000 default, RGB-Euclid optional) in `src/tools/pixelmator.ts`; unit-tested against known reference pairs. No new dependency.

### D4: Ported quirks (applescript-map §7.3) become tool behaviour
- `open` returns missing value → resolve `document 1` after opening (and never open the original: copy-first with sha256).
- Duplicate resolves through `layer 1`.
- All file parameters are absolute POSIX paths (zod `startsWith("/")`).
- `.pxd` into `/tmp` is rejected by zod refine with a clear message — before any bridge call (app sandbox).
- `fill` without an active selection would fill the whole layer → guarded `isError` unless `wholeLayer: true`.
- Locale number coercion: integers coerced on the AppleScript side, floats normalised TS-side.
- Per-operation timeouts: selection/adjust/layer/canvas ops → `TIMEOUT_CREATE`; export/save-as/ML-auto (enhance, denoise, white balance, remove background — these are the slow ones) → `TIMEOUT_EXPORT`; list/info/pick/undo → default 30 s. The no-retry-after-timeout rule applies unchanged.
Any new quirk discovered during apply is appended to the AGENTS.md bug list.

### D5: Missing-app honesty with an injectable seam
`pixelmator.ts` resolves the app once (`/Applications/Pixelmator Pro.app` existsSync, detection function injectable for unit tests, like `isCreatorStudioApp`). When absent, every tool returns `isError` naming Pixelmator Pro — tools are still registered so the surface is discoverable. No auto-install, no launch attempts.

### D6: Registration pipeline extension
- `src/index.ts` calls `registerPixelmatorTools(server)`.
- `scripts/sync-tool-counts.ts` counts the 4th file and its replacement targets gain Pixelmator: package.json description, README `### Pixelmator (N tools)` section, `src/install.ts` message ("141 tools for Numbers, Pages, Keynote, and Pixelmator"), registration test constants.
- `test/registration.test.ts` asserts 24 pixelmator tools and the total 141.
- `src/instructions.ts` gains a Pixelmator section (copy-first editing, HEX recolor with verification metric, sandbox guard).

**Tool signature (all 24):** zod raw shapes (never `z.object()`); callbacks return `handleJXA(...)`/`toolResult(...)` → `{content:[{type:"text",text}], isError?}` with JSON text payloads on success and prose+underlying-error on failure; common parameters are `documentName` (string) and absolute file paths (`z.string().startsWith("/")`); annotations — `readOnly` for list/info/pick, `destructive` for delete-layer/crop/close, `readWrite` for the rest; error contract note: the ctl's `{ok,cmd,data,error}` JSON envelope is superseded by the MCP `isError` convention on purpose.

### D6a: Bridge probe before bulk implementation
Before writing the 24 tools, one task probes every Aeroflot AppleScript idiom through JXA against the running Pixelmator Pro 3.8 (`fill ... with color`, `set fill color of styles`, `export ... as ... with properties {compression factor}`, `select color range`, ML commands). Idioms that misbehave in JXA are ported through the NSAppleScript-inside-JXA bridge (with `asLiteral`/`AS_LITERAL_JXA_HELPER`), and the per-tool bridge choice (JXA vs AS-bridge) is recorded in a comment block at the top of `src/tools/pixelmator.ts`; newly discovered quirks are appended to the AGENTS.md bug list.
- Annotations: list/info/pick are read-only; destructive ops (delete-layer, crop, close) get `destructive`; the rest readWrite — matching ANNOTATIONS conventions.

### D6b: Boundary-parameter validation mechanism (recorded deviation)
`pixelmator_select` cross-parameter requirements (rect needs bounds; color-range needs colour) are enforced by explicit throws inside the callback rather than a zod `superRefine` — the observable contract is identical (rejected before any app contact, honest isError), only the mechanism differs from the spec's wording. Recorded during review as an accepted deviation.

### D6c: Open dispatch is bounded, not synchronous (recorded deviation from the first unlocked run)
The original open tool held one synchronous AppleScript (`open` + in-script poll + property read). Live verification showed the `open` Apple event may never send its reply on a healthy unlocked app — the document loads, the sender hangs until the AE timeout. The tool now dispatches `open` inside a `with timeout of 10 seconds` (the resulting -1712 is caught and ignored) and polls the plain-JXA document list every 500 ms up to 60 s; the poll path stays responsive even while the open event stalls. Additionally `runASJXA` no longer re-parses osascript stdout (`runJXA` already JSON-parses it — a second `JSON.parse(String(raw))` mangled any document name starting with a digit), and `runDocAS` resolves the document name against the live document list before each run (names drift: "X.png"→"X", duplicate opens get "X 2", autosave makes "X.pxd"). Phrasings corrected against the app's own sdef: `pick color` returns a plain {R,G,B,alpha} list (no red/green/blue properties), `fill` takes the document as its direct parameter and has no opacity parameter (supplying one is an honest isError), `duplicate`/`delete` need element specifiers (`layer (index of current layer)`) because the `current layer` property is rejected. Full quirk list lives in AGENTS.md.

### D7: e2e and teardown
`test/pixelmator.test.ts` joins `test:e2e` (skips when the app is absent). Test documents use the `iwork-mcp-test-` prefix and the same tracked-teardown rules; pixelmator artifacts export as PNG into `test/artifacts/` (the MS-format rule is iWork-specific — image export is Pixelmator's native output). `test/helpers/teardown.ts` gains Pixelmator as a suite app (per-app artifact format map). Machine-verified on this Mac; CI keeps running unit only.

## Applicable known quirks (AGENTS.md check)

Carried over and honoured: asLiteral escaping contract, per-op timeouts + no-retry, honest isError results, teardown prefix rule. Pixelmator-specific quirks (D4) live in `src/tools/pixelmator.ts`; if apply uncovers new bridge quirks they are appended to the AGENTS.md list.

## Risks / Trade-offs

- [JXA expressiveness gaps vs raw AppleScript] → per-tool empirical verification on this machine; NSAppleScript bridge fallback (D1).
- [Document name collisions / autosave races] → `.pxd` retry (D2); the Aeroflot stable doc-id is a candidate follow-up if races bite in practice.
- [ML auto ops on large images exceed 90 s] → they are classed as export-tier (180 s) in D4.
- [24 new tools inflate the client surface] → that is the point of "полностью по аналогии"; naming stays strictly `pixelmator_*` so clients can filter.

## Migration Plan

Prerequisite: the first-slice runtime helpers this design builds on (`src/handle-jxa.ts`, timeouts, teardown helper, per-app detection) are on the branch (implemented, change `first-slice` not yet archived) — apply against that state. Additive only: registration, counts and docs move together so every commit keeps the gates green (see tasks group 1); rollback = revert the change. No data or config migration.

## Open Questions

None blocking. Exact AppleScript phrasings per tool are resolved during apply against the running Pixelmator 3.8 (the Aeroflot map is the reference), within the spec'd behaviour.
