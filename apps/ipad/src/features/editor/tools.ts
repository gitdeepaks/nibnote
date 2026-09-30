import { HexColor, type CanvasTool, type PencilPreferredAction } from "@nibnote/shared";
import type { SFSymbol } from "expo-symbols";

// The small M3a tool set. The full toolbar (slots, widths, pinned colours, persistence) is Phase 3.

export type ToolKey = "pen" | "highlighter" | "eraser" | "lasso";

export const TOOLS: readonly { readonly key: ToolKey; readonly label: string; readonly icon: SFSymbol }[] = [
  { key: "pen", label: "Pen", icon: "pencil.tip" },
  { key: "highlighter", label: "Highlighter", icon: "highlighter" },
  { key: "eraser", label: "Eraser", icon: "eraser" },
  { key: "lasso", label: "Lasso", icon: "lasso" },
];

export const PEN_COLORS: readonly { readonly name: string; readonly hex: HexColor }[] = [
  { name: "Black", hex: HexColor.parse("#1C1C1E") },
  { name: "Blue", hex: HexColor.parse("#0A60FF") },
  { name: "Red", hex: HexColor.parse("#E5383B") },
];

export const DEFAULT_PEN_COLOR = PEN_COLORS[0]?.hex ?? HexColor.parse("#1C1C1E");
const HIGHLIGHTER_COLOR = HexColor.parse("#FFD60A");

export function toolFor(key: ToolKey, penColor: HexColor): CanvasTool {
  switch (key) {
    case "pen":
      return { kind: "ink", ink: "pen", colorHex: penColor, width: 3 };
    case "highlighter":
      return { kind: "highlighter", colorHex: HIGHLIGHTER_COLOR, width: 18 };
    case "eraser":
      return { kind: "eraser", mode: "stroke", width: 20 };
    case "lasso":
      return { kind: "lasso" };
  }
}

/** The tool after an Apple Pencil double-tap or squeeze, following the user's system setting. */
export function toolAfterPencilAction(action: PencilPreferredAction, current: ToolKey, previous: ToolKey): ToolKey {
  switch (action) {
    case "switchEraser":
      return current === "eraser" ? previous : "eraser";
    case "switchPrevious":
      return previous;
    case "ignore":
    case "showColorPalette":
    case "showInkAttributes":
    case "showContextualPalette":
    case "runSystemShortcut":
      return current;
  }
}
