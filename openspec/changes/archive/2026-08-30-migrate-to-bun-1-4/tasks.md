## 1. Package manager and scripts

- [x] 1.1 Add `engines.bun` (>=1.4.0) and `packageManager: bun@1.4.0`, keep `engines.node >= 18` for the published bin, and verify `package.json` contains both engine keys
- [x] 1.2 Rewrite `scripts` (`build`, `test`, `test:e2e`, `test:all`, `sync-counts`, `prepare`, `dev`) to Bun invocations with `--coverage` on the unit suite, remove the `tsx` devDependency, and verify no script contains `node --import tsx`
- [x] 1.3 Run `bun install`, commit the resulting `bun.lock`, drop `package-lock.json` from CI use, and verify `bun install --frozen-lockfile` exits 0
- [x] 1.4 Point `build` at `bun build src/index.ts --outdir dist --target node --format esm && chmod +x dist/index.js` and verify `dist/index.js` exists, is executable, and `bin.iwork-mcp` still points at it

## 2. Hooks, CI, docs

- [x] 2.1 Switch `.githooks/pre-commit` and `pre-push` to `bun run lint` / `typecheck` / unit+coverage / Darwin e2e and verify the hook files contain no `npm run` calls
- [x] 2.2 Replace the Node 18/22 matrix in `.github/workflows/ci.yml` with `oven-sh/setup-bun@v2` bun 1.4.0, `bun install --frozen-lockfile`, build, unit+coverage, `sync-counts`; leave `spec-validate`; verify the workflow YAML has no `node-version` matrix
- [x] 2.3 Update AGENTS.md Testing/Build, `openspec/config.yaml` pointer, README one-liner, and `docs/roadmap.md` iteration 3 status, and verify those files no longer claim `node:test`+`tsx` as the runner

## 3. Behaviour gates (RED already observed: unit 69/69 under Bun; now they must stay green via the new scripts)

- [x] 3.1 Run `bun run test` (unit + coverage) and verify 69 pass, 0 fail, coverage reporter prints
- [x] 3.2 Run `bun run build` then smoke `node dist/index.js` (EOF) and verify it starts without a missing-module error
- [x] 3.3 Run `bun run lint && bun run typecheck && bun run sync-counts` and verify all exit 0 with a clean `git diff --exit-code` after sync-counts
- [x] 3.4 Run `bun run test:e2e` on this Darwin machine with the apps (Numbers, Pages, Keynote, Pixelmator) and verify the suite matches or exceeds the 86-pass baseline without close-all of foreign documents

## 4. Acceptance extras (same MCP, agent e2e)

- [x] 4.1 Confirm `src/index.ts` still registers all four apps on one server and `test/registration.test.ts` still asserts 141 tools (no tool-surface diff)
- [x] 4.2 Dispatch an independent headless grok-4.3 agent against the live MCP to exercise CRUD+export on each of the four apps and write `test/artifacts/agent-grok-43.md`; verify the report exists and lists pass/fail per app

## 5. Review gate

- [x] 5.1 Run `/opsx-review migrate-to-bun-1-4` and get verdict PASS or PASS_WITH_NOTES
