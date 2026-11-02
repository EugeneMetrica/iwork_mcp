## Why

The published MCP surface (141 tools, one server) is done; the remaining roadmap item is the runtime. Dev and CI still run Node 18/22 + `tsx` + `node:test`, while the target stack is Bun 1.4. Acceptance (`docs/acceptance.md` G3–G5) cannot close until scripts, coverage, and CI are Bun-native and the four apps still pass CRUD on that same MCP.

## What Changes

- Dev/test/build scripts switch from `node --import tsx` / `tsc && chmod` to `bun test` / `bun build` / `bun run`. `tsx` leaves the tree.
- `package.json` records Bun 1.4 (`packageManager`, `engines.bun`). Published `bin` (`iwork-mcp` → `dist/index.js`) and `iwork-mcp install` (`npx -y iwork-mcp`) stay the Node-consumable contract — **not BREAKING** for MCP clients.
- GitHub `build-and-test` drops the Node 18/22 matrix for a Bun 1.4 job on `ubuntu-latest`. `spec-validate` stays.
- Coverage (`bun test --coverage`) becomes a pre-push and CI gate on the unit suite.
- Hooks and `sync-counts` call Bun. AGENTS.md / `openspec/config.yaml` stop claiming Node+tsx as the runner.
- No MCP tools added, renamed, or removed. Numbers / Pages / Keynote / Pixelmator behaviour is unchanged; Creator Studio 15.x is a **regression** target (existing e2e), not a new verification surface.

### Non-goals

- Tool-surface changes, hang-protocol, GUI mutex, FS allowlist.
- Rewriting JXA / `src/tools/*` for Bun APIs.
- Replacing `node:test` imports with `bun:test` unless `bun test` stops running the current files (probe: 69/69 already green on Bun 1.4.0).
- `bun build --compile` standalone binary, npm publish, version bump, git tags.
- Self-hosted macOS e2e in GitHub CI (e2e remains Darwin-local).

## Capabilities

### New Capabilities

- `bun-runtime`: Bun 1.4 is the repo runtime/PM/bundler; unit tests and coverage run under `bun test`; `bun build` emits the published `dist/index.js`.

### Modified Capabilities

- `repo-tooling`: lint / typecheck / unit / e2e / hooks / CI scripts are invoked via Bun, not `npm run` + Node matrix.

## Impact

`package.json`, `bun.lock`, `.github/workflows/ci.yml`, `.githooks/*`, `scripts/sync-tool-counts.ts` shebang, AGENTS.md, `openspec/config.yaml`, `docs/roadmap.md`. `src/` tool files untouched except a shebang comment if the built bin still needs `#!/usr/bin/env node` for `npx`. MCP SDK stdio and InMemoryTransport must keep working under `bun test` (already observed on the unit suite).
