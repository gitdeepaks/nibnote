import { z } from "zod";
import { DrawingPolicy, HexColor, StrokeWidth, type CanvasTool, type PencilPreferredAction } from "./canvas";

// The editor's tools: five slots, each remembering its own settings, persisted on the device.
// Reading a stored toolbox never fails: a bad slot falls back to its default on its own, and a
// field added in a later version falls back through its own `.catch`, so an upgrade never resets
// the rest. Every field added later must carry a `.catch` for the same reason.

export const ToolSlot = z.enum(["pen", "pencil", "highlighter", "eraser", "lasso"]);
export type ToolSlot = z.infer<typeof ToolSlot>;

/** Slots that draw with a colour. */
export type ColorSlot = "pen" | "pencil" | "highlighter";
/** Slots with a width. */
export type SizedSlot = ColorSlot | "eraser";

/** The pen slot's ink; pencil and highlighter have fixed inks. */
export const PenInk = z.enum(["pen", "fountainPen", "monoline"]);
export type PenInk = z.infer<typeof PenInk>;

export const EraserMode = z.enum(["stroke", "pixel"]);
export type EraserMode = z.infer<typeof EraserMode>;

const three = <T extends z.ZodType>(item: T) => z.tuple([item, item, item]).readonly();

const colorShape = {
  color: HexColor,
  width: StrokeWidth,
  pinnedColors: three(HexColor),
  widthPresets: three(StrokeWidth),
};

const PenSettings = z.object({ ...colorShape, ink: PenInk }).readonly();
const InkSettings = z.object(colorShape).readonly();
const EraserSettings = z
  .object({
    mode: EraserMode,
    width: StrokeWidth,
    widthPresets: three(StrokeWidth),
  })
  .readonly();

export type PenSettings = z.infer<typeof PenSettings>;
export type InkSettings = z.infer<typeof InkSettings>;
export type EraserSettings = z.infer<typeof EraserSettings>;

export type ToolSlots = {
  readonly pen: PenSettings;
  readonly pencil: InkSettings;
  readonly highlighter: InkSettings;
  readonly eraser: EraserSettings;
};

export type Toolbox = {
  readonly active: ToolSlot;
  /** The slot before `active`: Apple Pencil's "switch to previous tool" returns to it. */
  readonly previous: ToolSlot;
  readonly slots: ToolSlots;
  /** Whether a finger draws too, or only Apple Pencil (the finger then scrolls and zooms). */
  readonly drawingPolicy: DrawingPolicy;
};

const hex = (value: string) => HexColor.parse(value);

const DEFAULT_SLOTS: ToolSlots = {
  pen: {
    ink: "pen",
    color: hex("#1C1C1E"),
    width: 3,
    pinnedColors: [hex("#1C1C1E"), hex("#0A60FF"), hex("#E5383B")],
    widthPresets: [1.5, 3, 5],
  },
  pencil: {
    color: hex("#3A3A3C"),
    width: 4,
    pinnedColors: [hex("#3A3A3C"), hex("#0A60FF"), hex("#E5383B")],
    widthPresets: [2, 4, 8],
  },
  highlighter: {
    color: hex("#FFD60A"),
    width: 18,
    pinnedColors: [hex("#FFD60A"), hex("#34C759"), hex("#FF6FB5")],
    widthPresets: [12, 18, 28],
  },
  // PencilKit's pixel eraser is at least about 16 pt wide, so the presets start there.
  eraser: { mode: "stroke", width: 24, widthPresets: [16, 24, 40] },
};

export const DEFAULT_TOOLBOX: Toolbox = {
  active: "pen",
  previous: "pen",
  slots: DEFAULT_SLOTS,
  drawingPolicy: "pencilOnly",
};

/** The stored toolbox. Parsing never fails; see the note at the top of this file. */
export const StoredToolbox = z
  .object({
    active: ToolSlot.catch(DEFAULT_TOOLBOX.active),
    previous: ToolSlot.catch(DEFAULT_TOOLBOX.previous),
    slots: z
      .object({
        pen: PenSettings.catch(DEFAULT_SLOTS.pen),
        pencil: InkSettings.catch(DEFAULT_SLOTS.pencil),
        highlighter: InkSettings.catch(DEFAULT_SLOTS.highlighter),
        eraser: EraserSettings.catch(DEFAULT_SLOTS.eraser),
      })
      .readonly()
      .catch(DEFAULT_SLOTS),
    // Added after M1 shipped to the device: a toolbox stored without it keeps everything else.
    drawingPolicy: DrawingPolicy.catch(DEFAULT_TOOLBOX.drawingPolicy),
  })
  .readonly()
  .catch(DEFAULT_TOOLBOX);

/** Makes `slot` the active tool; the one it replaces becomes `previous`. */
export function selectSlot(toolbox: Toolbox, slot: ToolSlot): Toolbox {
  if (slot === toolbox.active) return toolbox;
  return { ...toolbox, active: slot, previous: toolbox.active };
}

/** Switches between "only Apple Pencil draws" and "a finger draws too". */
export function toggleDrawingPolicy(toolbox: Toolbox): Toolbox {
  return { ...toolbox, drawingPolicy: toolbox.drawingPolicy === "pencilOnly" ? "anyInput" : "pencilOnly" };
}

