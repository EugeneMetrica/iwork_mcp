import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OsascriptError } from "../src/jxa.js";

describe("OsascriptError", () => {
  it("is an instance of Error", () => {
    const err = new OsascriptError("some error (-1743)", 1);
    assert.ok(err instanceof Error);
  });

  it("has name 'OsascriptError'", () => {
    const err = new OsascriptError("some error (-1743)", 1);
    assert.equal(err.name, "OsascriptError");
  });

  it("parses error code -1743 (permission denied)", () => {
    const err = new OsascriptError("Error: Error: some action (-1743)", 1);
    assert.equal(err.appleScriptErrorCode, -1743);
    assert.ok(err.message.includes("Permission denied"));
    assert.ok(err.message.includes("Automation"));
  });

  it("parses error code -1728 (element not found)", () => {
    const err = new OsascriptError("execution error: can't get document (-1728)", 1);
    assert.equal(err.appleScriptErrorCode, -1728);
    assert.ok(err.message.includes("Element not found"));
  });

  it("parses error code -128 (user cancelled)", () => {
    const err = new OsascriptError("execution error: User cancelled (-128)", 1);
    assert.equal(err.appleScriptErrorCode, -128);
    assert.ok(err.message.includes("cancelled"));
  });

  it("parses error code -10810 (app not running)", () => {
    const err = new OsascriptError("error (-10810)", 1);
    assert.equal(err.appleScriptErrorCode, -10810);
    assert.ok(err.message.includes("not running"));
  });

  it("parses error code -1700 (invalid data type)", () => {
    const err = new OsascriptError("error (-1700)", 1);
    assert.equal(err.appleScriptErrorCode, -1700);
    assert.ok(err.message.includes("Invalid data type"));
  });

  it("parses error code -1708 (does not understand)", () => {
    const err = new OsascriptError("error (-1708)", 1);
    assert.equal(err.appleScriptErrorCode, -1708);
    assert.ok(err.message.includes("does not understand"));
  });

  it("handles unknown error codes gracefully", () => {
    const err = new OsascriptError("error (-99999)", 1);
    assert.equal(err.appleScriptErrorCode, -99999);
    assert.ok(err.message.includes("osascript failed"));
    assert.ok(err.message.includes("-99999"));
  });

  it("handles stderr with no error code", () => {
    const err = new OsascriptError("something went wrong", 1);
    assert.equal(err.appleScriptErrorCode, undefined);
    assert.ok(err.message.includes("osascript failed"));
    assert.ok(err.message.includes("something went wrong"));
  });

  it("preserves stderr in the error", () => {
    const stderr = "execution error: blah (-1728)";
    const err = new OsascriptError(stderr, 1);
    assert.equal(err.stderr, stderr);
  });
});
