import { describe, expect, test } from "bun:test";
import {
  afterPencilAction,
  CanvasTool,
  canvasToolFor,
  activeEraserPreset,
  activePreset,
  addRecentColor,
  chooseColor,
  colorTarget,
  DEFAULT_TOOLBOX,
  effectiveWidth,
  HexColor,
  isVerticalDock,
  MAX_RECENT_COLORS,
  nearestDock,
  rememberColor,
  PencilPreferredAction,
  selectEraserPreset,
  selectSlot,
  selectWidthPreset,
  setDock,
  setEraserMode,
  setEraserPreset,
  setPenInk,
  setPinnedColor,
  setShapeStyle,
  setSlotColor,
  setSlotWidth,
  setWidthPreset,
  StoredToolbox,
  toggleDrawingPolicy,
  toggleHighlighterOnly,
  toggleShapeSnapping,
  ToolbarDock,
  ToolSlot,
  type Toolbox,
} from "./index";

const red = HexColor.parse("#E5383B");
const green = HexColor.parse("#34C759");

/** A stored value as the settings table would hand it back: JSON text, parsed. */
function stored(value: object): Toolbox {
  return StoredToolbox.parse(JSON.parse(JSON.stringify(value)));
}

describe("default toolbox", () => {
  test("starts on the pen, and survives being stored and read back unchanged", () => {
    expect(DEFAULT_TOOLBOX.active).toBe("pen");
    expect(stored(DEFAULT_TOOLBOX)).toEqual(DEFAULT_TOOLBOX);
  });

  test("every slot gives the canvas a valid tool", () => {
    for (const slot of ToolSlot.options) {
      const tool = canvasToolFor(selectSlot(DEFAULT_TOOLBOX, slot));
      expect(CanvasTool.safeParse(tool).success).toBe(true);
    }
  });

  test("each colour slot draws with its first pinned colour and middle width preset", () => {
    for (const settings of [
      DEFAULT_TOOLBOX.slots.pen,
      DEFAULT_TOOLBOX.slots.pencil,
      DEFAULT_TOOLBOX.slots.highlighter,
    ]) {
      expect(settings.color).toBe(settings.pinnedColors[0]);
      expect(settings.width).toBe(settings.widthPresets[1]);
    }
    expect(DEFAULT_TOOLBOX.slots.eraser.width).toBe(DEFAULT_TOOLBOX.slots.eraser.widthPresets[1]);
  });
});

describe("canvasToolFor", () => {
  test("maps each slot to its PencilKit tool", () => {
    const at = (slot: ToolSlot) => canvasToolFor(selectSlot(DEFAULT_TOOLBOX, slot));
    expect(at("pen")).toEqual({ kind: "ink", ink: "pen", colorHex: HexColor.parse("#1C1C1E"), width: 3 });
    expect(at("pencil")).toEqual({ kind: "ink", ink: "pencil", colorHex: HexColor.parse("#3A3A3C"), width: 4 });
    expect(at("highlighter")).toEqual({ kind: "highlighter", colorHex: HexColor.parse("#FFD60A"), width: 18 });
    expect(at("eraser")).toEqual({ kind: "eraser", mode: "stroke", width: 24, highlighterOnly: false });
    expect(at("lasso")).toEqual({ kind: "lasso" });
  });

  test("the pen uses its chosen ink", () => {
    const toolbox = stored({
      ...DEFAULT_TOOLBOX,
      slots: { ...DEFAULT_TOOLBOX.slots, pen: { ...DEFAULT_TOOLBOX.slots.pen, ink: "fountainPen" } },
    });
    expect(canvasToolFor(toolbox)).toMatchObject({ kind: "ink", ink: "fountainPen" });
  });
});

