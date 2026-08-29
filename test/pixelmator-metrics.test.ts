import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hexToRgb8, rgb8ToRgb16, rgb8ToHex, deltaE2000, rgbEuclid } from "../src/tools/pixelmator.js";

describe("pixelmator colour math", () => {
  it("parses HEX to 8-bit RGB", () => {
    assert.deepEqual(hexToRgb8("#FF0000"), { r: 255, g: 0, b: 0 });
    assert.deepEqual(hexToRgb8("#00ff7f"), { r: 0, g: 255, b: 127 });
    assert.throws(() => hexToRgb8("FF0000"));
    assert.throws(() => hexToRgb8("#FF00"));
  });

  it("scales 8-bit to 16-bit by ×257", () => {
    assert.deepEqual(rgb8ToRgb16({ r: 255, g: 0, b: 64 }), [65535, 0, 16448]);
    assert.deepEqual(rgb8ToRgb16({ r: 0, g: 0, b: 0 }), [0, 0, 0]);
  });

  it("round-trips HEX through 8-bit RGB", () => {
    for (const hex of ["#FF0000", "#00FF7F", "#2C3E50", "#FFFFFF", "#000000"]) {
      assert.equal(rgb8ToHex(hexToRgb8(hex)), hex.toUpperCase());
    }
  });

  it("ΔE-2000 is zero for identical colours", () => {
    const c = { r: 123, g: 45, b: 210 };
    assert.equal(deltaE2000(c, c), 0);
  });

  it("ΔE-2000 is symmetric and positive for distinct colours", () => {
    const a = { r: 255, g: 0, b: 0 }, b = { r: 0, g: 0, b: 255 };
    assert.ok(deltaE2000(a, b) > 0);
    assert.ok(Math.abs(deltaE2000(a, b) - deltaE2000(b, a)) < 1e-9);
  });

  it("ΔE-2000 orders colour distance sensibly", () => {
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    const gray = { r: 200, g: 200, b: 200 };
    assert.ok(deltaE2000(white, black) > 90, `black-white should exceed 90, got ${deltaE2000(white, black)}`);
    assert.ok(
      deltaE2000(white, black) > deltaE2000(white, gray),
      "white-black must be farther than white-lightgray",
    );
    const red = { r: 255, g: 0, b: 0 };
    const blue = { r: 0, g: 0, b: 255 };
    const magenta = { r: 255, g: 0, b: 255 };
    assert.ok(
      deltaE2000(red, blue) > deltaE2000(red, magenta),
      "red-blue must be farther than red-magenta",
    );
  });

  it("RGB-Euclid is exact in 8-bit space", () => {
    assert.equal(rgbEuclid({ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }), 255);
    assert.equal(rgbEuclid({ r: 3, g: 4, b: 0 }, { r: 0, g: 0, b: 0 }), 5);
  });
});
