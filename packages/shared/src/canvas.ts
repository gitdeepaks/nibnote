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

// Stroke and eraser widths in points; the native side clamps to what each PencilKit tool supports
export const StrokeWidth = z.number().positive().max(100);

export const InkType = z.enum(["pen", "fountainPen", "pencil", "marker", "monoline"]);
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
      /** Erase only highlighter strokes (Nibnote's own eraser; PencilKit's can't tell inks apart). */
      highlighterOnly: z.boolean(),
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

/** How a snapped shape is drawn: exact, or with a slight wobble as if by a steady hand. */
export const ShapeStyle = z.enum(["clean", "handDrawn"]);
export type ShapeStyle = z.infer<typeof ShapeStyle>;

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

// A point in the canvas view, in points from its top-left corner (the same space as the view's layout)
export const CanvasPoint = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .readonly();
export type CanvasPoint = z.infer<typeof CanvasPoint>;

export const PencilActionEvent = z
  .object({
    pageId: PageId,
    kind: z.enum(["tap", "squeeze"]),
    preferredAction: PencilPreferredAction,
    // Where the Pencil is: its hover position, else where it last touched the page if that is still
    // on screen; null when neither is known
    location: CanvasPoint.nullable(),
  })
  .readonly();
export type PencilActionEvent = z.infer<typeof PencilActionEvent>;

// A tool started or stopped touching the page (a stroke, an erase, a lasso), never a scroll or zoom
export const ToolUsageEvent = z
  .object({
    pageId: PageId,
    active: z.boolean(),
  })
  .readonly();
export type ToolUsageEvent = z.infer<typeof ToolUsageEvent>;

export const HistoryAction = z.enum(["undo", "redo"]);
export type HistoryAction = z.infer<typeof HistoryAction>;

// A two-finger (undo) or three-finger (redo) tap on the page; `applied` is false when there was nothing to do
export const HistoryGestureEvent = z
  .object({
    pageId: PageId,
    action: HistoryAction,
    applied: z.boolean(),
  })
  .readonly();
export type HistoryGestureEvent = z.infer<typeof HistoryGestureEvent>;

// Development builds only: the Apple Pencil Pro haptic played after a tool change made with the
// Pencil ("touch": a Pencil tap outside the page; "tap" or "squeeze": the Pencil's own gestures)
export const ToolFeedbackEvent = z
  .object({
    pageId: PageId,
    source: z.enum(["touch", "tap", "squeeze"]),
  })
  .readonly();
export type ToolFeedbackEvent = z.infer<typeof ToolFeedbackEvent>;

// The lasso gained or lost a selection (PencilKit has no API for it; the canvas works it out)
export const SelectionChangedEvent = z
  .object({
    pageId: PageId,
    hasSelection: z.boolean(),
  })
  .readonly();
export type SelectionChangedEvent = z.infer<typeof SelectionChangedEvent>;

// What copying the lasso's selection to another page did; zero strokes means nothing was selected
export const SelectionCopyResult = z
  .object({
    strokeCount: z.number().int().nonnegative(),
  })
  .readonly();
export type SelectionCopyResult = z.infer<typeof SelectionCopyResult>;

// Whether the last copy was taken back off its page (false: nothing to undo, or that page has changed)
export const SelectionUndoResult = z.object({ undone: z.boolean() }).readonly();
export type SelectionUndoResult = z.infer<typeof SelectionUndoResult>;

// The page a selection is copied to: where its drawing lives and what its thumbnail needs
export type SelectionTarget = {
  readonly pageId: PageId;
  readonly drawingFileUri: FileUri;
  readonly pageSize: PageSize;
  readonly template: PageTemplate;
};

// A one-finger swipe on the page: left turns to the next page, right to the previous one
export const PageSwipeEvent = z
  .object({
    pageId: PageId,
    direction: z.enum(["next", "previous"]),
  })
  .readonly();
export type PageSwipeEvent = z.infer<typeof PageSwipeEvent>;

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

// Lowercase hex SHA-256 of a drawing file, as written by the native store
export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const SaveResult = z
  .object({
    fileUri: FileUri,
    sha256: Sha256,
    thumbnailUri: FileUri,
    strokeCount: z.number().int().nonnegative(),
  })
  .readonly();
export type SaveResult = z.infer<typeof SaveResult>;

// Module-level events: sent after every save and thumbnail render, even while the view unmounts
export const DrawingSavedEvent = z
  .object({
    pageId: PageId,
    sha256: Sha256,
    strokeCount: z.number().int().nonnegative(),
  })
  .readonly();
export type DrawingSavedEvent = z.infer<typeof DrawingSavedEvent>;

export const ThumbnailWrittenEvent = z.object({ pageId: PageId }).readonly();
export type ThumbnailWrittenEvent = z.infer<typeof ThumbnailWrittenEvent>;
