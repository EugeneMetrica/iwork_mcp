/**
 * Showcase document builder for screenshots.
 *
 * Creates polished demo documents in Numbers, Pages, and Keynote
 * using the same in-memory MCP transport as the test suite.
 * Documents stay open for manual screenshotting.
 *
 * Usage:
 *   node --import tsx scripts/create-screenshots.ts [budget|resume|pitch|all]
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerNumbersTools } from "../src/tools/numbers.js";
import { registerPagesTools } from "../src/tools/pages.js";
import { registerKeynoteTools } from "../src/tools/keynote.js";
import { INSTRUCTIONS } from "../src/instructions.js";

// ── Helpers ──

async function createClient() {
  const server = new McpServer(
    { name: "iwork-mcp-showcase", version: "0.0.0" },
    { instructions: INSTRUCTIONS },
  );
  registerNumbersTools(server);
  registerPagesTools(server);
  registerKeynoteTools(server);

  const client = new Client({ name: "showcase-client", version: "0.0.0" });
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

// ═══════════════════════════════════════════════════════════════
// Numbers: Monthly Budget — Transactions + Summary sheets
// ═══════════════════════════════════════════════════════════════

async function createBudget(client: Client) {
  console.log("Creating Numbers budget...");

  const doc = await call(client, "numbers_create_document");
  const docName = doc.name;

  // ── Sheet 1: Transactions ──

  const txnHeader = ["Date", "Description", "Category", "Amount", "Type"];
  const transactions: (string | number)[][] = [
    // Income
    ["02/01/2026", "Paycheck — direct deposit", "Salary", 4250, "Income"],
    ["02/14/2026", "Paycheck — direct deposit", "Salary", 4250, "Income"],
    ["02/05/2026", "Logo design — Freelance Co", "Freelance", 1200, "Income"],
    ["02/18/2026", "App redesign — StartupXYZ", "Freelance", 1150, "Income"],
    ["02/01/2026", "Dividend — VTSAX", "Investments", 380, "Income"],
    // Housing
    ["02/01/2026", "Rent — February", "Housing", -2200, "Expense"],
    ["02/05/2026", "Renters insurance", "Housing", -95, "Expense"],
    // Utilities
    ["02/03/2026", "PG&E electric", "Utilities", -142, "Expense"],
    ["02/03/2026", "Comcast internet", "Utilities", -79, "Expense"],
    ["02/10/2026", "AT&T phone", "Utilities", -89, "Expense"],
    // Transportation
    ["02/01/2026", "Car payment", "Transportation", -385, "Expense"],
    ["02/08/2026", "Shell gas", "Transportation", -52, "Expense"],
    ["02/20/2026", "Shell gas", "Transportation", -48, "Expense"],
    // Food & Dining
    ["02/02/2026", "Whole Foods", "Groceries", -187, "Expense"],
    ["02/09/2026", "Trader Joe's", "Groceries", -134, "Expense"],
    ["02/16/2026", "Safeway", "Groceries", -156, "Expense"],
    ["02/23/2026", "Whole Foods", "Groceries", -163, "Expense"],
    ["02/07/2026", "Nobu — dinner", "Dining", -142, "Expense"],
    ["02/14/2026", "Valentine's dinner", "Dining", -195, "Expense"],
    ["02/22/2026", "Brunch — The Mill", "Dining", -73, "Expense"],
    // Personal
    ["02/01/2026", "Spotify + Netflix + iCloud", "Subscriptions", -38, "Expense"],
    ["02/01/2026", "Equinox gym", "Subscriptions", -95, "Expense"],
    ["02/12/2026", "Amazon — headphones", "Shopping", -189, "Expense"],
    ["02/19/2026", "Uniqlo", "Shopping", -121, "Expense"],
    // Savings
    ["02/01/2026", "401k contribution", "Savings", -1500, "Expense"],
    ["02/01/2026", "Emergency fund transfer", "Savings", -500, "Expense"],
  ];

  const txnData = [txnHeader, ...transactions];

  await call(client, "numbers_create_sheet_with_table", {
    documentName: docName,
    sheetName: "Transactions",
    tableName: "Transactions",
    data: txnData,
    headerRowCount: 1,
    columnWidths: [100, 240, 120, 100, 80],
    formatting: [
      // Header row
      { cellRange: "A1:E1", bold: true, fontSize: 11, fontName: "HelveticaNeue-Bold", textColor: "#FFFFFF", backgroundColor: "#1F3864" },
      // Alternating rows
      ...transactions.map((_, i) => ({
        cellRange: `A${i + 2}:E${i + 2}`,
        backgroundColor: i % 2 === 0 ? "#FFFFFF" : "#F2F2F2",
      })),
      // Amount column right-aligned
      { cellRange: "D1:D27", alignment: "right" as const },
      // Date column center
      { cellRange: "A2:A27", alignment: "center" as const },
      // Type column center
      { cellRange: "E1:E27", alignment: "center" as const },
    ],
  });

  // Color income amounts green, expense amounts red
  for (let i = 0; i < transactions.length; i++) {
    const row = i + 2;
    const amount = transactions[i][3] as number;
    await call(client, "numbers_format_cells", {
      documentName: docName,
      cellRange: `D${row}`,
      format: { textColor: amount >= 0 ? "#548235" : "#C00000", bold: true },
      sheetName: "Transactions",
      tableName: "Transactions",
    });
  }

  // ── Sheet 2: Monthly Summary ──

  // Row map:
  //  1  Title (merged)
  //  2  (spacer)
  //  3  Column headers
  //  4  INCOME label
  //  5  Salary
  //  6  Freelance
  //  7  Investments
  //  8  Total Income
  //  9  (spacer)
  // 10  EXPENSES label
  // 11  Housing
  // 12  Utilities
  // 13  Transportation
  // 14  Groceries
  // 15  Dining
  // 16  Subscriptions
  // 17  Shopping
  // 18  Savings
  // 19  Total Expenses
  // 20  (spacer)
  // 21  NET SAVINGS

  const categories = [
    { name: "Salary", budgeted: 8500 },
    { name: "Freelance", budgeted: 2000 },
    { name: "Investments", budgeted: 400 },
  ];
  const expenses = [
    { name: "Housing", budgeted: 2300 },
    { name: "Utilities", budgeted: 300 },
    { name: "Transportation", budgeted: 500 },
    { name: "Groceries", budgeted: 600 },
    { name: "Dining", budgeted: 350 },
    { name: "Subscriptions", budgeted: 130 },
    { name: "Shopping", budgeted: 200 },
    { name: "Savings", budgeted: 2000 },
  ];

  const summaryData: (string | number | null)[][] = [
    ["February 2026 Budget", null, null, null, null],       // 1
    [null, null, null, null, null],                          // 2
    ["Category", "Budgeted", "Actual", "Difference", "% Used"], // 3
    ["INCOME", null, null, null, null],                      // 4
    ...categories.map(c => [c.name, c.budgeted, null, null, null] as (string | number | null)[]),  // 5-7
    ["Total Income", null, null, null, null],                // 8
    [null, null, null, null, null],                          // 9
    ["EXPENSES", null, null, null, null],                    // 10
    ...expenses.map(c => [c.name, c.budgeted, null, null, null] as (string | number | null)[]),  // 11-18
    ["Total Expenses", null, null, null, null],              // 19
    [null, null, null, null, null],                          // 20
    ["NET SAVINGS", null, null, null, null],                 // 21
  ];

  await call(client, "numbers_create_sheet_with_table", {
    documentName: docName,
    sheetName: "Summary",
    tableName: "Summary",
    data: summaryData,
    headerRowCount: 0,
    columnWidths: [150, 105, 105, 105, 80],
    rowHeights: [
      36,  // 1  title
      8,   // 2  spacer
      28,  // 3  headers
      26,  // 4  INCOME label
      24, 24, 24,  // 5-7  income items
      28,  // 8  Total Income
      8,   // 9  spacer
      26,  // 10 EXPENSES label
      24, 24, 24, 24, 24, 24, 24, 24,  // 11-18 expense items
      28,  // 19 Total Expenses
      8,   // 20 spacer
      30,  // 21 NET SAVINGS
    ],
    formatting: [
      // Title
      { cellRange: "A1:E1", bold: true, fontSize: 15, fontName: "HelveticaNeue-Bold", textColor: "#FFFFFF", backgroundColor: "#1F3864", alignment: "center" },
      // Spacers blank
      { cellRange: "A2:E2", backgroundColor: "#FFFFFF" },
      { cellRange: "A9:E9", backgroundColor: "#FFFFFF" },
      { cellRange: "A20:E20", backgroundColor: "#FFFFFF" },
      // Column headers
      { cellRange: "A3:E3", bold: true, fontSize: 10, fontName: "HelveticaNeue-Bold", textColor: "#FFFFFF", backgroundColor: "#4472C4", alignment: "center" },
      { cellRange: "A3", alignment: "left" },
      // Section labels
      { cellRange: "A4:E4", bold: true, fontSize: 10, fontName: "HelveticaNeue-Bold", textColor: "#1F3864", backgroundColor: "#D6E4F0" },
      { cellRange: "A10:E10", bold: true, fontSize: 10, fontName: "HelveticaNeue-Bold", textColor: "#1F3864", backgroundColor: "#D6E4F0" },
      // Income rows alternating
      { cellRange: "A5:E5", backgroundColor: "#FFFFFF" },
      { cellRange: "A6:E6", backgroundColor: "#F2F2F2" },
      { cellRange: "A7:E7", backgroundColor: "#FFFFFF" },
      // Total Income
      { cellRange: "A8:E8", bold: true, fontName: "HelveticaNeue-Bold", backgroundColor: "#D6E4F0", textColor: "#1F3864" },
      // Expense rows alternating
      { cellRange: "A11:E11", backgroundColor: "#FFFFFF" },
      { cellRange: "A12:E12", backgroundColor: "#F2F2F2" },
      { cellRange: "A13:E13", backgroundColor: "#FFFFFF" },
      { cellRange: "A14:E14", backgroundColor: "#F2F2F2" },
      { cellRange: "A15:E15", backgroundColor: "#FFFFFF" },
      { cellRange: "A16:E16", backgroundColor: "#F2F2F2" },
      { cellRange: "A17:E17", backgroundColor: "#FFFFFF" },
      { cellRange: "A18:E18", backgroundColor: "#F2F2F2" },
      // Total Expenses
      { cellRange: "A19:E19", bold: true, fontName: "HelveticaNeue-Bold", backgroundColor: "#D6E4F0", textColor: "#1F3864" },
      // NET SAVINGS
      { cellRange: "A21:E21", bold: true, fontSize: 11, fontName: "HelveticaNeue-Bold", textColor: "#FFFFFF", backgroundColor: "#548235" },
      // Alignment
      { cellRange: "B4:E21", alignment: "right" },
      { cellRange: "A4:A21", alignment: "left" },
    ],
  });

  // Merge title row
  await call(client, "numbers_merge_cells", {
    documentName: docName, cellRange: "A1:E1", sheetName: "Summary", tableName: "Summary",
  });

  const sf = (cellRef: string, formula: string) =>
    call(client, "numbers_set_formula", { documentName: docName, cellRef, formula, sheetName: "Summary", tableName: "Summary" });

  // SUMIFS formulas — pull actuals from Transactions sheet
  // Income rows (positive amounts): use ABS to show as positive
  const incomeCategories = ["Salary", "Freelance", "Investments"];
  for (let i = 0; i < incomeCategories.length; i++) {
    const row = 5 + i;
    await sf(`C${row}`, `=SUMIFS(Transactions::Transactions::D:D, Transactions::Transactions::C:C, A${row})`);
    await sf(`D${row}`, `=C${row}-B${row}`);
    await sf(`E${row}`, `=IF(B${row}=0, 0, ROUND(C${row}/B${row}, 2))`);
  }

  // Total Income
  await sf("B8", "=SUM(B5:B7)");
  await sf("C8", "=SUM(C5:C7)");
  await sf("D8", "=C8-B8");
  await sf("E8", "=IF(B8=0, 0, ROUND(C8/B8, 2))");

  // Expense rows (negative amounts in transactions — use ABS)
  const expenseCategories = ["Housing", "Utilities", "Transportation", "Groceries", "Dining", "Subscriptions", "Shopping", "Savings"];
  for (let i = 0; i < expenseCategories.length; i++) {
    const row = 11 + i;
    await sf(`C${row}`, `=ABS(SUMIFS(Transactions::Transactions::D:D, Transactions::Transactions::C:C, A${row}))`);
    await sf(`D${row}`, `=C${row}-B${row}`);
    await sf(`E${row}`, `=IF(B${row}=0, 0, ROUND(C${row}/B${row}, 2))`);
  }

  // Total Expenses
  await sf("B19", "=SUM(B11:B18)");
  await sf("C19", "=SUM(C11:C18)");
  await sf("D19", "=C19-B19");
  await sf("E19", "=IF(B19=0, 0, ROUND(C19/B19, 2))");

  // Net Savings
  await sf("B21", "=B8-B19");
  await sf("C21", "=C8-C19");
  await sf("D21", "=C21-B21");
  await sf("E21", "=IF(B8=0, 0, ROUND(C21/B8, 2))");

  // Format % Used column as percentage
  await call(client, "numbers_format_cells", {
    documentName: docName,
    cellRange: "E5:E8",
    format: { numberFormat: "percent" },
    sheetName: "Summary",
    tableName: "Summary",
  });
  await call(client, "numbers_format_cells", {
    documentName: docName,
    cellRange: "E11:E19",
    format: { numberFormat: "percent" },
    sheetName: "Summary",
    tableName: "Summary",
  });
  await call(client, "numbers_format_cells", {
    documentName: docName,
    cellRange: "E21",
    format: { numberFormat: "percent" },
    sheetName: "Summary",
    tableName: "Summary",
  });

  // Color the Difference column — green for favorable, red for unfavorable
  const fmt = (cellRange: string, textColor: string) =>
    call(client, "numbers_format_cells", {
      documentName: docName, cellRange, format: { textColor, bold: true }, sheetName: "Summary", tableName: "Summary",
    });

  // Income: positive diff = good
  for (const row of [5, 6, 7, 8]) {
    // We need to check the actual computed values — let's just color based on known data
    // Salary: 8500 budget, 8500 actual = 0 diff
    // Freelance: 2000 budget, 2350 actual = +350 (green)
    // Investments: 400 budget, 380 actual = -20 (red)
    // For showcase, just color all non-zero diffs
  }
  await fmt("D6", "#548235");   // Freelance +350
  await fmt("D7", "#C00000");   // Investments -20
  await fmt("D8", "#548235");   // Total Income +330

  // Expenses: positive diff (over budget) = bad, negative = good
  await fmt("D12", "#C00000");  // Utilities over
  await fmt("D13", "#548235");  // Transportation under
  await fmt("D14", "#C00000");  // Groceries over
  await fmt("D15", "#C00000");  // Dining over
  await fmt("D16", "#548235");  // Subscriptions under (exact)
  await fmt("D17", "#C00000");  // Shopping over
  await fmt("D19", "#C00000");  // Total Expenses over

  await fmt("D21", "#548235");  // Net Savings positive

  // Delete default Sheet 1
  try {
    await call(client, "numbers_delete_sheet", { documentName: docName, sheetName: "Sheet 1" });
  } catch { /* may not exist */ }

  console.log(`  Done: "${docName}"`);
  return docName;
}

