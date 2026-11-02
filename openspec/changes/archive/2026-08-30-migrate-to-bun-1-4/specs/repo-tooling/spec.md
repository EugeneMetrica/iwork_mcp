## MODIFIED Requirements

### Requirement: Lint and typecheck scripts exist and gate the tree
The repo SHALL provide a lint script (ESLint, typescript-eslint strict-type-checked, over `src` and `test`) and a typecheck script (`tsc --noEmit`); both MUST be invocable via Bun (`bun run lint`, `bun run typecheck`) and MUST pass on a clean tree and fail on a violating one.

#### Scenario: Clean tree passes gates
- **WHEN** `bun run lint` and `bun run typecheck` run on the untouched tree
- **THEN** both exit 0 with no errors

#### Scenario: Type violation fails lint
- **WHEN** a file in `src/` contains a type-unsafe construct caught by strict-type-checked rules
- **THEN** `bun run lint` exits non-zero and reports the file and rule

### Requirement: Git hooks enforce the gates
With `core.hooksPath` pointing at the repo's `.githooks`, the pre-commit hook SHALL run lint and typecheck via Bun and block the commit on failure; the pre-push hook SHALL run lint, typecheck, the unit suite with coverage, and additionally the e2e suite when running on Darwin with the iWork apps installed. On a machine without the apps, e2e is skipped, not failed.

#### Scenario: Commit blocked by lint failure
- **WHEN** a developer commits a change that fails `bun run lint`
- **THEN** the pre-commit hook exits non-zero and the commit is not created

#### Scenario: Push on non-Darwin skips e2e
- **WHEN** the pre-push hook runs on a machine without macOS iWork apps
- **THEN** lint, typecheck and unit tests (with coverage) run, e2e is reported as skipped, and the push proceeds when the run gates pass

### Requirement: e2e script targets own documents only
The e2e script SHALL run the integration suite under Bun with the test-isolation rules applied (only `iwork-mcp-test-`-prefixed documents are closed); `test:integration` SHALL no longer exist as a script name.

#### Scenario: Renamed script works
- **WHEN** a contributor runs `bun run test:e2e` on a Mac with the apps installed
- **THEN** the integration suite executes and its teardown touches only test-prefixed documents

## ADDED Requirements

### Requirement: CI builds and tests on Bun 1.4
GitHub Actions `build-and-test` SHALL run on `ubuntu-latest` with Bun 1.4 (not a Node 18/22 matrix), install via Bun, then build, run the unit suite with coverage, and `sync-counts`. The `spec-validate` job SHALL remain.

#### Scenario: CI unit job uses Bun
- **WHEN** a push or pull request against `main` triggers CI
- **THEN** `build-and-test` installs Bun 1.4, does not use `actions/setup-node` for the test matrix, and the unit+coverage+sync-counts steps exit 0

#### Scenario: spec-validate still runs
- **WHEN** the same workflow runs
- **THEN** the `spec-validate` job still executes `openspec validate --all --strict` (or skips cleanly when there are no active changes)
