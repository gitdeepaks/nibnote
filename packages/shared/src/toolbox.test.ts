import { describe, expect, test } from "bun:test";
import {
  afterPencilAction,
  CanvasTool,
  canvasToolFor,
  chooseColor,
  colorName,
  colorTarget,
  DEFAULT_TOOLBOX,
  HexColor,
  PencilPreferredAction,
  selectSlot,
  setSlotColor,
  setSlotWidth,
  StoredToolbox,
  toggleDrawingPolicy,
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
    expect(at("eraser")).toEqual({ kind: "eraser", mode: "stroke", width: 24 });
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
      dock: "left",
      slots: { ...DEFAULT_TOOLBOX.slots, eraser: { ...DEFAULT_TOOLBOX.slots.eraser, highlighterOnly: true } },
    });
    expect(toolbox).toEqual(DEFAULT_TOOLBOX);
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
    for (const [color, name] of names) expect(colorName(HexColor.parse(color))).toBe(name);
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
    for (const [color, name] of names) expect(colorName(HexColor.parse(color))).toBe(name);
  });
});
