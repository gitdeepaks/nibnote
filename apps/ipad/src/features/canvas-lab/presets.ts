import {
  FileUri,
  HexColor,
  PAGE_SIZES,
  PageId,
  type CanvasTool,
  type PageSize,
  type PageTemplate,
} from "@nibnote/shared";
import { Paths } from "expo-file-system";

// Dev-only fixtures for the Phase 1 Canvas Lab. Removed when the Phase 2 editor lands.

export type LabPageKey = keyof typeof PAGE_SIZES;

export type LabPage = {
  readonly key: LabPageKey;
  readonly label: string;
  readonly pageId: PageId;
  readonly size: PageSize;
};

export const LAB_PAGES: readonly LabPage[] = [
  {
    key: "a4Portrait",
    label: "A4",
    pageId: PageId.parse("6f1c2a52-3a1e-4d7e-9b53-0c2f4c1e8a01"),
    size: PAGE_SIZES.a4Portrait,
  },
  {
    key: "a4Landscape",
    label: "A4 ↔",
    pageId: PageId.parse("6f1c2a52-3a1e-4d7e-9b53-0c2f4c1e8a02"),
    size: PAGE_SIZES.a4Landscape,
  },
  {
    key: "letter",
    label: "Letter",
    pageId: PageId.parse("6f1c2a52-3a1e-4d7e-9b53-0c2f4c1e8a03"),
    size: PAGE_SIZES.letter,
  },
  {
    key: "whiteboard",
    label: "Whiteboard",
    pageId: PageId.parse("6f1c2a52-3a1e-4d7e-9b53-0c2f4c1e8a04"),
    size: PAGE_SIZES.whiteboard,
  },
];

export function drawingUriFor(page: LabPage): FileUri {
  const base = Paths.document.uri;
  const directory = base.endsWith("/") ? base : `${base}/`;
  return FileUri.parse(`${directory}canvas-lab/${page.key}.drawing`);
}

export const DEFAULT_TEMPLATE: PageTemplate = { kind: "lined", spacingPt: 24 };

export const LAB_TEMPLATES: readonly {
  readonly label: string;
  readonly template: PageTemplate;
}[] = [
  { label: "Blank", template: { kind: "blank" } },
  { label: "Lined", template: DEFAULT_TEMPLATE },
  { label: "Grid", template: { kind: "grid", spacingPt: 20 } },
  { label: "Dotted", template: { kind: "dotted", spacingPt: 16 } },
  { label: "Cornell", template: { kind: "cornell" } },
];

export const LAB_COLORS: readonly {
  readonly label: string;
  readonly hex: HexColor;
}[] = [
  { label: "Black", hex: HexColor.parse("#1C1C1E") },
  { label: "Blue", hex: HexColor.parse("#0A60FF") },
  { label: "Red", hex: HexColor.parse("#E5383B") },
  { label: "Yellow", hex: HexColor.parse("#FFD60A") },
];

export type LabToolKey =
  | "pen"
  | "fountainPen"
  | "pencil"
  | "marker"
  | "monoline"
  | "highlighter"
  | "strokeEraser"
  | "pixelEraser"
  | "lasso";

export const LAB_TOOL_LABELS: Readonly<Record<LabToolKey, string>> = {
  pen: "Pen",
  fountainPen: "Fountain",
  pencil: "Pencil",
  marker: "Marker",
  monoline: "Monoline",
  highlighter: "Highlighter",
  strokeEraser: "Eraser · stroke",
  pixelEraser: "Eraser · pixel",
  lasso: "Lasso",
};

export const LAB_WIDTHS = [
  { label: "S", scale: 0.5 },
  { label: "M", scale: 1 },
  { label: "L", scale: 2 },
] as const;

export function toolFor(
  key: LabToolKey,
  color: HexColor,
  widthScale: number,
): CanvasTool {
  switch (key) {
    case "pen":
    case "fountainPen":
    case "pencil":
    case "marker":
    case "monoline":
      return { kind: "ink", ink: key, colorHex: color, width: 3 * widthScale };
    case "highlighter":
      return { kind: "highlighter", colorHex: color, width: 18 * widthScale };
    case "strokeEraser":
      return { kind: "eraser", mode: "stroke", width: 20 * widthScale };
    case "pixelEraser":
      return { kind: "eraser", mode: "pixel", width: 20 * widthScale };
    case "lasso":
      return { kind: "lasso" };
  }
}
