import { describe, expect, test } from "bun:test";
import {
  chooseColor,
  DEFAULT_TOOLBOX,
  hasToolOptions,
  isPaletteItemSelected,
  PALETTE_ITEM,
  PALETTE_MARGIN,
  PALETTE_RADIUS,
  paletteItems,
  pencilResponse,
  popoverSideAt,
  radialLayout,
  selectSlot,
  type PencilPreferredAction,
} from "./index";

describe("pencilResponse", () => {
  test("switch preferences switch tools", () => {
    expect(pencilResponse("tap", "switchEraser", null)).toEqual({
      kind: "switchTool",
      action: "switchEraser",
      keepOpen: false,
    });
    expect(pencilResponse("squeeze", "switchPrevious", null)).toEqual({
      kind: "switchTool",
      action: "switchPrevious",
      keepOpen: false,
    });
  });

  test("palette preferences open the palette, ink attributes open the tool's options", () => {
    expect(pencilResponse("squeeze", "showContextualPalette", null)).toEqual({ kind: "open", surface: "palette" });
    expect(pencilResponse("tap", "showColorPalette", null)).toEqual({ kind: "open", surface: "palette" });
    expect(pencilResponse("tap", "showInkAttributes", null)).toEqual({ kind: "open", surface: "options" });
  });

  test("off and run-shortcut do nothing, even with a surface open", () => {
    for (const action of ["ignore", "runSystemShortcut"] as const) {
      expect(pencilResponse("tap", action, null)).toEqual({ kind: "none" });
      expect(pencilResponse("squeeze", action, "palette")).toEqual({ kind: "none" });
    }
  });

  test("with the palette open, a double-tap switches to the eraser and keeps it open", () => {
    const actions: readonly PencilPreferredAction[] = [
      "switchEraser",
      "switchPrevious",
      "showColorPalette",
      "showInkAttributes",
      "showContextualPalette",
    ];
    for (const action of actions) {
      expect(pencilResponse("tap", action, "palette")).toEqual({
        kind: "switchTool",
        action: "switchEraser",
        keepOpen: true,
      });
    }
  });

  test("with the palette open, a squeeze closes it", () => {
    expect(pencilResponse("squeeze", "showContextualPalette", "palette")).toEqual({ kind: "close" });
    expect(pencilResponse("squeeze", "switchEraser", "palette")).toEqual({ kind: "close" });
  });

  test("ink attributes toggle the options; other actions replace them", () => {
    expect(pencilResponse("tap", "showInkAttributes", "options")).toEqual({ kind: "close" });
    expect(pencilResponse("squeeze", "showContextualPalette", "options")).toEqual({ kind: "open", surface: "palette" });
    expect(pencilResponse("tap", "switchEraser", "options")).toEqual({
      kind: "switchTool",
      action: "switchEraser",
      keepOpen: false,
    });
  });
});

describe("paletteItems", () => {
  test("five tools, three colours and the options, lasso last", () => {
    const kinds = paletteItems(DEFAULT_TOOLBOX).map((item) =>
      item.kind === "tool" ? item.slot : item.kind === "color" ? `color${String(item.index)}` : "options",
    );
    expect(kinds).toEqual(["pen", "pencil", "highlighter", "eraser", "color0", "color1", "color2", "options", "lasso"]);
  });

  test("the lasso has no options, so the ring has eight items", () => {
    const lasso = selectSlot(DEFAULT_TOOLBOX, "lasso");
    expect(hasToolOptions(lasso)).toBe(false);
    expect(paletteItems(lasso)).toHaveLength(8);
    expect(paletteItems(lasso).some((item) => item.kind === "options")).toBe(false);
  });
});

