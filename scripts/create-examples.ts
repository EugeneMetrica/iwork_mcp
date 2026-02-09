/**
 * Example file generator.
 *
 * Creates small sample documents in Numbers, Pages, and Keynote
 * using the same in-memory MCP transport as the test suite.
 * Files are saved to the examples/ directory.
 *
 * Usage:
 *   node --import tsx scripts/create-examples.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerNumbersTools } from "../src/tools/numbers.js";
import { registerPagesTools } from "../src/tools/pages.js";
import { registerKeynoteTools } from "../src/tools/keynote.js";
import { INSTRUCTIONS } from "../src/instructions.js";
import { resolve } from "node:path";
import { runJXA } from "../src/jxa.js";

// ── Helpers ──

async function createClient() {
  const server = new McpServer(
    { name: "iwork-mcp-examples", version: "0.0.0" },
    { instructions: INSTRUCTIONS },
  );
  registerNumbersTools(server);
  registerPagesTools(server);
  registerKeynoteTools(server);

  const client = new Client({ name: "examples-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { server, client };
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  if (result.isError) throw new Error(`Tool ${name} failed: ${text}`);
  return JSON.parse(text);
}

const examplesDir = resolve(import.meta.dirname!, "../examples");

// ═══════════════════════════════════════════════════════════════
// Numbers: Simple table with headers, data, formatting, formula
// ═══════════════════════════════════════════════════════════════

async function createSampleNumbers(client: Client) {
  console.log("Creating sample.numbers...");

  const doc = await call(client, "numbers_create_document");
  const docName = doc.name;

  const data = [
    ["Product", "Q1", "Q2", "Q3", "Q4", "Total"],
    ["Widgets", 1200, 1350, 1100, 1500, null],
    ["Gadgets", 800, 950, 1050, 1200, null],
    ["Gizmos", 450, 500, 620, 700, null],
    ["Total", null, null, null, null, null],
  ];

  await call(client, "numbers_create_sheet_with_table", {
    documentName: docName,
    sheetName: "Sales",
    tableName: "Quarterly Sales",
    data,
    headerRowCount: 1,
    columnWidths: [100, 80, 80, 80, 80, 90],
    formatting: [
      { cellRange: "A1:F1", bold: true, fontSize: 11, textColor: "#FFFFFF", backgroundColor: "#2C3E50" },
      { cellRange: "A5:F5", bold: true, backgroundColor: "#EBF5FB" },
      { cellRange: "F1:F5", bold: true },
      { cellRange: "B2:F5", alignment: "right" as const },
    ],
  });

  // Total formulas — row totals
  for (let row = 2; row <= 4; row++) {
    await call(client, "numbers_set_formula", {
      documentName: docName, cellRef: `F${row}`, formula: `=SUM(B${row}:E${row})`,
      sheetName: "Sales", tableName: "Quarterly Sales",
    });
  }
  // Column totals
  for (const col of ["B", "C", "D", "E", "F"]) {
    await call(client, "numbers_set_formula", {
      documentName: docName, cellRef: `${col}5`, formula: `=SUM(${col}2:${col}4)`,
      sheetName: "Sales", tableName: "Quarterly Sales",
    });
  }

  // Delete default sheet
  try {
    await call(client, "numbers_delete_sheet", { documentName: docName, sheetName: "Sheet 1" });
  } catch { /* may not exist */ }

  const filePath = `${examplesDir}/sample.numbers`;
  const saved = await call(client, "numbers_save_document", { documentName: docName, filePath });
  await call(client, "numbers_close_document", { documentName: saved.name, saving: "no" });
  console.log(`  Saved: ${filePath}`);
}

// ═══════════════════════════════════════════════════════════════
// Pages: Short meeting notes document
// ═══════════════════════════════════════════════════════════════

