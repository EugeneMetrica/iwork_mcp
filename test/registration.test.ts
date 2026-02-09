import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTestServer, type TestContext } from "./helpers/server.js";

describe("Tool Registration", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestServer();
  });

  after(async () => {
    await ctx.cleanup();
  });

  it("sends instructions to the client", async () => {
    const instructions = ctx.client.getInstructions();
    assert.ok(instructions, "Server should send instructions");
    assert.ok(instructions.length > 100, "Instructions should be substantial");
    assert.ok(instructions.includes("iWork"), "Instructions should mention iWork");
  });

  it("registers all 74 tools", async () => {
    const { tools } = await ctx.client.listTools();
    assert.equal(tools.length, 74);
  });

  it("registers 36 Numbers tools", async () => {
    const { tools } = await ctx.client.listTools();
    const numbers = tools.filter((t) => t.name.startsWith("numbers_"));
    assert.equal(numbers.length, 36);
  });

  it("registers 16 Pages tools", async () => {
    const { tools } = await ctx.client.listTools();
    const pages = tools.filter((t) => t.name.startsWith("pages_"));
    assert.equal(pages.length, 16);
  });

  it("registers 22 Keynote tools", async () => {
    const { tools } = await ctx.client.listTools();
    const keynote = tools.filter((t) => t.name.startsWith("keynote_"));
    assert.equal(keynote.length, 22);
  });

  it("every tool has a description", async () => {
    const { tools } = await ctx.client.listTools();
    for (const tool of tools) {
      assert.ok(
        tool.description && tool.description.length > 0,
        `${tool.name} is missing a description`,
      );
    }
  });

  it("every tool has a valid inputSchema", async () => {
    const { tools } = await ctx.client.listTools();
    for (const tool of tools) {
      assert.equal(
        tool.inputSchema.type,
        "object",
        `${tool.name} inputSchema.type should be "object"`,
      );
    }
  });

  it("contains expected Numbers tool names", async () => {
    const { tools } = await ctx.client.listTools();
    const names = new Set(tools.map((t) => t.name));
    const expected = [
      "numbers_create_document",
      "numbers_read_cell",
      "numbers_write_cell",
      "numbers_write_table",
      "numbers_set_formula",
      "numbers_format_cells",
      "numbers_list_sheets",
      "numbers_add_sheet",
      "numbers_close_document",
      "numbers_create_sheet_with_table",
    ];
    for (const name of expected) {
      assert.ok(names.has(name), `Missing tool: ${name}`);
    }
  });

  it("contains expected Pages tool names", async () => {
    const { tools } = await ctx.client.listTools();
    const names = new Set(tools.map((t) => t.name));
    const expected = [
      "pages_create_document",
      "pages_get_body_text",
      "pages_get_paragraphs",
      "pages_add_text",
      "pages_replace_text",
      "pages_close_document",
      "pages_create_document_with_content",
    ];
    for (const name of expected) {
      assert.ok(names.has(name), `Missing tool: ${name}`);
    }
  });

  it("contains expected Keynote tool names", async () => {
    const { tools } = await ctx.client.listTools();
    const names = new Set(tools.map((t) => t.name));
    const expected = [
      "keynote_create_presentation",
      "keynote_list_slides",
      "keynote_add_slide",
      "keynote_set_slide_title",
      "keynote_set_slide_body",
      "keynote_set_presenter_notes",
      "keynote_close_presentation",
    ];
    for (const name of expected) {
      assert.ok(names.has(name), `Missing tool: ${name}`);
    }
  });
});