// ═══════════════════════════════════════════════════════════════
// Pages: Professional Resume
// ═══════════════════════════════════════════════════════════════

async function createResume(client: Client) {
  console.log("Creating Pages resume...");

  // Color system — teal accent like the AI-generated resumes
  const accent = "#1B7F79";
  const dark = "#1A1A1A";
  const grey = "#666666";
  const body = "#2D2D2D";
  const rule = "\u2500".repeat(85);

  // Helpers — each paragraph is its own entry to avoid index shifting
  const bullet = (text: string) =>
    ({ text: `\u2022  ${text}`, fontSize: 10.5, fontName: "HelveticaNeue", textColor: body });
  const divider = () =>
    ({ text: rule, fontSize: 6, fontName: "HelveticaNeue-Light", textColor: "#BBBBBB" });
  const section = (text: string) =>
    ({ text, fontSize: 11.5, fontName: "HelveticaNeue-Bold", textColor: accent });
  const jobHeader = (title: string, company: string, date: string) =>
    ({ text: `${title}  |  ${company}  |  ${date}`, fontSize: 10.5, fontName: "HelveticaNeue-Bold", textColor: dark });
  const spacer = () =>
    ({ text: " ", fontSize: 5, fontName: "Helvetica" as const, textColor: body });
  const skillRow = (label: string, skills: string) =>
    ({ text: `${label}:  ${skills}`, fontSize: 10.5, fontName: "HelveticaNeue", textColor: body });

  const paragraphs = [
    // Header
    { text: "SARAH CHEN", fontSize: 28, fontName: "HelveticaNeue-Bold", textColor: dark },
    { text: "Senior Product Manager", fontSize: 13, fontName: "HelveticaNeue", textColor: accent },
    { text: "San Francisco, CA  |  sarah.chen@email.com  |  (415) 555-0142  |  linkedin.com/in/sarahchen", fontSize: 9.5, fontName: "HelveticaNeue", textColor: grey },

    divider(),

    // Professional Summary
    section("PROFESSIONAL SUMMARY"),
    { text: "Product leader with 6+ years shipping consumer and enterprise products at scale. Track record of driving $12M+ in measurable revenue impact through data-informed strategy, cross-functional leadership, and rapid experimentation. Experienced in payments, marketplace, and productivity domains.", fontSize: 10.5, fontName: "HelveticaNeue", textColor: body },

    divider(),

    // Technical Skills — categorized like the AI resumes
    section("TECHNICAL SKILLS"),
    skillRow("Analytics", "SQL, Python, Amplitude, Tableau, Mixpanel, Looker"),
    skillRow("Product", "A/B Testing, User Research, Figma, Jira, Linear, Technical Specifications"),
    skillRow("Frameworks", "Agile/Scrum, OKRs, RICE Scoring, Jobs-to-be-Done, Double Diamond"),

    divider(),

    // Experience
    section("EXPERIENCE"),

    // Job 1: Stripe
    jobHeader("Senior Product Manager", "Stripe", "Jan 2024 \u2013 Present"),
    bullet("Redesigned payment retry engine, reducing failed transactions 18% and recovering $12M ARR"),
    bullet("Launched fraud scoring API handling 50K req/s at p99 < 15ms, blocking $3.2M in fraud Q1"),
    bullet("Led cross-functional team of 8 engineers, 2 designers, and 1 data scientist"),
    bullet("Increased sprint velocity 40% by restructuring planning cadence and daily standups"),

    spacer(),

    // Job 2: Airbnb
    jobHeader("Product Manager", "Airbnb", "Jun 2021 \u2013 Dec 2023"),
    bullet("Owned dynamic pricing engine, increasing host revenue 23% across 2M+ listings globally"),
    bullet("Shipped redesigned search experience, lifting conversion from 3.2% to 4.1% (+28%)"),
    bullet("Defined and tracked 12 KPIs for growth team; presented monthly reviews to VP Product"),
    bullet("Drove APAC localization strategy, contributing to 15% international booking growth"),

    spacer(),

    // Job 3: Notion
    jobHeader("Associate Product Manager", "Notion", "Aug 2019 \u2013 May 2021"),
    bullet("Built template gallery adopted by 500K+ workspaces in first year of launch"),
    bullet("Reduced average page load time from 320ms to 85ms through query optimization"),
    bullet("Conducted 40+ user interviews informing collaborative editing roadmap and API strategy"),
    bullet("Partnered with design to ship inline commenting, increasing DAU engagement 12%"),

    divider(),

    // Projects
    section("PROJECTS"),
    { text: "Open Source Metrics Dashboard", fontSize: 10.5, fontName: "HelveticaNeue-Bold", textColor: dark },
    bullet("Built a real-time product analytics dashboard used by 2K+ developers on GitHub"),
    { text: "Stripe Developer Experience Research", fontSize: 10.5, fontName: "HelveticaNeue-Bold", textColor: dark },
    bullet("Published internal research paper on API usability that informed Stripe Docs v3 redesign"),

    divider(),

    // Education
    section("EDUCATION"),
    { text: "B.S. Computer Science  |  University of California, Berkeley  |  2019", fontSize: 10.5, fontName: "HelveticaNeue-Bold", textColor: dark },
    { text: "Dean's List (6 semesters)  \u2022  TA, CS 162 Operating Systems  \u2022  GPA 3.8", fontSize: 10, fontName: "HelveticaNeue", textColor: grey },

    divider(),

    // Certifications
    section("CERTIFICATIONS"),
    { text: "Pragmatic Institute PMC-III  \u2022  Google Analytics Certified  \u2022  Certified Scrum Product Owner (CSPO)", fontSize: 10, fontName: "HelveticaNeue", textColor: grey },
  ];

  const doc = await call(client, "pages_create_document_with_content", { paragraphs });
  console.log(`  Done: "${doc.name}"`);
  return doc.name;
}