describe("slots remember their own settings", () => {
  test("a red pen and a green highlighter keep their colours across tool switches", () => {
    let toolbox = setSlotColor(DEFAULT_TOOLBOX, "pen", red);
    toolbox = selectSlot(toolbox, "highlighter");
    toolbox = setSlotColor(toolbox, "highlighter", green);
    toolbox = selectSlot(toolbox, "pen");
    expect(canvasToolFor(toolbox)).toMatchObject({ colorHex: red });
    expect(canvasToolFor(selectSlot(toolbox, "highlighter"))).toMatchObject({ colorHex: green });
  });

  test("changing a colour keeps the pinned colours", () => {
    const toolbox = setSlotColor(DEFAULT_TOOLBOX, "pencil", green);
    expect(toolbox.slots.pencil.pinnedColors).toEqual(DEFAULT_TOOLBOX.slots.pencil.pinnedColors);
  });

  test("setting the colour a slot already has returns the same toolbox (no save, no re-render)", () => {
    expect(setSlotColor(DEFAULT_TOOLBOX, "pen", DEFAULT_TOOLBOX.slots.pen.color)).toBe(DEFAULT_TOOLBOX);
  });

  test("widths are per slot, and invalid widths are ignored", () => {
    const toolbox = setSlotWidth(DEFAULT_TOOLBOX, "eraser", 40);
    expect(toolbox.slots.eraser.width).toBe(40);
    expect(toolbox.slots.pen.width).toBe(3);
    for (const width of [0, -1, 101, Number.NaN]) {
      expect(setSlotWidth(DEFAULT_TOOLBOX, "pen", width)).toBe(DEFAULT_TOOLBOX);
    }
  });
});

describe("colour target", () => {
  test("is the active colour slot", () => {
    expect(colorTarget(selectSlot(DEFAULT_TOOLBOX, "highlighter"))).toBe("highlighter");
  });

  test("while erasing or selecting, is the colour tool used before", () => {
    const erasing = selectSlot(selectSlot(DEFAULT_TOOLBOX, "pencil"), "eraser");
    expect(colorTarget(erasing)).toBe("pencil");
    expect(colorTarget(stored({ ...DEFAULT_TOOLBOX, active: "lasso", previous: "eraser" }))).toBe("pen");
  });

  test("choosing a colour from the eraser goes back to drawing in that colour", () => {
    const erasing = selectSlot(selectSlot(DEFAULT_TOOLBOX, "highlighter"), "eraser");
    const toolbox = chooseColor(erasing, colorTarget(erasing), green);
    expect(toolbox.active).toBe("highlighter");
    expect(toolbox.previous).toBe("eraser");
    expect(canvasToolFor(toolbox)).toEqual({ kind: "highlighter", colorHex: green, width: 18 });
  });
});

describe("drawing policy", () => {
  test("starts with Apple Pencil only, toggles both ways and survives storing", () => {
    expect(DEFAULT_TOOLBOX.drawingPolicy).toBe("pencilOnly");
    const finger = toggleDrawingPolicy(DEFAULT_TOOLBOX);
    expect(finger.drawingPolicy).toBe("anyInput");
    expect(stored(finger).drawingPolicy).toBe("anyInput");
    expect(toggleDrawingPolicy(finger).drawingPolicy).toBe("pencilOnly");
  });

  test("switching tools keeps the drawing policy", () => {
    const finger = toggleDrawingPolicy(DEFAULT_TOOLBOX);
    expect(afterPencilAction(selectSlot(finger, "highlighter"), "switchEraser").drawingPolicy).toBe("anyInput");
  });
});

describe("shape snapping", () => {
  test("is on with clean shapes by default, and one switch turns it off for every tool", () => {
    expect(DEFAULT_TOOLBOX.shapeSnapping).toBe(true);
    expect(DEFAULT_TOOLBOX.shapeStyle).toBe("clean");
    const off = toggleShapeSnapping(DEFAULT_TOOLBOX);
    expect(off.shapeSnapping).toBe(false);
    for (const slot of ["pen", "pencil", "highlighter"] as const) {
      expect(selectSlot(off, slot).shapeSnapping).toBe(false);
    }
    expect(toggleShapeSnapping(off).shapeSnapping).toBe(true);
  });

  test("the style is remembered, and survives being switched off and on", () => {
    const handDrawn = setShapeStyle(DEFAULT_TOOLBOX, "handDrawn");
    expect(handDrawn.shapeStyle).toBe("handDrawn");
    expect(stored(handDrawn).shapeStyle).toBe("handDrawn");
    expect(toggleShapeSnapping(toggleShapeSnapping(handDrawn)).shapeStyle).toBe("handDrawn");
    expect(stored(toggleShapeSnapping(handDrawn)).shapeSnapping).toBe(false);
  });

  test("setting the style it already has changes nothing, so nothing is saved", () => {
    expect(setShapeStyle(DEFAULT_TOOLBOX, "clean")).toBe(DEFAULT_TOOLBOX);
  });

  test("the tools themselves are untouched", () => {
    const edited = setShapeStyle(toggleShapeSnapping(DEFAULT_TOOLBOX), "handDrawn");
    expect(edited.slots).toBe(DEFAULT_TOOLBOX.slots);
    expect(canvasToolFor(edited)).toEqual(canvasToolFor(DEFAULT_TOOLBOX));
  });
});

