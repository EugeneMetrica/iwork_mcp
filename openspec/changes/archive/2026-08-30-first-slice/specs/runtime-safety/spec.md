## Purpose

Keeps the MCP runtime from destroying user state or lying about results: AppleScript string literals are escaped in AppleScript syntax, `iwork-mcp install` never overwrites an unparseable Claude config, save tools report honestly on Creator Studio, and osascript timeouts surface as readable errors with no retry.

## ADDED Requirements

### Requirement: AppleScript string literals use AppleScript escaping
Any tool that embeds a user-supplied string into AppleScript source (Keynote master-slide lookup, set-layout, add-slide, compound create, Pages table bridge, Numbers chart bridge, menu-item clicks) SHALL escape it for AppleScript: backslashes doubled, double quotes escaped as `\"`, CR/LF removed. Quote doubling (`""`) MUST NOT be used — osascript rejects it with -2740.

#### Scenario: Document name containing a double quote
- **WHEN** `keynote_list_master_slides` is called with `documentName` = `Quarter "Best" Review` on an open presentation with that name
- **THEN** the tool returns a JSON list of master-slide names in `content[].text` and does not return an `isError` result

#### Scenario: Name with newline in Pages table write
- **WHEN** `pages_write_table_cells` is called with a cell value containing a newline character
- **THEN** the AppleScript bridge writes the cell without an AppleScript syntax error, and the tool returns the JSON write confirmation in `content[].text`

#### Scenario: Bridge syntax failure surfaces as tool error
- **WHEN** the AppleScript bridge cannot execute a constructed script
- **THEN** the MCP client receives an `isError` result whose text contains the NSAppleScript error message (not a silent success)

### Requirement: Install never overwrites an unparseable config
`iwork-mcp install` SHALL abort with a clear error when the existing `claude_desktop_config.json` is not valid JSON, SHALL leave the original file byte-identical, and MUST NOT write a fresh config over it. A `.backup` copy is permitted.

#### Scenario: Broken JSON on disk
- **WHEN** `claude_desktop_config.json` contains `{ not json` and the user runs `iwork-mcp install`
- **THEN** the command exits with an error message naming the config path and the parse problem, the file still contains `{ not json`, and no `mcpServers` entry is written

#### Scenario: Valid config is preserved
- **WHEN** the config parses and contains other `mcpServers` entries
- **THEN** `install` merges the `iwork` entry into the existing JSON and all other entries remain

### Requirement: Save without filePath on Creator Studio reports honestly
On a Creator Studio installation, `keynote_save_presentation`, `numbers_save_document` and `pages_save_document` called without `filePath` SHALL return an `isError` result explaining that Creator Studio requires an explicit absolute `filePath`. They MUST NOT return `{"saved": true}` without saving.

#### Scenario: CS save with no path
- **WHEN** `keynote_save_presentation` is called with `documentName` = `Deck` and no `filePath` on Creator Studio
- **THEN** the result is `isError` and its text states that an absolute `filePath` is required on Creator Studio

#### Scenario: Standard iWork save without path still saves in place
- **WHEN** `keynote_save_presentation` is called without `filePath` on standard iWork
- **THEN** the document is saved in place and `content[].text` reports `saved: true` with the document name

### Requirement: Per-app Creator Studio detection
Creator Studio detection SHALL be per app: `isCreatorStudio(app)` reports true only when that specific app's Creator Studio bundle is installed. A mixed installation (Creator Studio for one app, standard for another) MUST route each app by its own generation.

#### Scenario: Mixed installation routes each app correctly
- **WHEN** only the Numbers Creator Studio bundle is installed and `numbers_save_document` is called without `filePath`
- **THEN** Numbers takes the Creator Studio honest-error path while a simultaneous Keynote save without `filePath` saves in place via the standard path

### Requirement: Readable timeout errors without retry
When an osascript invocation exceeds its timeout, the error surfaced to the MCP client SHALL contain the operation label and the timeout duration in a readable form (e.g. `keynote_export_presentation timed out after 180000 ms`), and the runtime MUST NOT retry the same Apple Event after a timeout.

#### Scenario: Export hangs past the timeout
- **WHEN** a `keynote_export_presentation` osascript call runs longer than its timeout
- **THEN** the MCP client receives one `isError` result whose text contains the operation label and the exceeded timeout, and exactly one osascript process was started for the call