// ═══════════════════════════════════════════════════════════════
// Keynote: Q4 Business Review
// ═══════════════════════════════════════════════════════════════

async function createPitch(client: Client) {
  console.log("Creating Keynote pitch deck...");

  // Try themes in preference order
  let pres;
  for (const theme of ["Gradient", "Color Gradient", "White", undefined]) {
    try {
      pres = await call(client, "keynote_create_presentation", theme ? { themeName: theme } : {});
      console.log(`  Theme: ${theme || "default"}`);
      break;
    } catch { continue; }
  }
  if (!pres) throw new Error("Could not create Keynote presentation");
  const docName = pres.name;

  // Discover master slide layouts
  let titleLayout = "Title - Center";
  let bulletLayout = "Title & Bullets";
  try {
    const masters = await call(client, "keynote_list_master_slides", { documentName: docName });
    const names = masters.map((m: { name: string }) => m.name);
    console.log(`  Layouts: ${names.join(", ")}`);
    titleLayout = names.find((n: string) => /title.*center/i.test(n)) || titleLayout;
    bulletLayout = names.find((n: string) => /title.*bullet/i.test(n)) || names.find((n: string) => /bullet/i.test(n)) || bulletLayout;
  } catch {
    console.log("  (Could not list layouts, using defaults)");
  }

  const slides = [
    {
      layout: titleLayout,
      title: "Acme Analytics",
      body: "Q4 2025 Business Review\nDecember 15, 2025",
      notes: "Welcome everyone. Today we're covering Q4 performance, key wins, and our 2026 roadmap. We had our strongest quarter yet.",
      transition: "dissolve",
    },
    {
      layout: bulletLayout,
      title: "Q4 at a Glance",
      body: "Revenue: $4.2M  (+18% QoQ)\nNew customers: 340  (+22% QoQ)\nNet revenue retention: 118%\nTeam: 45 \u2192 62 people",
      notes: "Four headline numbers. Revenue growth accelerated from 14% in Q3. Net retention above 110% means expansion outpaces churn. Hiring focused on engineering and customer success.",
      transition: "push",
    },
    {
      layout: bulletLayout,
      title: "Revenue by Segment",
      body: "Enterprise (>$50K ARR): $2.1M \u2014 50% of revenue\nMid-market ($10\u201350K): $1.4M \u2014 33%\nSMB (<$10K): $0.7M \u2014 17%\nAverage deal size: $37K  (+15% QoQ)",
      notes: "Enterprise is now half our revenue, up from 40% in Q2. Larger deals have better unit economics. Mid-market stable. SMB shrinking as a percentage but still growing in absolute terms.",
      transition: "push",
    },
    {
      layout: bulletLayout,
      title: "Product Wins",
      body: "Real-time dashboards (most requested feature)\nAPI v2 with 3x throughput\nSOC 2 Type II certification\nMobile app beta \u2014 200+ testers, 4.6\u2605 rating",
      notes: "Real-time dashboards drove 3 enterprise deals this quarter. API v2 unblocked integration partners. SOC 2 was a must-have for our enterprise pipeline \u2014 every deal over $100K asked for it.",
      transition: "push",
    },
    {
      layout: titleLayout,
      title: "\u201cAcme replaced three tools for us.\nThe ROI was obvious in week one.\u201d",
      body: "\u2014 VP Data, Meridian Health",
      notes: "Customer quote from the VP of Data at Meridian Health, a $120K ARR account that signed in Q4. Use this as a transition into the roadmap \u2014 what we're building next to deliver even more value.",
      transition: "dissolve",
    },
    {
      layout: bulletLayout,
      title: "2026 Roadmap",
      body: "$25M ARR target  (from $16.8M, +49% YoY)\nEuropean expansion: UK + DACH\nAI-powered anomaly detection\nGrow team to 100  (engineering + GTM)",
      notes: "$25M implies ~50% YoY growth. Europe is our biggest untapped market \u2014 30 inbound leads from UK already. AI features are the #1 competitive differentiator for 2026. Hiring plan: 20 eng, 12 sales, 6 CS.",
      transition: "push",
    },
    {
      layout: titleLayout,
      title: "Questions?",
      body: "alex@acme-analytics.com",
      notes: "Open for questions. Backup slides ready: financial model, competitive landscape, hiring plan, customer case studies.",
      transition: "dissolve",
    },
  ];

  // Add all slides with proper layouts, then delete default slide 1
  for (const slide of slides) {
    await call(client, "keynote_add_slide", { documentName: docName, masterSlideName: slide.layout });
  }
  await call(client, "keynote_delete_slide", { documentName: docName, slideNumber: 1 });

  // Set content
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const n = i + 1;
    await call(client, "keynote_set_slide_title", { documentName: docName, slideNumber: n, title: slide.title });
    if (slide.body) {
      await call(client, "keynote_set_slide_body", { documentName: docName, slideNumber: n, body: slide.body });
    }
    await call(client, "keynote_set_presenter_notes", { documentName: docName, slideNumber: n, notes: slide.notes });
    await call(client, "keynote_set_transition", { documentName: docName, slideNumber: n, effect: slide.transition, duration: 1.0 });
  }

  console.log(`  Done: "${docName}"`);
  return docName;
}

// ── Main ──

const arg = process.argv[2] || "all";
const validArgs = ["budget", "resume", "pitch", "all"];
if (!validArgs.includes(arg)) {
  console.error(`Usage: node --import tsx scripts/create-screenshots.ts [${validArgs.join("|")}]`);
  process.exit(1);
}

const { client, server } = await createClient();

try {
  if (arg === "budget" || arg === "all") await createBudget(client);
  if (arg === "resume" || arg === "all") await createResume(client);
  if (arg === "pitch" || arg === "all") await createPitch(client);

  console.log("\nDocuments are open \u2014 take screenshots, then close them manually.");
} finally {
  await client.close();
  await server.close();
}