describe("selectSlot", () => {
  test("remembers the slot it replaces", () => {
    const toolbox = selectSlot(selectSlot(DEFAULT_TOOLBOX, "highlighter"), "eraser");
    expect(toolbox.active).toBe("eraser");
    expect(toolbox.previous).toBe("highlighter");
  });

  test("selecting the active slot changes nothing", () => {
    expect(selectSlot(DEFAULT_TOOLBOX, "pen")).toBe(DEFAULT_TOOLBOX);
  });
});

describe("afterPencilAction", () => {
  const onHighlighter = selectSlot(DEFAULT_TOOLBOX, "highlighter");

  test("switch to eraser toggles between the eraser and the tool before it", () => {
    const erasing = afterPencilAction(onHighlighter, "switchEraser");
    expect(erasing.active).toBe("eraser");
    expect(afterPencilAction(erasing, "switchEraser").active).toBe("highlighter");
  });

  test("switch to eraser never gets stuck on the eraser", () => {
    const stuck = stored({ ...DEFAULT_TOOLBOX, active: "eraser", previous: "eraser" });
    expect(afterPencilAction(stuck, "switchEraser").active).toBe("pen");
  });

  test("switch to previous goes back and forth", () => {
    const back = afterPencilAction(onHighlighter, "switchPrevious");
    expect(back.active).toBe("pen");
    expect(afterPencilAction(back, "switchPrevious").active).toBe("highlighter");
  });

  test("palette, shortcut and ignore leave the tools unchanged", () => {
    const unchanged = PencilPreferredAction.options.filter(
      (action) => action !== "switchEraser" && action !== "switchPrevious",
    );
    expect(unchanged).toHaveLength(5);
    for (const action of unchanged) expect(afterPencilAction(onHighlighter, action)).toBe(onHighlighter);
  });
});

