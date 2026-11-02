# bun-runtime Specification

## Purpose
Defines Bun 1.4 as the repository runtime, package manager, test runner and bundler for iwork-mcp, without changing the published MCP tool surface or the `iwork-mcp` bin contract that npm clients consume.

## Requirements

### Requirement: Bun 1.4 is the development runtime
The repository SHALL declare Bun 1.4 as its package manager and engine. Contributors MUST be able to install dependencies with Bun and run the documented scripts without Node or `tsx`.

#### Scenario: Fresh clone installs with Bun
- **GIVEN** a clone of the repository and Bun 1.4.x on PATH
- **WHEN** the contributor runs the documented install command
- **THEN** a Bun lockfile is present and `node_modules` is populated without invoking `npm ci`

#### Scenario: Missing Bun is a hard failure
- **GIVEN** Bun is not on PATH
- **WHEN** a documented test or build script is invoked
- **THEN** the command fails with a missing-runtime error rather than silently falling back to Node+tsx

### Requirement: Unit tests run under Bun
The unit suite SHALL execute via Bun's test runner and MUST keep at least the pre-migration baseline of 69 passing unit tests. MCP InMemoryTransport registration of all 141 tools MUST still succeed under that runner.

#### Scenario: Unit suite matches baseline
- **GIVEN** a clean tree after the migration
- **WHEN** the unit-test script runs
- **THEN** it exits 0 and reports at least 69 passing tests including "registers all 141 tools"

#### Scenario: Registration still talks MCP
- **GIVEN** the unit suite's in-memory MCP client
- **WHEN** `listTools` is called
- **THEN** the client receives 50 Numbers, 26 Pages, 41 Keynote and 24 Pixelmator tools with non-empty descriptions and object input schemas

### Requirement: Coverage is a quality gate
The unit suite SHALL produce a coverage report via Bun, and both the pre-push hook and CI MUST fail when the coverage command exits non-zero.

#### Scenario: Coverage command is wired
- **GIVEN** a clean tree
- **WHEN** the coverage script or `bun test --coverage` equivalent runs on the unit files
- **THEN** it exits 0 and writes a text coverage summary

#### Scenario: Coverage failure blocks push
- **GIVEN** `core.hooksPath` points at `.githooks`
- **WHEN** the pre-push hook runs
- **THEN** it invokes the coverage-capable unit run and exits non-zero if that run fails

### Requirement: Build emits the published bin
`bun build` SHALL emit `dist/index.js` as an ESM Node-target bundle that remains the `package.json` `bin.iwork-mcp` entry. `iwork-mcp install` MUST still write `{ "command": "npx", "args": ["-y", "iwork-mcp"] }` into Claude Desktop config.

#### Scenario: Built bin is executable
- **GIVEN** a successful build
- **WHEN** `dist/index.js` is inspected
- **THEN** the file exists, is executable, and `package.json` `bin.iwork-mcp` still points at it

#### Scenario: Install contract unchanged
- **GIVEN** a valid Claude Desktop config without an iwork entry
- **WHEN** `iwork-mcp install` (or `installTo`) runs
- **THEN** the written entry is still `npx -y iwork-mcp` and no Bun-specific command replaces it
