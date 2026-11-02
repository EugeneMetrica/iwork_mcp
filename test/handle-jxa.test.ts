import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  asLiteral,
  AS_LITERAL_JXA_HELPER,
  normName,
  resolveNameCandidates,
  TIMEOUT_CREATE,
  TIMEOUT_EXPORT,
} from "../src/handle-jxa.js";

// Instantiate the in-script JXA helper so its output can be compared with the
// TS-side asLiteral on the same corpus.
function helperFn(): (s: string) => string {
  return new Function(`${AS_LITERAL_JXA_HELPER}; return asLiteral;`)() as (s: string) => string;
}

// Shared corpus: [input, expected literal]
const CASES: Array<[string, string]> = [
  ["hello", '"hello"'],
  ["", '""'],
  ['say "hi"', '"say \\"hi\\""'],
  ['weird """ name', '"weird \\"\\"\\" name"'],
  ["back\\slash", '"back\\\\slash"'],
  ['He said "hi" \\ there', '"He said \\"hi\\" \\\\ there"'],
  ["line1\nline2", '"line1line2"'],
  ["a\rb", '"ab"'],
  ["mixed\r\nx\n\ry", '"mixedxy"'],
  ["tab\tkept", '"tab\tkept"'],
  ["nbsp\u00A0kept", '"nbsp\u00A0kept"'],
  ["—dash kept", '"—dash kept"'],
];

describe("asLiteral", () => {
  it("escapes quotes with backslash-quote (AppleScript has no \"\" doubling: -2740)", () => {
    assert.equal(asLiteral('say "hi"'), '"say \\"hi\\""');
  });

  it("doubles backslashes (a raw backslash breaks AppleScript compilation)", () => {
    assert.equal(asLiteral("back\\slash"), '"back\\\\slash"');
    assert.equal(asLiteral('He said "hi" \\ there'), '"He said \\"hi\\" \\\\ there"');
  });

  it("cuts CR/LF instead of emitting \\n escapes", () => {
    assert.equal(asLiteral("line1\nline2"), '"line1line2"');
    assert.equal(asLiteral("a\rb"), '"ab"');
    assert.equal(asLiteral("mixed\r\nx\n\ry"), '"mixedxy"');
  });

  it("preserves tabs, NBSP and em dash as-is", () => {
    assert.equal(asLiteral("tab\tkept"), '"tab\tkept"');
    assert.equal(asLiteral("nbsp\u00A0kept"), '"nbsp\u00A0kept"');
    assert.equal(asLiteral("—dash kept"), '"—dash kept"');
  });

  it("matches the shared corpus", () => {
    for (const [input, expected] of CASES) {
      assert.equal(asLiteral(input), expected, `corpus mismatch for ${JSON.stringify(input)}`);
    }
  });

  it("in-script JXA helper agrees with the TS implementation", () => {
    const fn = helperFn();
    for (const [input, expected] of CASES) {
      assert.equal(fn(input), expected, `helper mismatch for ${JSON.stringify(input)}`);
    }
  });

  it("helper snippet is syntactically valid JavaScript", () => {
    assert.doesNotThrow(() => helperFn());
  });
});

describe("normName", () => {
  it("normalizes to NFC", () => {
    const decomposed = "cafe\u0301"; // e + combining acute
    assert.equal(normName(decomposed), normName("caf\u00E9"));
    assert.equal(normName(decomposed), "caf\u00E9");
  });

  it("replaces NBSP with regular space", () => {
    assert.equal(normName("a\u00A0b"), "a b");
  });

  it("replaces em dash with hyphen", () => {
    assert.equal(normName("a—b"), "a-b");
  });

  it("applies all rules together", () => {
    assert.equal(normName("e\u0301b\u00A0—x"), "\u00E9b -x");
  });
});

describe("resolveNameCandidates", () => {
  it("maps RU theme name to EN canonical", () => {
    const c = resolveNameCandidates("Пустой");
    assert.ok(c.includes("Пустой"));
    assert.ok(c.includes("Blank"));
    assert.equal(c[0], "Пустой", "requested name goes first");
  });

  it("maps EN layout name to RU alias (reverse direction)", () => {
    const c = resolveNameCandidates("Title");
    assert.ok(c.includes("Только заголовок"));
  });

  it("maps the other RU/EN pairs", () => {
    assert.ok(resolveNameCandidates("Простая белая").includes("White"));
    assert.ok(resolveNameCandidates("White").includes("Простая белая"));
    assert.ok(resolveNameCandidates("Заголовок и пункты").includes("Bullets"));
    assert.ok(resolveNameCandidates("Bullets").includes("Заголовок и пункты"));
  });

  it("is tolerant to case, NBSP and em dash in the request", () => {
    const c = resolveNameCandidates("blank");
    assert.ok(c.includes("Пустой"));
    assert.ok(c.includes("Blank"), "canonical casing must be offered for a lowercase request");
    assert.ok(resolveNameCandidates("Только\u00A0заголовок").includes("Title"));
  });

  it("unknown name yields just itself (and its normalized form)", () => {
    const c = resolveNameCandidates("Несуществующая тема");
    assert.deepEqual(c, ["Несуществующая тема"]);
  });
});

describe("per-op timeouts", () => {
  it("exposes the operation-class timeouts", () => {
    assert.equal(TIMEOUT_CREATE, 90_000);
    assert.equal(TIMEOUT_EXPORT, 180_000);
  });
});
