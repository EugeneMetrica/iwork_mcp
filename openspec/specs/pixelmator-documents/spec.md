# pixelmator-documents Specification

## Purpose
Deterministic document I/O over Pixelmator Pro: opening images as disposable copies, listing and inspecting open documents, closing, saving-as and exporting — with honest errors when Pixelmator Pro is not installed.

## Requirements

### Requirement: Tools are always registered, app absence is honest
All `pixelmator_*` tools SHALL always be registered on the server. When Pixelmator Pro is not installed, every tool SHALL return an `isError` result naming the missing app, and MUST NOT attempt to launch or install anything.

#### Scenario: Missing app
- **WHEN** `pixelmator_list_documents` is called on a machine without Pixelmator Pro
- **THEN** the result is `isError` and its text names "Pixelmator Pro" as not installed

### Requirement: Open copies before editing
`pixelmator_open_image` SHALL copy the source file to a working location and open the copy, returning the copy's path, the source's sha256, the document name, width/height in pixels, and the stable document id. It MUST NOT open the user's original file in place.

#### Scenario: Original stays untouched
- **WHEN** `pixelmator_open_image` is called with an absolute path to a JPEG
- **THEN** the result reports a copy path different from the source path, a sha256 of the source, and the opened document's dimensions

#### Scenario: Missing file
- **WHEN** `pixelmator_open_image` is called with a non-existent path
- **THEN** the result is `isError` naming the missing file

### Requirement: Document listing and inspection
`pixelmator_list_documents` SHALL return the open Pixelmator documents with their names and stable ids (the id is informational; every tool addresses documents by name). `pixelmator_get_document_info` SHALL return name, width, height, resolution, bits per channel, colour profile, layer count and current layer name, reporting a field as `null` when the app does not provide it.

#### Scenario: List open documents
- **WHEN** two documents are open and `pixelmator_list_documents` is called
- **THEN** the result lists both documents with non-null names and ids

#### Scenario: Inspect an opened image
- **WHEN** `pixelmator_get_document_info` targets a document opened by `pixelmator_open_image`
- **THEN** the result contains non-null name, width and height

### Requirement: Close, save-as and export with explicit targets
`pixelmator_close_document` SHALL close by name with `saving` defaulting to `no`. `pixelmator_save_as` SHALL write a new document file to an absolute path (formats: pxd, png, jpeg, tiff, heic, webp, gif, pdf, psd, svg) and reject saving `.pxd` into `/tmp` (app sandbox) before any AppleScript runs. `pixelmator_export_image` SHALL export to an absolute path (formats: png, jpeg, tiff, heic, webp, gif, pdf, psd, bmp; optional quality/compression factor), wait until the file exists, and report the exported path and byte size — `isError` if the file did not appear.

#### Scenario: Export produces a file
- **WHEN** `pixelmator_export_image` is called with an absolute output path and format png on an open document
- **THEN** the result reports the exported path and byte size, and the file exists on disk

#### Scenario: Export that never produced a file
- **WHEN** the bridge reports success but the output file did not appear within the wait window
- **THEN** the result is `isError` naming the expected output path

#### Scenario: pxd into tmp is rejected
- **WHEN** `pixelmator_save_as` is called with a `/tmp/...` destination and `.pxd` format
- **THEN** the result is `isError` explaining the app sandbox restriction, before any AppleScript runs

#### Scenario: Save-as success
- **WHEN** `pixelmator_save_as` is called with an absolute destination and format pxd on an open document
- **THEN** the result reports the written path and byte size, and the file exists

### Requirement: Undo is explicit and bounded
`pixelmator_undo` SHALL undo the requested number of steps (default 1, bounded) on the targeted document and report the number of steps performed.

#### Scenario: Bounded undo
- **WHEN** `pixelmator_undo` is called with `times: 3` after three separate edits
- **THEN** the result reports 3 undone steps

### Requirement: Missing-app and bridge failures surface as tool errors
Whenever the Apple bridge fails (app not running, document not found, script error), the MCP client SHALL receive an `isError` result whose text contains the underlying error description (e.g. OsascriptError message), never a silent success.

#### Scenario: Unknown document name
- **WHEN** any document-targeting pixelmator tool is called with a document name that is not open
- **THEN** the result is `isError` with a not-found description

### Requirement: e2e teardown covers Pixelmator
The e2e suite SHALL treat Pixelmator Pro as a suite app under the established isolation rules: test documents carry the `iwork-mcp-test-` prefix, teardown closes only tracked/prefixed documents, exports them as PNG artifacts into `test/artifacts/` (Pixelmator's native image export replaces the Microsoft-format rule that applies to the iWork apps), and quits the app only if the suite launched it.

#### Scenario: Pixelmator test document is exported and closed
- **WHEN** the pixelmator e2e suite opens a test document and finishes
- **THEN** a PNG export of that document exists in `test/artifacts/` and no `iwork-mcp-test-` document remains open
