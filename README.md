# iwork-mcp

MCP server for Apple iWork automation — 73 tools for Numbers, Pages, and Keynote.

One line to install. Works with Claude Desktop, Claude Code, and any MCP client.

## What it does

Ask Claude to build spreadsheets, write documents, and create presentations — it controls the real iWork apps on your Mac through Apple's JavaScript for Automation (JXA) scripting bridge.

**Numbers** — Create spreadsheets, read/write cells and ranges, set formulas, sort rows, merge cells, format cells (fonts, colors, backgrounds, alignment), manage sheets and tables, set column widths and row heights, bulk-create sheets with data and formatting in one call, export to PDF/Excel/CSV.

**Pages** — Create documents, read and insert text at any position, find and replace (preserves formatting), format paragraphs (font, size, color, bold, italic), insert images and tables, export to PDF/Word/EPUB.

**Keynote** — Create presentations, add/delete/duplicate/reorder/skip slides, read slide content, set titles and bullet points, add images and shapes, set transitions and presenter notes, list master slide layouts, start/stop slideshows, export to PDF/PowerPoint/HTML.

## Install

### Claude Desktop

```bash
npx iwork-mcp install
```

Then restart Claude Desktop (Cmd+Q and reopen). Done.

### Claude Code

```bash
claude mcp add iwork -- npx -y iwork-mcp
```

### Requirements