async function createSamplePages(client: Client) {
  console.log("Creating sample.pages...");

  const accent = "#2E86AB";
  const dark = "#1A1A1A";
  const body = "#2D2D2D";
  const grey = "#666666";

  const paragraphs = [
    { text: "Team Standup Notes", fontSize: 22, fontName: "HelveticaNeue-Bold", textColor: dark },
    { text: "February 10, 2026  |  Engineering Team  |  Room 4B", fontSize: 10, fontName: "HelveticaNeue", textColor: grey },
    { text: " ", fontSize: 8, fontName: "Helvetica" },
    { text: "Attendees", fontSize: 13, fontName: "HelveticaNeue-Bold", textColor: accent },
    { text: "Alice Chen, Bob Martinez, Carol Kim, Dave Patel, Eve Johnson", fontSize: 11, fontName: "HelveticaNeue", textColor: body },
    { text: " ", fontSize: 8, fontName: "Helvetica" },
    { text: "Action Items", fontSize: 13, fontName: "HelveticaNeue-Bold", textColor: accent },
    { text: "\u2022  Alice: Finalize API schema for v2 endpoints by Wednesday", fontSize: 11, fontName: "HelveticaNeue", textColor: body },
    { text: "\u2022  Bob: Investigate CI pipeline timeout on integration tests", fontSize: 11, fontName: "HelveticaNeue", textColor: body },
    { text: "\u2022  Carol: Ship onboarding flow redesign to staging", fontSize: 11, fontName: "HelveticaNeue", textColor: body },
    { text: "\u2022  Dave: Review and merge pull requests #142, #145", fontSize: 11, fontName: "HelveticaNeue", textColor: body },
    { text: " ", fontSize: 8, fontName: "Helvetica" },
    { text: "Next Meeting", fontSize: 13, fontName: "HelveticaNeue-Bold", textColor: accent },
    { text: "Wednesday, February 12 at 10:00 AM. Carol to demo the new onboarding flow.", fontSize: 11, fontName: "HelveticaNeue", textColor: body },
  ];

  const filePath = `${examplesDir}/sample.pages`;
  const doc = await call(client, "pages_create_document_with_content", { paragraphs, filePath });
  await call(client, "pages_close_document", { documentName: doc.name, saving: "no" });
  console.log(`  Saved: ${filePath}`);
}

// ═══════════════════════════════════════════════════════════════
// Keynote: 3-slide presentation
// ═══════════════════════════════════════════════════════════════

async function createSampleKeynote(client: Client) {
  console.log("Creating sample.key...");

  const slides = [
    {
      title: "Project Aurora",
      body: "Q1 2026 Kickoff",
      notes: "Welcome everyone to the Project Aurora kickoff. Today we'll cover goals, timeline, and team assignments.",
    },
    {
      title: "Goals for Q1",
      body: "Launch beta to 500 users by March 15\nAchieve 90% test coverage on core modules\nComplete security audit with zero critical findings\nPublish public API documentation",
      notes: "These four goals are our north star for the quarter. Beta launch is the top priority — everything else supports it.",
    },
    {
      title: "Thank You",
      body: "Questions? Reach out on #project-aurora",
      notes: "Open floor for questions. Remind team about the Slack channel for async discussion.",
    },
  ];

  const doc = await call(client, "keynote_create_presentation_with_slides", { slides });

  // Save and close via direct JXA — Keynote's save({ in: }) is unreliable
  // across separate osascript subprocesses, so we do it in one call.
  const filePath = `${examplesDir}/sample.key`;
  await runJXA(`
    const app = Application("Keynote");
    const doc = app.documents[0];
    doc.save({ in: Path(params.path) });
    doc.close({ saving: "no" });
  `, { path: filePath });
  console.log(`  Saved: ${filePath}`);
}

// ── Main ──

const { client, server } = await createClient();

try {
  await createSampleNumbers(client);
  await createSamplePages(client);
  await createSampleKeynote(client);
  console.log("\nAll example files saved to examples/");
} finally {
  await client.close();
  await server.close();
}