describe("isPaletteItemSelected", () => {
  test("marks the active tool and the pinned colour it draws with", () => {
    const blue = chooseColor(DEFAULT_TOOLBOX, "pen", DEFAULT_TOOLBOX.slots.pen.pinnedColors[1]);
    expect(isPaletteItemSelected(blue, { kind: "tool", slot: "pen" })).toBe(true);
    expect(isPaletteItemSelected(blue, { kind: "tool", slot: "eraser" })).toBe(false);
    expect(isPaletteItemSelected(blue, { kind: "color", index: 1 })).toBe(true);
    expect(isPaletteItemSelected(blue, { kind: "color", index: 0 })).toBe(false);
    expect(isPaletteItemSelected(blue, { kind: "options" })).toBe(false);
  });

  test("no colour is selected while erasing", () => {
    const erasing = selectSlot(DEFAULT_TOOLBOX, "eraser");
    expect(isPaletteItemSelected(erasing, { kind: "color", index: 0 })).toBe(false);
  });
});

describe("radialLayout", () => {
  const area = { width: 800, height: 1000 };
  const reach = PALETTE_RADIUS + PALETTE_ITEM / 2 + PALETTE_MARGIN;

  test("centres on the point when the ring fits", () => {
    expect(radialLayout({ x: 400, y: 500 }, area, 9).center).toEqual({ x: 400, y: 500 });
  });

  test("uses the area's centre without a point", () => {
    expect(radialLayout(null, area, 9).center).toEqual({ x: 400, y: 500 });
  });

  test("moves inward at every edge and corner", () => {
    expect(radialLayout({ x: 0, y: 0 }, area, 9).center).toEqual({ x: reach, y: reach });
    expect(radialLayout({ x: 800, y: 1000 }, area, 9).center).toEqual({ x: 800 - reach, y: 1000 - reach });
    expect(radialLayout({ x: 30, y: 500 }, area, 9).center).toEqual({ x: reach, y: 500 });
    expect(radialLayout({ x: 400, y: 990 }, area, 9).center).toEqual({ x: 400, y: 1000 - reach });
  });

  test("centres in an area too small for the ring", () => {
    expect(radialLayout({ x: 10, y: 10 }, { width: 200, height: 1000 }, 9).center).toEqual({ x: 100, y: reach });
  });

  test("spaces the items evenly, the first at the top", () => {
    const { center, items } = radialLayout({ x: 400, y: 500 }, area, 8);
    expect(items).toHaveLength(8);
    const first = items[0];
    expect(first?.x).toBeCloseTo(center.x);
    expect(first?.y).toBeCloseTo(center.y - PALETTE_RADIUS);
    for (const item of items) {
      expect(Math.hypot(item.x - center.x, item.y - center.y)).toBeCloseTo(PALETTE_RADIUS);
    }
    const third = items[2];
    expect(third?.x).toBeCloseTo(center.x + PALETTE_RADIUS);
    expect(third?.y).toBeCloseTo(center.y);
  });

  test("every item stays inside the area", () => {
    for (const point of [
      { x: 0, y: 0 },
      { x: 800, y: 0 },
      { x: 0, y: 1000 },
      { x: 800, y: 1000 },
    ]) {
      for (const item of radialLayout(point, area, 9).items) {
        expect(item.x - PALETTE_ITEM / 2).toBeGreaterThanOrEqual(PALETTE_MARGIN - 0.001);
        expect(item.y - PALETTE_ITEM / 2).toBeGreaterThanOrEqual(PALETTE_MARGIN - 0.001);
        expect(item.x + PALETTE_ITEM / 2).toBeLessThanOrEqual(800 - PALETTE_MARGIN + 0.001);
        expect(item.y + PALETTE_ITEM / 2).toBeLessThanOrEqual(1000 - PALETTE_MARGIN + 0.001);
      }
    }
  });
});

describe("popoverSideAt", () => {
  const area = { width: 800, height: 1000 };
  test("opens above in the lower half and below in the upper half", () => {
    expect(popoverSideAt({ x: 100, y: 900 }, area)).toBe("above");
    expect(popoverSideAt({ x: 100, y: 100 }, area)).toBe("below");
    expect(popoverSideAt(null, area)).toBe("below");
  });
});