- macOS with Numbers, Pages, and Keynote installed (free from the App Store)
- [Node.js 18+](https://nodejs.org) (`brew install node` if you have Homebrew)
- On first use, macOS will ask to grant Automation permission — click OK

## Examples

> Create a new Numbers spreadsheet with columns Name, Age, and City. Add 5 rows of sample data and a SUM formula for the ages.

> Open my budget spreadsheet at ~/Documents/budget.numbers and add a new row for February.

> Create a Keynote presentation about renewable energy with 6 slides. Each slide should have a title and 3-4 bullet points.

> Make a Pages document with a project proposal. Include a title, three sections with headers, and export it as a PDF to my Desktop.

> Create a 2026 calendar in Numbers with a sheet for each month, colored headers, and weekend highlighting.

## Tools

### Numbers (36 tools)

| Tool | Description |
|------|-------------|
| `numbers_list_documents` | List all open documents |
| `numbers_create_document` | Create a new spreadsheet |
| `numbers_open_document` | Open a .numbers file |
| `numbers_save_document` | Save a document |
| `numbers_export_document` | Export to PDF, Excel, or CSV |
| `numbers_close_document` | Close a document |
| `numbers_list_sheets` | List sheets in a document |
| `numbers_add_sheet` | Add a new sheet |
| `numbers_rename_sheet` | Rename a sheet |
| `numbers_delete_sheet` | Delete a sheet |
| `numbers_list_tables` | List tables with dimensions |
| `numbers_add_table` | Create a new table (configurable headers) |
| `numbers_rename_table` | Rename a table |
| `numbers_delete_table` | Delete a table |
| `numbers_read_table` | Read all data as a 2D array |
| `numbers_read_cell` | Read a single cell |
| `numbers_read_range` | Read a specific cell range |
| `numbers_get_table_info` | Get table metadata |
| `numbers_write_cell` | Write a value to a cell |
| `numbers_write_cells` | Batch write multiple cells |
| `numbers_write_table` | Bulk write a 2D array (fast) |
| `numbers_set_formula` | Set a formula on a cell |
| `numbers_add_row` | Add rows with optional data |
| `numbers_add_column` | Add a column |
| `numbers_delete_row` | Delete rows |
| `numbers_delete_column` | Delete columns |
| `numbers_sort_rows` | Sort table by a column |
| `numbers_set_header_rows` | Set header row count (0 removes header styling) |
| `numbers_set_header_columns` | Set header column count |
| `numbers_merge_cells` | Merge a cell range |
| `numbers_unmerge_cells` | Unmerge cells |
| `numbers_clear_cells` | Clear cell contents |
| `numbers_format_cells` | Set font, size, color, bold, italic, alignment, background |
| `numbers_set_column_width` | Set column width |
| `numbers_set_row_height` | Set row height |
| `numbers_create_sheet_with_table` | Create a full sheet with table, data, and formatting in one fast call |

### Pages (15 tools)

| Tool | Description |
|------|-------------|
| `pages_list_documents` | List all open documents |
| `pages_create_document` | Create a new document |
| `pages_open_document` | Open a .pages file |
| `pages_save_document` | Save a document |
| `pages_export_document` | Export to PDF, Word, EPUB, or plain text |
| `pages_close_document` | Close a document |
| `pages_get_body_text` | Read all body text |
| `pages_get_paragraphs` | Get paragraphs as indexed array |
| `pages_add_text` | Append text (preserves formatting) |
| `pages_insert_text_at` | Insert text at a paragraph index |
| `pages_delete_text` | Delete a paragraph |
| `pages_replace_text` | Find and replace (preserves formatting) |
| `pages_format_text` | Set font, size, color, bold, italic on a paragraph |
| `pages_add_image` | Insert an image |
| `pages_add_table` | Insert a table |

### Keynote (22 tools)

| Tool | Description |
|------|-------------|
| `keynote_list_presentations` | List all open presentations |
| `keynote_create_presentation` | Create a new presentation |
| `keynote_open_presentation` | Open a .key file |
| `keynote_save_presentation` | Save a presentation |
| `keynote_export_presentation` | Export to PDF, PowerPoint, HTML, or images |
| `keynote_close_presentation` | Close a presentation |
| `keynote_list_slides` | List slides with titles |
| `keynote_get_slide_content` | Read all content from a slide |
| `keynote_list_master_slides` | List available slide layouts |
| `keynote_add_slide` | Add a slide with optional layout |
| `keynote_delete_slide` | Delete a slide |
| `keynote_duplicate_slide` | Duplicate a slide |
| `keynote_reorder_slide` | Move a slide to a new position |
| `keynote_skip_slide` | Hide/unhide a slide |
| `keynote_set_slide_title` | Set slide title text |
| `keynote_set_slide_body` | Set slide body / bullet points |
| `keynote_add_image_to_slide` | Add an image to a slide |
| `keynote_add_shape` | Add a shape with text |
| `keynote_set_presenter_notes` | Set presenter notes |
| `keynote_set_transition` | Set slide transition effect |
| `keynote_start_slideshow` | Start playing the presentation |
| `keynote_stop_slideshow` | Stop the slideshow |

## How it works

The server runs JXA (JavaScript for Automation) scripts via `osascript` to control iWork apps. Each tool call is a single `osascript` invocation — parameters go in as JSON via `argv[0]`, results come back as JSON via stdout.

```
Claude Desktop / Claude Code
  ↓ MCP protocol over stdio
iwork-mcp server (Node.js)
  ↓ child_process.execFile
/usr/bin/osascript -l JavaScript
  ↓ JXA scripting bridge
Numbers.app / Pages.app / Keynote.app
```

## Development

```bash
git clone https://github.com/reichenbach/iwork_mcp.git
cd iwork-mcp
npm install
npm run build
```

To test locally with Claude Desktop, point to your local build:

```json
{
  "mcpServers": {
    "iwork": {
      "command": "node",
      "args": ["/absolute/path/to/iwork-mcp/dist/index.js"]
    }
  }
}
```

## Limitations

- **macOS only** — requires Numbers, Pages, and Keynote (free from the App Store)
- **Apps are visible** — iWork apps launch and show windows; there's no headless mode
- **~430ms per call** — osascript startup overhead per tool invocation (use bulk tools like `create_sheet_with_table` for speed)
- **Formulas are write-only** — Apple's scripting dictionary returns computed values, not formula text
- **No comments or track changes** — not exposed in the scripting dictionary
- **First-use permission prompt** — macOS will ask to grant Automation access once

## License

MIT
