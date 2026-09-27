import { HexColor } from "@nibnote/shared";

/** Cover colours offered when creating a notebook. */
export const COVER_COLORS: readonly { readonly name: string; readonly hex: HexColor }[] = [
  { name: "Ink", hex: HexColor.parse("#1C1C1E") },
  { name: "Blue", hex: HexColor.parse("#0A60FF") },
  { name: "Teal", hex: HexColor.parse("#0F9D8A") },
  { name: "Green", hex: HexColor.parse("#34A853") },
  { name: "Yellow", hex: HexColor.parse("#F4B400") },
  { name: "Orange", hex: HexColor.parse("#F57C00") },
  { name: "Red", hex: HexColor.parse("#E5383B") },
  { name: "Purple", hex: HexColor.parse("#7E57C2") },
];

export const DEFAULT_COVER = COVER_COLORS[1]?.hex ?? HexColor.parse("#0A60FF");