describe("StoredToolbox", () => {
  test("anything that isn't a toolbox gives the defaults", () => {
    for (const value of [null, 42, "pen", [], {}]) {
      expect(StoredToolbox.parse(value)).toEqual(DEFAULT_TOOLBOX);
    }
  });

  test("one corrupt slot falls back alone; the others keep the user's settings", () => {
    const toolbox = stored({
      active: "highlighter",
      previous: "pen",
      slots: {
        ...DEFAULT_TOOLBOX.slots,
        pen: { ...DEFAULT_TOOLBOX.slots.pen, color: "red" },
        highlighter: { ...DEFAULT_TOOLBOX.slots.highlighter, color: "#34C759" },
      },
    });
    expect(toolbox.active).toBe("highlighter");
    expect(toolbox.slots.pen).toEqual(DEFAULT_TOOLBOX.slots.pen);
    expect(toolbox.slots.highlighter.color).toBe(green);
  });

  test("a toolbox saved before the drawing policy existed keeps the user's tools", () => {
    const edited = selectSlot(setSlotColor(DEFAULT_TOOLBOX, "pen", red), "highlighter");
    const toolbox = stored({ active: edited.active, previous: edited.previous, slots: edited.slots });
    expect(toolbox.drawingPolicy).toBe("pencilOnly");
    expect(toolbox.active).toBe("highlighter");
    expect(toolbox.slots.pen.color).toBe(red);
  });

  test("a toolbox saved before shapes existed snaps to clean shapes and keeps the user's tools", () => {
    const edited = toggleDrawingPolicy(selectSlot(setSlotColor(DEFAULT_TOOLBOX, "pen", red), "highlighter"));
    const toolbox = stored({
      active: edited.active,
      previous: edited.previous,
      slots: edited.slots,
      drawingPolicy: edited.drawingPolicy,
      recentColors: edited.recentColors,
      dock: edited.dock,
    });
    expect(toolbox.shapeSnapping).toBe(true);
    expect(toolbox.shapeStyle).toBe("clean");
    expect(toolbox).toEqual(edited);
  });

  test("a shape style this version doesn't know falls back alone", () => {
    const toolbox = stored({ ...toggleShapeSnapping(DEFAULT_TOOLBOX), shapeStyle: "sketchy", shapeSnapping: "yes" });
    expect(toolbox.shapeStyle).toBe("clean");
    expect(toolbox.shapeSnapping).toBe(true);
    expect(toolbox.slots).toEqual(DEFAULT_TOOLBOX.slots);
  });

  test("an unknown active slot falls back to the pen", () => {
    expect(stored({ ...DEFAULT_TOOLBOX, active: "crayon" }).active).toBe("pen");
  });

  test("a pinned colour list of the wrong length resets that slot", () => {
    const toolbox = stored({
      ...DEFAULT_TOOLBOX,
      slots: {
        ...DEFAULT_TOOLBOX.slots,
        pencil: { ...DEFAULT_TOOLBOX.slots.pencil, pinnedColors: ["#000000", "#FFFFFF"] },
      },
    });
    expect(toolbox.slots.pencil).toEqual(DEFAULT_TOOLBOX.slots.pencil);
  });

  test("unknown fields from a newer version are dropped, not fatal", () => {
    const toolbox = stored({
      ...DEFAULT_TOOLBOX,
      handedness: "left",
      slots: { ...DEFAULT_TOOLBOX.slots, eraser: { ...DEFAULT_TOOLBOX.slots.eraser, softEdge: true } },
    });
    expect(toolbox).toEqual(DEFAULT_TOOLBOX);
  });
});

describe("width presets", () => {
  test("the default width is the middle preset", () => {
    expect(activePreset(DEFAULT_TOOLBOX, "pen")).toBe(1);
    expect(activePreset(DEFAULT_TOOLBOX, "highlighter")).toBe(1);
  });

  test("selecting a preset draws with it", () => {
    const toolbox = selectWidthPreset(DEFAULT_TOOLBOX, "pen", 2);
    expect(activePreset(toolbox, "pen")).toBe(2);
    expect(canvasToolFor(toolbox)).toMatchObject({ width: 5 });
  });

  test("the slider changes the selected preset, clamped to the ink and kept selected", () => {
    const toolbox = setWidthPreset(DEFAULT_TOOLBOX, "pen", 0, 1.234);
    expect(toolbox.slots.pen.widthPresets).toEqual([1.2, 3, 5]);
    expect(activePreset(toolbox, "pen")).toBe(0);
    expect(setWidthPreset(DEFAULT_TOOLBOX, "pencil", 0, 1).slots.pencil.widthPresets[0]).toBe(2.4);
    expect(setWidthPreset(DEFAULT_TOOLBOX, "pen", 0, Number.NaN)).toBe(DEFAULT_TOOLBOX);
  });

  test("a width set elsewhere shows no preset as selected", () => {
    expect(activePreset(setSlotWidth(DEFAULT_TOOLBOX, "pen", 7), "pen")).toBeNull();
  });

  test("an M1 pencil preset below PencilKit's minimum still draws, at the minimum", () => {
    const fromM1 = stored({
      ...DEFAULT_TOOLBOX,
      active: "pencil",
      slots: {
        ...DEFAULT_TOOLBOX.slots,
        pencil: { ...DEFAULT_TOOLBOX.slots.pencil, width: 2, widthPresets: [2, 4, 8] },
      },
    });
    expect(canvasToolFor(fromM1)).toMatchObject({ width: 2.4 });
    expect(activePreset(fromM1, "pencil")).toBe(0);
  });
});

