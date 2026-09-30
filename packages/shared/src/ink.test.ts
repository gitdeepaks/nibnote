import { describe, expect, test } from "bun:test";
import {
  clampWidth,
  colorName,
  contrastRatio,
  HexColor,
  HIGHLIGHTER_PRESETS,
  INK_PRESETS,
  inkVisibility,
  parseHexInput,
  sameColor,
  widthRange,
} from "./index";

const hex = (value: string) => HexColor.parse(value);

describe("widthRange and clampWidth", () => {
  test("follow PencilKit's ranges, so monoline and pencil can't pretend to be thinner or wider", () => {
    expect(widthRange("monoline")).toEqual({ min: 0.5, max: 4 });
    expect(clampWidth(5, widthRange("monoline"))).toBe(4);
    expect(clampWidth(2, widthRange("pencil"))).toBe(2.4);
    expect(clampWidth(100, widthRange("marker"))).toBe(60);
  });

  test("round to 0.1 pt so a slider value and a preset compare equal", () => {
    expect(clampWidth(3.14159, widthRange("pen"))).toBe(3.1);
    expect(clampWidth(3.15, widthRange("pen"))).toBe(3.2);
  });

  test("every range sits inside what a stroke width may be", () => {
    for (const ink of ["pen", "fountainPen", "monoline", "pencil", "marker"] as const) {
      const range = widthRange(ink);
      expect(range.min).toBeGreaterThan(0);
      expect(range.max).toBeLessThanOrEqual(100);
      expect(range.min).toBeLessThan(range.max);
    }
  });
});

describe("parseHexInput", () => {
  test("accepts #RRGGBB, bare digits, lower case and surrounding spaces", () => {
    expect(parseHexInput("#1A73E8")).toBe(hex("#1A73E8"));
    expect(parseHexInput("1a73e8")).toBe(hex("#1A73E8"));
    expect(parseHexInput("  #1a73e8 ")).toBe(hex("#1A73E8"));
  });

  test("expands the short form and drops alpha", () => {
    expect(parseHexInput("#1AE")).toBe(hex("#11AAEE"));
    expect(parseHexInput("#1A73E880")).toBe(hex("#1A73E8"));
  });

  test("rejects anything that isn't a colour", () => {
    for (const text of ["", "#", "#12", "#1234", "#12345", "#GGGGGG", "blue", "#1A73E8F", "# 1A73E8"]) {
      expect(parseHexInput(text)).toBeNull();
    }
  });
});

describe("sameColor", () => {
  test("ignores case and alpha", () => {
    expect(sameColor(hex("#1a73e8"), hex("#1A73E8"))).toBe(true);
    expect(sameColor(hex("#1A73E8FF"), hex("#1A73E8"))).toBe(true);
    expect(sameColor(hex("#1A73E8"), hex("#1A73E9"))).toBe(false);
  });
});

describe("contrast and visibility", () => {
  test("contrast ratio matches WCAG's end points", () => {
    expect(contrastRatio(hex("#000000"), hex("#FFFFFF"))).toBeCloseTo(21, 5);
    expect(contrastRatio(hex("#FFFFFF"), hex("#FFFFFF"))).toBe(1);
  });

  test("pen colours too light for white paper are flagged", () => {
    expect(inkVisibility("ink", hex("#FFD60A"))).toBe("tooLight");
    expect(inkVisibility("ink", hex("#F2F2F7"))).toBe("tooLight");
    expect(inkVisibility("ink", hex("#0A60FF"))).toBe("fine");
    expect(inkVisibility("ink", hex("#34C759"))).toBe("fine");
  });

  test("highlighters that hide the writing or barely show are flagged", () => {
    expect(inkVisibility("highlighter", hex("#000000"))).toBe("tooDark");
    expect(inkVisibility("highlighter", hex("#FFFFFF"))).toBe("tooLight");
    expect(inkVisibility("highlighter", hex("#FFD60A"))).toBe("fine");
  });

  test("every preset is fine for the tool it is offered for", () => {
    for (const color of INK_PRESETS) expect(inkVisibility("ink", color)).toBe("fine");
    for (const color of HIGHLIGHTER_PRESETS) expect(inkVisibility("highlighter", color)).toBe("fine");
  });

  test("presets have no duplicates", () => {
    expect(new Set(INK_PRESETS).size).toBe(INK_PRESETS.length);
    expect(new Set(HIGHLIGHTER_PRESETS).size).toBe(HIGHLIGHTER_PRESETS.length);
  });
});

describe("colorName", () => {
  test("names the default colours", () => {
    const names = [
      ["#1C1C1E", "Black"],
      ["#3A3A3C", "Gray"],
      ["#0A60FF", "Blue"],
      ["#E5383B", "Red"],
      ["#FFD60A", "Yellow"],
      ["#34C759", "Green"],
      ["#FF6FB5", "Pink"],
    ] as const;
    for (const [color, name] of names) expect(colorName(hex(color))).toBe(name);
  });

  test("names white, orange, brown, teal and purple, ignoring alpha", () => {
    const names = [
      ["#FFFFFF", "White"],
      ["#FF9500", "Orange"],
      ["#7B4A12", "Brown"],
      ["#30B0C7", "Teal"],
      ["#AF52DE", "Purple"],
      ["#0A60FF80", "Blue"],
    ] as const;
    for (const [color, name] of names) expect(colorName(hex(color))).toBe(name);
  });
});
