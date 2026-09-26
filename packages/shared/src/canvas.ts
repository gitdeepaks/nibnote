import { z } from "zod";
import { PageId } from "./ids";

// Colours cross the bridge as #RRGGBB or #RRGGBBAA strings
export const HexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/)
  .brand<"HexColor">();
export type HexColor = z.infer<typeof HexColor>;

// Drawing files are only ever addressed by local file URLs; bytes never cross the bridge
export const FileUri = z
  .string()
  .regex(/^file:\/\/\/.+/)
  .brand<"FileUri">();
export type FileUri = z.infer<typeof FileUri>;

const StrokeWidth = z.number().positive().max(100);

export const InkType = z.enum([
  "pen",
  "fountainPen",
  "pencil",
  "marker",
  "monoline",
]);
export type InkType = z.infer<typeof InkType>;

export const CanvasTool = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("ink"),
      ink: InkType,
      colorHex: HexColor,
      width: StrokeWidth,
    })
    .readonly(),
  z
    .object({
      kind: z.literal("highlighter"),
      colorHex: HexColor,
      width: StrokeWidth,
    })
    .readonly(),
  z
    .object({
      kind: z.literal("eraser"),
      mode: z.enum(["stroke", "pixel"]),
      width: StrokeWidth,
    })
    .readonly(),
  z.object({ kind: z.literal("lasso") }).readonly(),
]);
export type CanvasTool = z.infer<typeof CanvasTool>;

export const PageTemplate = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("blank") }).readonly(),
  z
    .object({
      kind: z.enum(["lined", "grid", "dotted"]),
      spacingPt: z.number().min(4).max(200),
    })
    .readonly(),
  z.object({ kind: z.literal("cornell") }).readonly(),
]);
export type PageTemplate = z.infer<typeof PageTemplate>;

export const PageSize = z
  .object({
    widthPt: z.number().positive().max(10_000),
    heightPt: z.number().positive().max(10_000),
  })
  .readonly();
export type PageSize = z.infer<typeof PageSize>;

// Fixed page sizes from the build plan, in points (1/72 inch)
export const PAGE_SIZES = {
  a4Portrait: { widthPt: 595, heightPt: 842 },
  a4Landscape: { widthPt: 842, heightPt: 595 },
  letter: { widthPt: 612, heightPt: 792 },
  whiteboard: { widthPt: 2526, heightPt: 1785 },
} as const satisfies Record<string, PageSize>;

export const DrawingPolicy = z.enum(["pencilOnly", "anyInput"]);
export type DrawingPolicy = z.infer<typeof DrawingPolicy>;

export const DrawingChangedEvent = z
  .object({
    pageId: PageId,
    strokeCount: z.number().int().nonnegative(),
    canUndo: z.boolean(),
    canRedo: z.boolean(),
    hasUnsavedChanges: z.boolean(),
  })
  .readonly();
export type DrawingChangedEvent = z.infer<typeof DrawingChangedEvent>;

export const PencilPreferredAction = z.enum([
  "ignore",
  "switchEraser",
  "switchPrevious",
  "showColorPalette",
  "showInkAttributes",
  "showContextualPalette",
  "runSystemShortcut",
]);
export type PencilPreferredAction = z.infer<typeof PencilPreferredAction>;

export const PencilActionEvent = z
  .object({
    pageId: PageId,
    kind: z.enum(["tap", "squeeze"]),
    preferredAction: PencilPreferredAction,
  })
  .readonly();
export type PencilActionEvent = z.infer<typeof PencilActionEvent>;

export const CanvasErrorCode = z.enum([
  "fileCorrupt",
  "readFailed",
  "saveFailed",
  "recoveredFromBackup",
  "invalidTool",
  "invalidTemplate",
]);
export type CanvasErrorCode = z.infer<typeof CanvasErrorCode>;

export const CanvasErrorEvent = z
  .object({
    pageId: PageId,
    code: CanvasErrorCode,
    message: z.string(),
  })
  .readonly();
export type CanvasErrorEvent = z.infer<typeof CanvasErrorEvent>;

export const SaveResult = z
  .object({
    fileUri: FileUri,
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    thumbnailUri: FileUri,
    strokeCount: z.number().int().nonnegative(),
  })
  .readonly();
export type SaveResult = z.infer<typeof SaveResult>;