describe("pen ink", () => {
  test("switching to monoline clamps the width it draws with, and keeps the presets", () => {
    const monoline = setPenInk(selectWidthPreset(DEFAULT_TOOLBOX, "pen", 2), "monoline");
    expect(canvasToolFor(monoline)).toMatchObject({ ink: "monoline", width: 4 });
    expect(effectiveWidth(monoline, "pen")).toBe(4);
    expect(monoline.slots.pen.widthPresets).toEqual([1.5, 3, 5]);
    expect(canvasToolFor(setPenInk(monoline, "pen"))).toMatchObject({ ink: "pen", width: 5 });
  });

  test("setting the same ink changes nothing", () => {
    expect(setPenInk(DEFAULT_TOOLBOX, "pen")).toBe(DEFAULT_TOOLBOX);
  });
});

describe("pinned and recent colours", () => {
  test("replacing a pin draws with it and selects the slot", () => {
    const purple = HexColor.parse("#7B3FE4");
    const toolbox = setPinnedColor(selectSlot(DEFAULT_TOOLBOX, "eraser"), "pencil", 2, purple);
    expect(toolbox.active).toBe("pencil");
    expect(toolbox.slots.pencil.pinnedColors[2]).toBe(purple);
    expect(toolbox.slots.pencil.pinnedColors[0]).toBe(DEFAULT_TOOLBOX.slots.pencil.pinnedColors[0]);
    expect(canvasToolFor(toolbox)).toMatchObject({ colorHex: purple });
    expect(toolbox.recentColors).toEqual([]);
  });

  test("setting the pin it already has only selects the slot", () => {
    const pen = DEFAULT_TOOLBOX.slots.pen.pinnedColors[0];
    expect(setPinnedColor(DEFAULT_TOOLBOX, "pen", 0, pen)).toBe(DEFAULT_TOOLBOX);
  });

  test("a picked colour goes to the front of the recent colours, once", () => {
    const once = addRecentColor(DEFAULT_TOOLBOX, green);
    expect(once.recentColors).toEqual([green]);
    expect(addRecentColor(once, green)).toBe(once);
  });

  test("tapping a pinned colour doesn't fill the recent colours", () => {
    expect(chooseColor(DEFAULT_TOOLBOX, "pen", red).recentColors).toEqual([]);
  });

  test("recent colours: newest first, no duplicates (case-insensitive), at most eight", () => {
    const colors = Array.from({ length: 10 }, (_, index) => HexColor.parse(`#00000${String(index)}`));
    const recent = colors.reduce<readonly HexColor[]>((list, color) => rememberColor(list, color), []);
    expect(recent).toHaveLength(MAX_RECENT_COLORS);
    expect(recent[0]).toBe(colors[9]);
    const again = rememberColor(recent, HexColor.parse("#000005"));
    expect(again[0]).toBe(HexColor.parse("#000005"));
    expect(again).toHaveLength(MAX_RECENT_COLORS);
    expect(rememberColor([HexColor.parse("#1a73e8")], HexColor.parse("#1A73E8"))).toEqual([HexColor.parse("#1A73E8")]);
  });

  test("stored recent colours survive, and a corrupt list resets alone", () => {
    const toolbox = addRecentColor(setPinnedColor(DEFAULT_TOOLBOX, "pen", 1, green), green);
    expect(stored(toolbox).recentColors).toEqual([green]);
    const corrupt = stored({ ...toolbox, recentColors: ["nope"] });
    expect(corrupt.recentColors).toEqual([]);
    expect(corrupt.slots.pen.pinnedColors[1]).toBe(green);
  });
});

