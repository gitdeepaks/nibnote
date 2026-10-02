import type { CanvasPoint, PencilPreferredAction } from "./canvas";
import { sameColor } from "./ink";
import { colorSlotOf, colorTarget, type ToolSlot, type Toolbox, type TrioIndex } from "./toolbox";

// Apple Pencil's double-tap and squeeze: what the editor does for each of the user's system
// preferences, and the radial palette that opens at the Pencil's tip.

/** A Pencil surface open on the page: the radial palette, or the active tool's options popover. */
export type PencilSurface = "palette" | "options";

export type PencilResponse =
  /** Switch tools with `afterPencilAction`; `keepOpen` leaves an open palette showing the result. */
  | {
      readonly kind: "switchTool";
      readonly action: "switchEraser" | "switchPrevious";
      readonly keepOpen: boolean;
    }
  | { readonly kind: "open"; readonly surface: PencilSurface }
  | { readonly kind: "close" }
  | { readonly kind: "none" };

const NONE: PencilResponse = { kind: "none" };

/**
 * Follows the user's preference (Settings → Apple Pencil), with the system's rules for an open
 * palette: a double-tap switches between the current tool and the eraser while the palette stays
 * open (as Settings describes), and a squeeze closes it. "Off" and "Run shortcut" do nothing here;
 * the system runs the shortcut itself.
 */
export function pencilResponse(
  kind: "tap" | "squeeze",
  action: PencilPreferredAction,
  open: PencilSurface | null,
): PencilResponse {
  if (action === "ignore" || action === "runSystemShortcut") return NONE;
  if (open === "palette") {
    return kind === "tap" ? { kind: "switchTool", action: "switchEraser", keepOpen: true } : { kind: "close" };
  }
  switch (action) {
    case "switchEraser":
    case "switchPrevious":
      return { kind: "switchTool", action, keepOpen: false };
    case "showColorPalette":
    case "showContextualPalette":
      return { kind: "open", surface: "palette" };
    case "showInkAttributes":
      return open === "options" ? { kind: "close" } : { kind: "open", surface: "options" };
  }
}

/** Whether the active tool has options to show at the Pencil (the lasso has none). */
export function hasToolOptions(toolbox: Toolbox): boolean {
  return toolbox.active !== "lasso";
}

export type PaletteItem =
  | { readonly kind: "tool"; readonly slot: ToolSlot }
  | { readonly kind: "color"; readonly index: TrioIndex }
  | { readonly kind: "options" };

/**
 * The palette's ring, clockwise from the top: the five tools, the three pinned colours of the
 * colour tool in use, then the active tool's options (left out for the lasso, which has none).
 */
export function paletteItems(toolbox: Toolbox): readonly PaletteItem[] {
  const tools: readonly PaletteItem[] = (["pen", "pencil", "highlighter", "eraser"] as const).map((slot) => ({
    kind: "tool",
    slot,
  }));
  const colors: readonly PaletteItem[] = ([0, 1, 2] as const).map((index) => ({ kind: "color", index }));
  const options: readonly PaletteItem[] = hasToolOptions(toolbox) ? [{ kind: "options" }] : [];
  return [...tools, ...colors, ...options, { kind: "tool", slot: "lasso" }];
}

/** Whether an item shows as selected: the active tool, or the pinned colour a colour tool draws with. */
export function isPaletteItemSelected(toolbox: Toolbox, item: PaletteItem): boolean {
  switch (item.kind) {
    case "tool":
      return toolbox.active === item.slot;
    case "color": {
      if (colorSlotOf(toolbox.active) === null) return false;
      const settings = toolbox.slots[colorTarget(toolbox)];
      return sameColor(settings.color, settings.pinnedColors[item.index]);
    }
    case "options":
      return false;
  }
}

export type AreaSize = { readonly width: number; readonly height: number };

/** Distance from the palette's centre to the centre of each item, in points. */
export const PALETTE_RADIUS = 84;
/** Each item's tap target, in points. */
export const PALETTE_ITEM = 44;
/** Space kept between the palette and the edges of the page area. */
export const PALETTE_MARGIN = 12;

export type PaletteLayout = {
  readonly center: CanvasPoint;
  readonly items: readonly CanvasPoint[];
};

/**
 * Places the palette around `point` (the area's centre when it is null), moved inward so the whole
 * ring stays `PALETTE_MARGIN` inside the area; an area too small for it gets the palette centred.
 * Items sit evenly around the ring, the first at the top.
 */
export function radialLayout(point: CanvasPoint | null, area: AreaSize, count: number): PaletteLayout {
  const reach = PALETTE_RADIUS + PALETTE_ITEM / 2 + PALETTE_MARGIN;
  const fit = (value: number, length: number) =>
    length < reach * 2 ? length / 2 : Math.min(length - reach, Math.max(reach, value));
  const center = {
    x: fit(point?.x ?? area.width / 2, area.width),
    y: fit(point?.y ?? area.height / 2, area.height),
  };
  const items = Array.from({ length: Math.max(0, count) }, (_, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    return { x: center.x + PALETTE_RADIUS * Math.cos(angle), y: center.y + PALETTE_RADIUS * Math.sin(angle) };
  });
  return { center, items };
}

/** A popover at the Pencil opens away from the nearer edge: above in the lower half, below in the upper. */
export function popoverSideAt(point: CanvasPoint | null, area: AreaSize): "above" | "below" {
  const y = point?.y ?? area.height / 2;
  return y > area.height / 2 ? "above" : "below";
}
