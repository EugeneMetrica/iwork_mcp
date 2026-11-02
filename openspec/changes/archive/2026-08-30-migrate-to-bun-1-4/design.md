## Context

See proposal.md — Why. Current facts:

- Local Bun is 1.4.0. `bun test` already runs the five unit files that import `node:test` + `node:assert/strict`: **69 pass / 0 fail** (2026-08-30 probe), including InMemoryTransport registration of 141 tools.
- Scripts still say `node --import tsx`; `engines` is `node >= 18`; CI is ubuntu Node 18/22 matrix (`ci.yml:10-29`).
- Published contract: `bin.iwork-mcp` = `dist/index.js`; `install.ts` writes `npx -y iwork-mcp`. Consumers include Claude Desktop (Node).
- Tool logic (`src/tools/*`, `src/jxa.ts`) uses `node:child_process` `execFile` + osascript. No tool-surface change.
- Execution bridges stay as in AGENTS.md: JXA default, NSAppleScript where JXA is broken, UI scripting last (Accessibility). This change does not add a bridge.

## Goals / Non-Goals

**Goals:**

- One documented way to install, test, build, lint: Bun 1.4.
- Keep the npm-published Node bin so `npx iwork-mcp` still works.
- Coverage gate on the unit suite; CI without Node matrix.
- Rollback = revert package.json + lock + CI + hooks, not `src/tools`.

**Non-Goals:**

- `bun:test` API rewrite unless the probe regresses.
- `bun build --compile`, publish, version bump.
- macOS e2e on GitHub runners.

## Decisions

### D1: Keep `node:test` imports; run them with `bun test`
Probe proved compatibility. Rewriting 10 files to `bun:test` is churn without a behaviour delta. Alternative rejected: Vitest-under-Bun (extra runner). Fallback: if a file breaks, convert that file only.

### D2: `bun build` with `--target node` for the published bin
`package.json` `build` becomes `bun build src/index.ts --outdir dist --target node --format esm && chmod +x dist/index.js`. Target is **node** so `npx` (Node) can still spawn the bin. Shebang stays `#!/usr/bin/env node`. Alternative rejected: `--target bun` (breaks npx); `--compile` (not the npm contract).

`createRequire(import.meta.url)` for `package.json` version in `src/index.ts` must survive the bundle — verify after first build; if it breaks, inline version via `import pkg from "../package.json" with { type: "json" }` or a define.

### D3: Dual engines, Bun-first scripts
```json
"engines": { "bun": ">=1.4.0", "node": ">=18" },
"packageManager": "bun@1.4.0"
```
`node` stays so the published bin remains honest. Scripts (`test`, `test:e2e`, `test:all`, `sync-counts`, `prepare`) call `bun`. `tsx` is removed from devDependencies. `typescript` stays for `tsc --noEmit`.

### D4: Lockfile
`bun install` produces `bun.lock`. Keep `package-lock.json` only if npm publish tooling still needs it; otherwise delete after `bun install` succeeds and CI no longer runs `npm ci`. Decision: **drop `package-lock.json`**, CI uses `bun install --frozen-lockfile`. Rollback restores the lock from git.

### D5: Coverage
Unit script: `bun test test/registration.test.ts test/jxa.test.ts test/handle-jxa.test.ts test/install.test.ts test/pixelmator-metrics.test.ts --coverage`. No numeric threshold in this change (Bun text reporter as the gate: non-zero exit). Alternative rejected: forcing a % threshold before we have a Bun coverage baseline.

### D6: CI
`build-and-test`: `ubuntu-latest`, `oven-sh/setup-bun@v2` with `bun-version: 1.4.0`, `bun install --frozen-lockfile`, `bun run build`, `bun test … --coverage`, `bun run sync-counts`. No Node matrix. `spec-validate` unchanged (Node 22 + npx openspec is fine — that job does not run the product).

### D7: Hooks
`.githooks/pre-commit`: `bun run lint`, `bun run typecheck`.
`.githooks/pre-push`: those plus unit+coverage; Darwin+iWork → `bun run test:e2e`.

### D9: e2e timeout and serial files under `bun test`
`node:test` has no default per-test timeout; `bun test` defaults to 5000 ms and runs files with `--max-concurrency` 20. First Darwin run under Bun killed `pages_add_table` (UI-scripting >5 s) and the Pixelmator `before` hook, then closed the in-memory MCP transport (`Connection closed`) so the rest of the Pages table block skipped. The e2e script MUST pass `--timeout=180000 --max-concurrency=1`. Unit script keeps the 5 s default (fast suite). Alternative rejected: raising the global default in `bunfig.toml` — that would hide hung unit tests.

Killing osascript mid-UI-script also left Pages with documents but zero System Events windows (`-1719 Invalid index` on `window 1` of process `Pages` — the process name is still the base name, the comment on `processName()` is correct). `pagesInsertTableViaUI` now re-activates and waits until `count of windows > 0` before clicking. This is a host-robustness fix in `src/jxa.ts`, not a tool-surface change.

### D8: Bridges / tool surface / instructions
No MCP tool added/renamed/removed. `src/instructions.ts` unchanged. README gains a one-line "Dev: Bun 1.4" under Build; tool counts untouched. AGENTS.md Testing / Build sections replace Node+tsx with Bun. `openspec/config.yaml` pointer: engines Bun 1.4, gate `bun run build && bun test && bun run sync-counts`.

Applicable known quirks: none of the JXA bugs are exercised by this change. No new workaround.

## Risks / Trade-offs

- [Risk] `bun build` bundles MCP SDK in a way Node cannot load (dynamic import / undici) → Mitigation: `--target node`, smoke `node dist/index.js` on Darwin (will connect stdio; send EOF). If fail, `--packages external` for `@modelcontextprotocol/sdk`.
- [Risk] `createRequire(package.json)` breaks in the bundle → Mitigation: first-build check; switch to JSON import.
- [Risk] Coverage reporter noise / flaky percentages → Mitigation: gate on exit code only this change.
- [Risk] Contributors without Bun → Mitigation: engines field + README; this is the point of the iteration.
- [Trade-off] Published bin still Node-oriented (`npx`) while repo is Bun. Accepted: Claude Desktop is Node; changing install to `bunx` would be BREAKING.

## Migration Plan

1. `bun install` + commit `bun.lock`; switch scripts; drop `tsx` and Node CI matrix.
2. Verify: unit 69, `bun run build`, `node dist/index.js` smoke, `bun run lint` / `typecheck` / `sync-counts`.
3. Darwin e2e: `bun run test:e2e` (86+).
4. Rollback: revert the commit(s) that touch package.json / lock / CI / hooks / AGENTS.md. `src/tools` should be empty in the diff.

## Open Questions

None that block the spec or tasks. Numeric coverage threshold deferred.
