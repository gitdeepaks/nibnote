import { z } from "zod";
import {
  DrawingPolicy,
  HexColor,
  StrokeWidth,
  type CanvasTool,
  type InkType,
  type PencilPreferredAction,
} from "./canvas";
import { clampWidth, sameColor, widthRange, type WidthRange } from "./ink";

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
  /** Colours picked in the colour popover, newest first, at most `MAX_RECENT_COLORS`. */
  readonly recentColors: readonly HexColor[];
};

export const MAX_RECENT_COLORS = 8;

/** One of a slot's three pinned colours or width presets. */
export type TrioIndex = 0 | 1 | 2;

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
    // PencilKit's pencil is at least 2.4 pt wide.
    widthPresets: [2.4, 4, 8],
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
  recentColors: [],
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
    recentColors: z.array(HexColor).max(MAX_RECENT_COLORS).readonly().catch(DEFAULT_TOOLBOX.recentColors),
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
    case "pencil":
      return {
        kind: "ink",
        ink: inkOf(toolbox, toolbox.active),
        colorHex: slots[toolbox.active].color,
        width: effectiveWidth(toolbox, toolbox.active),
      };
    case "highlighter":
      return {
        kind: "highlighter",
        colorHex: slots.highlighter.color,
        width: effectiveWidth(toolbox, "highlighter"),
      };
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

/** The PencilKit ink a colour slot draws with. */
export function inkOf(toolbox: Toolbox, slot: ColorSlot): InkType | "marker" {
  switch (slot) {
    case "pen":
      return toolbox.slots.pen.ink;
    case "pencil":
      return "pencil";
    case "highlighter":
      return "marker";
  }
}

/** The widths a colour slot's current ink accepts. */
export function slotWidthRange(toolbox: Toolbox, slot: ColorSlot): WidthRange {
  return widthRange(inkOf(toolbox, slot));
}

/** The width a slot actually draws with: its width, clamped to what its ink accepts. */
export function effectiveWidth(toolbox: Toolbox, slot: ColorSlot): number {
  return clampWidth(toolbox.slots[slot].width, slotWidthRange(toolbox, slot));
}

/** The preset the slot is drawing with, or null after a custom width. */
export function activePreset(toolbox: Toolbox, slot: ColorSlot): TrioIndex | null {
  const range = slotWidthRange(toolbox, slot);
  const width = effectiveWidth(toolbox, slot);
  const index = toolbox.slots[slot].widthPresets.findIndex((preset) => clampWidth(preset, range) === width);
  return index === 0 || index === 1 || index === 2 ? index : null;
}

/** Draws with one of the slot's width presets. */
export function selectWidthPreset(toolbox: Toolbox, slot: ColorSlot, index: TrioIndex): Toolbox {
  const width = toolbox.slots[slot].widthPresets[index];
  return toolbox.slots[slot].width === width
    ? toolbox
    : updateColorSlot(toolbox, slot, (settings) => ({ ...settings, width }));
}

/**
 * Changes one width preset (from the slider) and draws with it. The width is clamped to the ink's
 * range and rounded to 0.1 pt, so the preset stays selected.
 */
export function setWidthPreset(toolbox: Toolbox, slot: ColorSlot, index: TrioIndex, width: number): Toolbox {
  if (!Number.isFinite(width)) return toolbox;
  const clamped = clampWidth(width, slotWidthRange(toolbox, slot));
  const widthPresets = replaceAt(toolbox.slots[slot].widthPresets, index, clamped);
  return updateColorSlot(toolbox, slot, (settings) => ({ ...settings, width: clamped, widthPresets }));
}

/** Changes the pen's ink. Widths stay as they are and are clamped to the new ink when drawing. */
export function setPenInk(toolbox: Toolbox, ink: PenInk): Toolbox {
  const { slots } = toolbox;
  return slots.pen.ink === ink ? toolbox : withSlots(toolbox, { ...slots, pen: { ...slots.pen, ink } });
}

/**
 * Puts `color` in one of the slot's pinned places (from the colour popover) and draws with it.
 * Recent colours are separate (`addRecentColor`): the system picker reports every colour on the
 * way while dragging, and only the one the user settles on belongs in the list.
 */
export function setPinnedColor(toolbox: Toolbox, slot: ColorSlot, index: TrioIndex, color: HexColor): Toolbox {
  const settings = toolbox.slots[slot];
  if (sameColor(settings.pinnedColors[index], color) && sameColor(settings.color, color)) {
    return selectSlot(toolbox, slot);
  }
  const pinnedColors = replaceAt(settings.pinnedColors, index, color);
  return selectSlot(
    updateColorSlot(toolbox, slot, (current) => ({ ...current, color, pinnedColors })),
    slot,
  );
}

/** Remembers a colour the user picked in the colour popover. */
export function addRecentColor(toolbox: Toolbox, color: HexColor): Toolbox {
  const recentColors = rememberColor(toolbox.recentColors, color);
  const unchanged =
    recentColors.length === toolbox.recentColors.length &&
    recentColors.every((candidate, index) => candidate === toolbox.recentColors[index]);
  return unchanged ? toolbox : { ...toolbox, recentColors };
}

/** Puts `color` first in the recent colours, without duplicates, keeping at most eight. */
export function rememberColor(recent: readonly HexColor[], color: HexColor): readonly HexColor[] {
  return [color, ...recent.filter((candidate) => !sameColor(candidate, color))].slice(0, MAX_RECENT_COLORS);
}

/** Changes the settings every colour slot shares; the pen keeps its ink. */
type ColorSlotUpdate = <S extends InkSettings>(settings: S) => S;

function updateColorSlot(toolbox: Toolbox, slot: ColorSlot, update: ColorSlotUpdate): Toolbox {
  const { slots } = toolbox;
  switch (slot) {
    case "pen":
      return withSlots(toolbox, { ...slots, pen: update(slots.pen) });
    case "pencil":
      return withSlots(toolbox, { ...slots, pencil: update(slots.pencil) });
    case "highlighter":
      return withSlots(toolbox, { ...slots, highlighter: update(slots.highlighter) });
  }
}

function replaceAt<T>(trio: readonly [T, T, T], index: TrioIndex, value: T): readonly [T, T, T] {
  return [index === 0 ? value : trio[0], index === 1 ? value : trio[1], index === 2 ? value : trio[2]];
}
