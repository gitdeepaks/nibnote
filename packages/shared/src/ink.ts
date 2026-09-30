import { HexColor, type InkType } from "./canvas";

// Colours and widths as PencilKit draws them: preset palettes, the width each ink supports,
// typed-in HEX parsing, and whether a colour will actually be visible on the page.

export type WidthRange = { readonly min: number; readonly max: number };

/**
 * The widths each PencilKit ink accepts (`validWidthRange`, read on the iOS 27 SDK), rounded
 * inward. The native side clamps too; clamping here keeps the numbers the UI shows honest.
 */
export function widthRange(ink: InkType | "marker"): WidthRange {
  switch (ink) {
    case "pen":
      return { min: 0.9, max: 25.6 };
    case "fountainPen":
      return { min: 1.5, max: 14 };
    case "monoline":
      return { min: 0.5, max: 4 };
    case "pencil":
      return { min: 2.4, max: 16 };
    case "marker":
      return { min: 7.5, max: 60 };
  }
}

/** Clamps a width into `range` and rounds it to 0.1 pt, so a preset and the width compare equal. */
export function clampWidth(width: number, range: WidthRange): number {
  const clamped = Math.min(range.max, Math.max(range.min, width));
  return Math.round(clamped * 10) / 10;
}

const hex = (value: string) => HexColor.parse(value);

/** Ink colours offered in the colour popover, dark to bright. */
export const INK_PRESETS: readonly HexColor[] = [
  hex("#1C1C1E"),
  hex("#3A3A3C"),
  hex("#8E8E93"),
  hex("#1B3A8C"),
  hex("#0A60FF"),
  hex("#0F8B8D"),
  hex("#1E8E3E"),
  hex("#7A4B22"),
  hex("#F28C28"),
  hex("#E5383B"),
  hex("#D6336C"),
  hex("#7B3FE4"),
];

/** Highlighter colours: light and saturated, since the highlighter is drawn translucent. */
export const HIGHLIGHTER_PRESETS: readonly HexColor[] = [
  hex("#FFD60A"),
  hex("#34C759"),
  hex("#FF6FB5"),
  hex("#5AC8FA"),
  hex("#FF9F0A"),
  hex("#BF5AF2"),
  hex("#63E6BE"),
  hex("#FF6B6B"),
];

/**
 * Reads a colour typed or pasted by the user: `#1A73E8`, `1a73e8`, the short `#1AE`, or a
 * colour with alpha (`#1A73E8FF`, alpha dropped: ink opacity comes from the tool). Returns
 * `#RRGGBB` in upper case, or null when the text isn't a colour.
 */
export function parseHexInput(text: string): HexColor | null {
  const digits = text.trim().replace(/^#/, "");
  if (!/^[0-9A-Fa-f]+$/.test(digits)) return null;
  const full =
    digits.length === 3
      ? digits.replace(/./g, (digit) => digit + digit)
      : digits.length === 6 || digits.length === 8
        ? digits.slice(0, 6)
        : null;
  if (full === null) return null;
  const parsed = HexColor.safeParse(`#${full.toUpperCase()}`);
  return parsed.success ? parsed.data : null;
}

/** The same colour for comparisons: upper case, alpha dropped. */
export function sameColor(a: HexColor, b: HexColor): boolean {
  return a.slice(0, 7).toUpperCase() === b.slice(0, 7).toUpperCase();
}

function channels(color: HexColor): readonly [number, number, number] {
  const channel = (start: number) => Number.parseInt(color.slice(start, start + 2), 16) / 255;
  return [channel(1), channel(3), channel(5)];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(color: HexColor): number {
  const linear = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const [red, green, blue] = channels(color);
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: HexColor, b: HexColor): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** Whether ink in this colour will read well on the (always white) paper. */
export type InkVisibility = "fine" | "tooLight" | "tooDark";

const PAPER = hex("#FFFFFF");

/**
 * Pen and pencil need at least 2:1 contrast with the paper to be readable at all. The
 * highlighter is drawn at 35% opacity over writing: a near-white one barely shows, and a
 * near-black one hides the writing underneath.
 */
export function inkVisibility(kind: "ink" | "highlighter", color: HexColor): InkVisibility {
  if (kind === "ink") return contrastRatio(color, PAPER) < 2 ? "tooLight" : "fine";
  const luminance = relativeLuminance(color);
  if (luminance > 0.9) return "tooLight";
  if (luminance < 0.05) return "tooDark";
  return "fine";
}

/**
 * A plain-English name for a colour, for VoiceOver ("Blue pen") and the colour popover. Custom
 * colours have no stored name, so every colour is named from its hue, saturation and lightness.
 */
export function colorName(color: HexColor): string {
  const [red, green, blue] = channels(color);
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
