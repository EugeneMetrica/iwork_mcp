## Purpose

Local quality gates for the nested iwork repo: strict-type-checked lint, typecheck, and git hooks that run them — with e2e only on a Darwin machine that has the iWork apps. GitHub CI stays ubuntu build+unit.

## ADDED Requirements

### Requirement: Lint and typecheck scripts exist and gate the tree
The repo SHALL provide `npm run lint` (ESLint, typescript-eslint strict-type-checked, over `src` and `test`) and `npm run typecheck` (`tsc --noEmit`); both MUST pass on a clean tree and fail on a violating one.

#### Scenario: Clean tree passes gates
- **WHEN** `npm run lint` and `npm run typecheck` run on the untouched tree
- **THEN** both exit 0 with no errors

#### Scenario: Type violation fails lint
- **WHEN** a file in `src/` contains a type-unsafe construct caught by strict-type-checked rules
- **THEN** `npm run lint` exits non-zero and reports the file and rule

### Requirement: Git hooks enforce the gates
With `core.hooksPath` pointing at the repo's `.githooks`, the pre-commit hook SHALL run lint and typecheck and block the commit on failure; the pre-push hook SHALL run lint, typecheck and the unit suite, and additionally the e2e suite when running on Darwin with the iWork apps installed. On a machine without the apps, e2e is skipped, not failed.

#### Scenario: Commit blocked by lint failure
- **WHEN** a developer commits a change that fails `npm run lint`
- **THEN** the pre-commit hook exits non-zero and the commit is not created

#### Scenario: Push on non-Darwin skips e2e
- **WHEN** the pre-push hook runs on a machine without macOS iWork apps
- **THEN** lint, typecheck and unit tests run, e2e is reported as skipped, and the push proceeds when the run gates pass

### Requirement: e2e script targets own documents only
`npm run test:e2e` SHALL run the integration suite with the test-isolation rules applied (only `iwork-mcp-test-`-prefixed documents are closed); `test:integration` SHALL no longer exist as a script name.

#### Scenario: Renamed script works
- **WHEN** a contributor runs `npm run test:e2e` on a Mac with the apps installed
- **THEN** the integration suite executes and its teardown touches only test-prefixed documents