/** Sets the colour a slot draws with. The slot's pinned colours stay as they are. */
export function setSlotColor(toolbox: Toolbox, slot: ColorSlot, color: HexColor): Toolbox {
  const { slots } = toolbox;
  switch (slot) {
    case "pen":
      return slots.pen.color === color ? toolbox : withSlots(toolbox, { ...slots, pen: { ...slots.pen, color } });
    case "pencil":
      return slots.pencil.color === color
        ? toolbox
        : withSlots(toolbox, { ...slots, pencil: { ...slots.pencil, color } });
    case "highlighter":
      return slots.highlighter.color === color
        ? toolbox
        : withSlots(toolbox, { ...slots, highlighter: { ...slots.highlighter, color } });
  }
}

/** The slot as a colour slot, or null for the eraser and lasso. */
export function colorSlotOf(slot: ToolSlot): ColorSlot | null {
  switch (slot) {
    case "pen":
    case "pencil":
    case "highlighter":
      return slot;
    case "eraser":
    case "lasso":
      return null;
  }
}

/**
 * The slot whose pinned colours the toolbar shows: the active one, or while erasing or selecting,
 * the colour tool used last. The colours stay on screen for every tool, so the toolbar never
 * changes width under the hand, and tapping one from the eraser goes straight back to drawing.
 */
export function colorTarget(toolbox: Toolbox): ColorSlot {
  return colorSlotOf(toolbox.active) ?? colorSlotOf(toolbox.previous) ?? "pen";
}

/** Draws with `color` on `slot`: sets the colour and makes the slot active. */
export function chooseColor(toolbox: Toolbox, slot: ColorSlot, color: HexColor): Toolbox {
  return selectSlot(setSlotColor(toolbox, slot, color), slot);
}

/** Sets a slot's width; a width outside what strokes allow leaves the toolbox unchanged. */
export function setSlotWidth(toolbox: Toolbox, slot: SizedSlot, width: number): Toolbox {
  if (!StrokeWidth.safeParse(width).success) return toolbox;
  const { slots } = toolbox;
  switch (slot) {
    case "pen":
      return withSlots(toolbox, { ...slots, pen: { ...slots.pen, width } });
    case "pencil":
      return withSlots(toolbox, { ...slots, pencil: { ...slots.pencil, width } });
    case "highlighter":
      return withSlots(toolbox, { ...slots, highlighter: { ...slots.highlighter, width } });
    case "eraser":
      return withSlots(toolbox, { ...slots, eraser: { ...slots.eraser, width } });
  }
}

/** What the canvas draws with. */
export function canvasToolFor(toolbox: Toolbox): CanvasTool {
  const { slots } = toolbox;
  switch (toolbox.active) {
    case "pen":
      return { kind: "ink", ink: slots.pen.ink, colorHex: slots.pen.color, width: slots.pen.width };
    case "pencil":
      return { kind: "ink", ink: "pencil", colorHex: slots.pencil.color, width: slots.pencil.width };
    case "highlighter":
      return { kind: "highlighter", colorHex: slots.highlighter.color, width: slots.highlighter.width };
    case "eraser":
      return { kind: "eraser", mode: slots.eraser.mode, width: slots.eraser.width };
    case "lasso":
      return { kind: "lasso" };
  }
}

/**
 * The toolbox after an Apple Pencil double-tap or squeeze, following the user's system setting.
 * The palette actions open UI instead (Phase 3 M3), so they leave the tools as they are.
 */
export function afterPencilAction(toolbox: Toolbox, action: PencilPreferredAction): Toolbox {
  switch (action) {
    case "switchEraser":
      if (toolbox.active !== "eraser") return selectSlot(toolbox, "eraser");
      return selectSlot(toolbox, toolbox.previous === "eraser" ? "pen" : toolbox.previous);
    case "switchPrevious":
      return selectSlot(toolbox, toolbox.previous);
    case "ignore":
    case "showColorPalette":
    case "showInkAttributes":
    case "showContextualPalette":
    case "runSystemShortcut":
      return toolbox;
  }
}

function withSlots(toolbox: Toolbox, slots: ToolSlots): Toolbox {
  return { ...toolbox, slots };
}

/**
 * A plain-English name for a colour, for VoiceOver ("Blue pen"). Custom colours have no stored
 * name, so every colour is named from its hue, saturation and lightness.
 */
export function colorName(color: HexColor): string {
  const channel = (start: number) => Number.parseInt(color.slice(start, start + 2), 16) / 255;
  const red = channel(1);
  const green = channel(3);
  const blue = channel(5);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  if (lightness < 0.15) return "Black";
  if (lightness > 0.92) return "White";
  if (saturation < 0.15) return "Gray";

  const sector =
    max === red ? (green - blue) / delta : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  const hue = (sector * 60 + 360) % 360;
  if (hue < 15 || hue >= 345) return lightness < 0.3 ? "Brown" : "Red";
  if (hue < 45) return lightness < 0.35 ? "Brown" : "Orange";
  if (hue < 70) return "Yellow";
  if (hue < 165) return "Green";
  if (hue < 195) return "Teal";
  if (hue < 255) return "Blue";
  if (hue < 290) return "Purple";
  return "Pink";
}