describe("toolbar dock", () => {
  const area = { width: 834, height: 1100 };

  test("starts at the bottom and survives storing", () => {
    expect(DEFAULT_TOOLBOX.dock).toBe("bottom");
    expect(stored(setDock(DEFAULT_TOOLBOX, "left")).dock).toBe("left");
  });

  test("a toolbox saved before docking existed keeps everything else", () => {
    const edited = setPinnedColor(DEFAULT_TOOLBOX, "pen", 1, green);
    // Saved by M2a: every field except `dock`.
    const toolbox = stored({
      active: edited.active,
      previous: edited.previous,
      slots: edited.slots,
      drawingPolicy: edited.drawingPolicy,
      recentColors: [green],
    });
    expect(toolbox.dock).toBe("bottom");
    expect(toolbox.slots.pen.pinnedColors[1]).toBe(green);
    expect(toolbox.recentColors).toEqual([green]);
    expect(stored({ ...DEFAULT_TOOLBOX, dock: "middle" }).dock).toBe("bottom");
  });

  test("setting the dock it already has changes nothing", () => {
    expect(setDock(DEFAULT_TOOLBOX, "bottom")).toBe(DEFAULT_TOOLBOX);
  });

  test("snaps to the edge closest to where the toolbar is let go", () => {
    expect(nearestDock({ x: 417, y: 1050 }, area)).toBe("bottom");
    expect(nearestDock({ x: 417, y: 40 }, area)).toBe("top");
    expect(nearestDock({ x: 30, y: 550 }, area)).toBe("left");
    expect(nearestDock({ x: 800, y: 550 }, area)).toBe("right");
    expect(nearestDock({ x: 60, y: 1080 }, area)).toBe("bottom");
  });

  test("a drop in the exact middle prefers the bottom", () => {
    expect(nearestDock({ x: 50, y: 50 }, { width: 100, height: 100 })).toBe("bottom");
  });

  test("left and right are vertical", () => {
    expect(ToolbarDock.options.filter(isVerticalDock)).toEqual(["left", "right"]);
  });
});

describe("eraser", () => {
  const erasing = selectSlot(DEFAULT_TOOLBOX, "eraser");

  test("starts as a stroke eraser for every ink, with presets inside PencilKit's pixel range", () => {
    expect(canvasToolFor(erasing)).toEqual({ kind: "eraser", mode: "stroke", width: 24, highlighterOnly: false });
    expect(DEFAULT_TOOLBOX.slots.eraser.widthPresets).toEqual([16.4, 24, 40]);
    expect(activeEraserPreset(erasing)).toBe(1);
  });

  test("mode and highlighter-only switch and survive storing", () => {
    const toolbox = toggleHighlighterOnly(setEraserMode(erasing, "pixel"));
    expect(canvasToolFor(toolbox)).toMatchObject({ mode: "pixel", highlighterOnly: true });
    expect(stored(toolbox).slots.eraser).toEqual(toolbox.slots.eraser);
    expect(toggleHighlighterOnly(toolbox).slots.eraser.highlighterOnly).toBe(false);
    expect(setEraserMode(toolbox, "pixel")).toBe(toolbox);
  });

  test("the slider edits the selected preset inside 16.4–80 pt, and presets select", () => {
    const wide = setEraserPreset(erasing, 2, 120);
    expect(wide.slots.eraser.widthPresets).toEqual([16.4, 24, 80]);
    expect(activeEraserPreset(wide)).toBe(2);
    expect(canvasToolFor(selectEraserPreset(wide, 0))).toMatchObject({ width: 16.4 });
    expect(setEraserPreset(erasing, 0, Number.NaN)).toBe(erasing);
  });

  test("an M1 preset below the pixel eraser's minimum erases at the minimum", () => {
    const fromM1 = stored({
      ...erasing,
      slots: { ...erasing.slots, eraser: { mode: "pixel", width: 16, widthPresets: [16, 24, 40] } },
    });
    expect(canvasToolFor(fromM1)).toMatchObject({ width: 16.4, highlighterOnly: false });
    expect(activeEraserPreset(fromM1)).toBe(0);
  });

  test("an eraser saved before highlighter-only existed keeps its mode and width", () => {
    const old = stored({
      ...erasing,
      slots: { ...erasing.slots, eraser: { mode: "pixel", width: 40, widthPresets: [16.4, 24, 40] } },
    });
    expect(old.slots.eraser).toEqual({
      mode: "pixel",
      width: 40,
      widthPresets: [16.4, 24, 40],
      highlighterOnly: false,
    });
  });
});
