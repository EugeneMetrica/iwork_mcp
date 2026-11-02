# test-isolation Specification

## Purpose
Guarantees the integration/e2e suite can never destroy user work: teardown and cleanup touch only documents the suite itself created, identified by the `iwork-mcp-test-` name prefix.

## Requirements

### Requirement: Teardown closes only test-prefixed documents
The integration suite teardown SHALL close only documents whose name starts with `iwork-mcp-test-` (without saving) and MUST NOT close any other open document in Numbers, Pages or Keynote.

#### Scenario: Foreign document survives the test run
- **WHEN** a user document `Family Budget` and a test document `iwork-mcp-test-sample` are open, and the integration suite finishes
- **THEN** `iwork-mcp-test-sample` is closed and `Family Budget` is still open

#### Scenario: No test documents left behind
- **WHEN** the integration suite creates documents during a run and teardown executes
- **THEN** no document whose name starts with `iwork-mcp-test-` remains open

### Requirement: e2e suite never issues a blanket close
The e2e test code SHALL track every document it creates and close documents individually by name; no e2e code path MAY close all open documents regardless of name.

#### Scenario: Close-all is unreachable from test code
- **WHEN** the e2e suite source is inspected for document-closing calls
- **THEN** every close targets a tracked test-prefixed name and no unconditional close-all of an app's documents exists

### Requirement: Post-run hygiene — Microsoft-format artifacts and quit launched apps
After the e2e run, the suite SHALL export every document it created to a Microsoft Office format (Numbers→`.xlsx`, Pages→`.docx`, Keynote→`.pptx`) into a local artifacts directory before closing the document, and SHALL quit every app that the suite itself launched (i.e. that was not running before the run). Apps that were already running before the run MUST be left running, and a quit MUST be skipped for any app that still has non-test documents open.

#### Scenario: Created deck is exported before teardown
- **WHEN** the suite creates `iwork-mcp-test-deck` in Keynote and the run finishes
- **THEN** a `.pptx` export of that deck exists in the artifacts directory before the document is closed

#### Scenario: Suite-launched app is quit, user-launched app is not
- **WHEN** Keynote was not running before the run and Pages was running with a user document, and the run finishes
- **THEN** Keynote is quit by the teardown and Pages is left running with the user document untouched
