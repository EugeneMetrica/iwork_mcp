## Why

The roadmap's iteration 2 (docs/roadmap.md) ports the Aeroflot `pixelmator-ops` stack — a proven, deterministic AppleScript CRUD over Pixelmator Pro 3.8 (open/selection/HEX-recolor/layers/canvas/ML-auto/export, validated by a 30+ case CRUD matrix) — into iwork-mcp as a first-class tool package, exactly like Numbers, Pages and Keynote: one zod-validated tool per operation in `src/tools/pixelmator.ts`, registered on the same MCP server. The runtime contract proven in the first slice (asLiteral escaping, per-op timeouts, honest errors, teardown hygiene) carries over; agents get deterministic image editing (exact HEX, crop, merge, background removal, export) with zero token cost instead of generative guessing.

## What Changes

- New `src/tools/pixelmator.ts` with `registerPixelmatorTools(server)` — zod raw shapes, ANNOTATIONS, `{content:[{type:"text",text}], isError?}` results, same conventions as the existing packages. **Adds 24 MCP tools** (117 → 141):
  - Documents/IO: `pixelmator_open_image`, `pixelmator_list_documents`, `pixelmator_get_document_info`, `pixelmator_close_document`, `pixelmator_save_as`, `pixelmator_export_image`, `pixelmator_undo`.
  - Selection/color: `pixelmator_select` (all/none/invert/subject/rect/color-range), `pixelmator_pick_color`, `pixelmator_recolor` (style/fill, HEX target + measured ΔE/RGB-distance verification), `pixelmator_adjust` (saturation/contrast/hue/exposure/temperature/tint/brightness/vibrance/highlights/shadows/sharpen).
  - Layers: `pixelmator_add_image_layer`, `pixelmator_duplicate_layer`, `pixelmator_merge_visible_layers`, `pixelmator_delete_layer`, `pixelmator_add_layer_mask`.
  - Canvas: `pixelmator_crop_canvas`, `pixelmator_resize_image`, `pixelmator_rotate_canvas`, `pixelmator_flip_canvas`.
  - ML auto: `pixelmator_enhance`, `pixelmator_denoise`, `pixelmator_auto_white_balance`, `pixelmator_remove_background`.
- Execution bridge: the shared `runJXA` (JXA by default; AppleScript source built inside scripts uses `asLiteral`/`AS_LITERAL_JXA_HELPER`); per-op timeouts; `documents.byName` addressing with the Aeroflot quirks ported (open → `document 1`, 8→16-bit color ×257, absolute POSIX paths, .pxd sandbox guard, fill-without-selection guard).
- Registration mechanics: `registerPixelmatorTools` in `src/index.ts`; `scripts/sync-tool-counts.ts` extended to the 4th tool file and its replacement targets (README section, package.json description, `src/install.ts` message, registration test counts); Pixelmator section in `src/instructions.ts`; e2e suite extended (`test/pixelmator.test.ts`) with the same teardown hygiene.
- Pixelmator Pro is optional: tools are always registered; every tool returns an honest `isError` when the app is not installed.

## Capabilities

### New Capabilities

- `pixelmator-documents`: open (copy-first with sha256), list, inspect, close, save-as, export, undo — including missing-app and sandbox-guard behaviour.
- `pixelmator-selection-color`: selection modes, colour picking, deterministic HEX recolor (style/fill) with a measured verification metric, colour adjustments.
- `pixelmator-layers`: image-layer creation, duplication, merge-visible, deletion, masks.
- `pixelmator-canvas-auto`: crop/resize/rotate/flip and the ML auto operations (enhance, denoise, white balance, remove background).

### Modified Capabilities

(none — existing Numbers/Pages/Keynote requirements are untouched; only aggregate tool counts change)

## Impact

- Code: new `src/tools/pixelmator.ts`; touched `src/index.ts`, `src/instructions.ts`, `scripts/sync-tool-counts.ts`, `test/registration.test.ts`, `test/helpers/teardown.ts` (PNG artifact rule for Pixelmator), new `test/pixelmator.test.ts`, README, package.json description.
- **Tool count 117 → 141 (user-visible API change)**; `npm run sync-counts` updated and must pass.
- No new runtime dependency (ΔE-2000/RGB metrics are small pure-TS functions).
- Verification: unit (registration/escaping/metrics) runs in CI; tool behaviour requires Pixelmator Pro 3.8+ on this Mac — machine-verified, like the iWork e2e suite. No iWork/Creator Studio generations are involved in this package; behaviour is verified against Pixelmator Pro 3.8+ (`com.pixelmatorteam.pixelmator.x`) only.

## Non-goals

- No raw-AppleScript passthrough tool (the ctl's `run` subcommand is an arbitrary-script execution hazard and has no iwork-mcp analog).
- No brush/stamp/healing/pen tools — the Pixelmator dictionary does not expose them deterministically (applescript-map §7.3).
- No generative editing (stays in the Aeroflot `/xai-gen` flows).
- No changes to Numbers/Pages/Keynote tool behaviour.
- No version bump / publish in this change.
