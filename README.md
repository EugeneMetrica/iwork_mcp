# iwork-mcp

MCP server that lets AI assistants create, read, edit, and export Apple iWork documents (Numbers, Pages, Keynote) through natural language.

One line to install. Works with Claude Desktop and any MCP client.

## What it does

Ask Claude to build spreadsheets, write documents, and create presentations — and it controls the real iWork apps on your Mac through Apple's JavaScript for Automation (JXA) scripting bridge.

**Numbers** — Create spreadsheets, read/write cells, set formulas, format ranges, add rows and columns, export to PDF/Excel/CSV.

**Pages** — Create documents, read and append text, find and replace, format paragraphs, insert images and tables, export to PDF/Word/EPUB.

**Keynote** — Create presentations, add slides, set titles and bullet points, add images and shapes, set transitions and presenter notes, start slideshows, export to PDF/PowerPoint/HTML.

49 tools total.

## Setup

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "iwork": {
      "command": "npx",
      "args": ["-y", "iwork-mcp"]
    }
  }
}
```

Restart Claude Desktop. The tools will appear automatically.

### Requirements

- macOS (any version with iWork installed — it's free on every Mac)
- Node.js 18+
- On first use, macOS will prompt you to grant Automation permission

## Examples

> Create a new Numbers spreadsheet with columns Name, Age, and City. Add 5 rows of sample data and a SUM formula for the ages.

> Open my budget spreadsheet at ~/Documents/budget.numbers and add a new row for February.

> Create a Keynote presentation about renewable energy with 6 slides. Each slide should have a title and 3-4 bullet points.

> Make a Pages document with a project proposal. Include a title, three sections with headers, and export it as a PDF to my Desktop.

## Tools

### Numbers (21 tools)

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
| `numbers_list_tables` | List tables with dimensions |
| `numbers_add_table` | Create a new table |
| `numbers_read_table` | Read all data as a 2D array |
| `numbers_read_cell` | Read a single cell |
| `numbers_get_table_info` | Get table metadata |
| `numbers_write_cell` | Write a value to a cell |
| `numbers_write_cells` | Batch write multiple cells |
| `numbers_set_formula` | Set a formula on a cell |
| `numbers_add_row` | Add rows with optional data |
| `numbers_add_column` | Add a column |
| `numbers_format_cells` | Set font, size, color, alignment, background |
| `numbers_set_column_width` | Set column width |
| `numbers_set_row_height` | Set row height |

### Pages (13 tools)

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
| `pages_add_text` | Append text to body |
| `pages_replace_text` | Find and replace text |
| `pages_format_text` | Set font, size, color, bold, italic on a paragraph |
| `pages_add_image` | Insert an image |
| `pages_add_table` | Insert a table |

### Keynote (15 tools)

| Tool | Description |
|------|-------------|
| `keynote_list_presentations` | List all open presentations |
| `keynote_create_presentation` | Create a new presentation |
| `keynote_open_presentation` | Open a .key file |
| `keynote_save_presentation` | Save a presentation |
| `keynote_export_presentation` | Export to PDF, PowerPoint, HTML, or images |
| `keynote_close_presentation` | Close a presentation |
| `keynote_list_slides` | List slides with titles |
| `keynote_add_slide` | Add a slide with optional layout |
| `keynote_set_slide_title` | Set slide title text |
| `keynote_set_slide_body` | Set slide body / bullet points |
| `keynote_add_image_to_slide` | Add an image to a slide |
| `keynote_add_shape` | Add a shape with text |
| `keynote_set_presenter_notes` | Set presenter notes |
| `keynote_set_transition` | Set slide transition effect |
| `keynote_start_slideshow` | Start playing the presentation |

## How it works

The server runs JXA (JavaScript for Automation) scripts via `osascript` to control iWork apps. Each tool call is a single `osascript` invocation that does all work internally — parameters go in as JSON via `argv[0]`, results come back as JSON via stdout.

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
git clone https://github.com/nickarino/iwork-mcp.git
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

- **macOS only** — requires iWork apps (Numbers, Pages, Keynote), which are free on every Mac
- **Apps are visible** — iWork apps launch and show their windows; there's no headless mode
- **~430ms per call** — osascript startup overhead on each tool invocation
- **Formulas are write-only** — Apple's scripting dictionary returns computed values, not the formula text
- **No comments or track changes** — not exposed in the scripting dictionary
- **First-use permission prompt** — macOS will ask you to grant Automation access once

## License

MIT
