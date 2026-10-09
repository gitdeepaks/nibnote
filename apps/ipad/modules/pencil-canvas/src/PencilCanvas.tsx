import {
  CanvasErrorEvent,
  DrawingChangedEvent,
  HistoryGestureEvent,
  PageSwipeEvent,
  ToolFeedbackEvent,
  ToolUsageEvent,
  PencilActionEvent,
  SaveResult,
  SelectionChangedEvent,
  SelectionCopyResult,
  type SelectionTarget,
  SelectionUndoResult,
  type CanvasTool,
  type DrawingPolicy,
  type FileUri,
  type PageId,
  type PageSize,
  type PageTemplate,
  type ShapeStyle,
} from "@nibnote/shared";
import { requireNativeView } from "expo";
import { useImperativeHandle, useRef, type Ref } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { z } from "zod";

// Native events arrive untyped; every payload is parsed with its shared Zod schema before use.
type NativeEvent = { readonly nativeEvent: object };

type NativeCanvasMethods = {
  readonly undo: () => Promise<void>;
  readonly redo: () => Promise<void>;
  readonly save: () => Promise<object>;
  readonly copySelection: (target: SelectionTarget) => Promise<object>;
  readonly undoSelectionCopy: () => Promise<object>;
  readonly debugFillStrokes: (count: number, mixed: boolean) => Promise<void>;
  readonly debugPencilAction: (kind: "tap" | "squeeze") => Promise<void>;
};

type NativeCanvasProps = {
  readonly ref?: Ref<NativeCanvasMethods>;
  readonly style?: StyleProp<ViewStyle>;
  readonly pageId: string;
  readonly drawingFileUri: string;
  readonly pageSize: PageSize;
  readonly template: PageTemplate;
  readonly tool: CanvasTool;
  readonly drawingPolicy: DrawingPolicy;
  readonly shapeSnapping: boolean;
  readonly shapeStyle: ShapeStyle;
  readonly debugSystemToolPicker: boolean;
  readonly onDrawingChanged: (event: NativeEvent) => void;
  readonly onPencilAction: (event: NativeEvent) => void;
  readonly onCanvasError: (event: NativeEvent) => void;
  readonly onPageSwipe: (event: NativeEvent) => void;
  readonly onToolUsage: (event: NativeEvent) => void;
  readonly onHistoryGesture: (event: NativeEvent) => void;
  readonly onToolFeedback: (event: NativeEvent) => void;
  readonly onSelectionChanged: (event: NativeEvent) => void;
};

const NativePencilCanvas = requireNativeView<NativeCanvasProps>("PencilCanvas", "PencilCanvasView");

export type PencilCanvasRef = {
  readonly undo: () => Promise<void>;
  readonly redo: () => Promise<void>;
  readonly save: () => Promise<SaveResult>;
  /**
   * Copies the lasso's selection onto another page of the notebook, in the same place, and leaves
   * this page as it is. Resolves with zero strokes when nothing is selected.
   */
  readonly copySelection: (target: SelectionTarget) => Promise<SelectionCopyResult>;
  /**
   * Takes the last copy back off its page. False when there is nothing to undo, the page on screen
   * has changed since, or the other page was edited meanwhile.
   */
  readonly undoSelectionCopy: () => Promise<boolean>;
  /** Development only: fills the page with synthetic strokes (`mixed`: half are highlighters). */
  readonly debugFillStrokes: (count: number, mixed: boolean) => Promise<void>;
  /** Development only: sends a Pencil action as if the Pencil did it (`squeeze` opens the palette). */
  readonly debugPencilAction: (kind: "tap" | "squeeze") => Promise<void>;
};

export type PencilCanvasProps = {
  readonly pageId: PageId;
  readonly drawingFileUri: FileUri;
  readonly pageSize: PageSize;
  readonly template: PageTemplate;
  readonly tool: CanvasTool;
  readonly drawingPolicy: DrawingPolicy;
  /**
   * Whether a pen, pencil or highlighter stroke that ends with the Pencil held still becomes a
   * clean line, oval, rectangle or triangle. One undo brings the hand-drawn stroke back.
   */
  readonly shapeSnapping: boolean;
  /** How shapes snapped from now on are drawn. */
  readonly shapeStyle: ShapeStyle;
  readonly onDrawingChanged: (event: DrawingChangedEvent) => void;
  readonly onPencilAction: (event: PencilActionEvent) => void;
  readonly onCanvasError: (event: CanvasErrorEvent) => void;
  readonly onPageSwipe: (event: PageSwipeEvent) => void;
  /** A stroke, erase or lasso started or ended; scrolling and zooming don't count. */
  readonly onToolUsage: (event: ToolUsageEvent) => void;
  /** Two fingers tapped (undo) or three (redo); the native side has already done it. */
  readonly onHistoryGesture: (event: HistoryGestureEvent) => void;
  /** Development builds only: the Pencil Pro haptic played (the native side decides and plays it). */
  readonly onToolFeedback: (event: ToolFeedbackEvent) => void;
  /** The lasso gained or lost a selection. */
  readonly onSelectionChanged: (event: SelectionChangedEvent) => void;
  readonly style?: StyleProp<ViewStyle>;
  /** Debug builds only: Apple's PKToolPicker, the Phase 1 fallback from the build plan. */
  readonly debugSystemToolPicker: boolean;
  readonly ref?: Ref<PencilCanvasRef>;
};

/** Parses a native payload and forwards it; a payload that drifts from the contract is dropped and logged. */
function forward<Schema extends z.ZodType>(
  name: string,
  schema: Schema,
  handler: (value: z.output<Schema>) => void,
): (event: NativeEvent) => void {
  return (event) => {
    const result = schema.safeParse(event.nativeEvent);
    if (result.success) {
      handler(result.data);
    } else {
      console.error(`PencilCanvas: invalid ${name} payload`, result.error.issues);
    }
  };
}

export function PencilCanvas({
  ref,
  onDrawingChanged,
  onPencilAction,
  onCanvasError,
  onPageSwipe,
  onToolUsage,
  onHistoryGesture,
  onToolFeedback,
  onSelectionChanged,
  debugSystemToolPicker,
  ...props
}: PencilCanvasProps) {
  const nativeRef = useRef<NativeCanvasMethods>(null);

  useImperativeHandle(ref, () => {
    const native = (): NativeCanvasMethods => {
      const current = nativeRef.current;
      if (current === null) {
        throw new Error("PencilCanvas is not mounted");
      }
      return current;
    };
    return {
      undo: () => native().undo(),
      redo: () => native().redo(),
      save: async () => SaveResult.parse(await native().save()),
      copySelection: async (target) => SelectionCopyResult.parse(await native().copySelection(target)),
      undoSelectionCopy: async () => SelectionUndoResult.parse(await native().undoSelectionCopy()).undone,
      debugFillStrokes: (count, mixed) => native().debugFillStrokes(count, mixed),
      debugPencilAction: (kind) => native().debugPencilAction(kind),
    };
  }, []);

  return (
    <NativePencilCanvas
      {...props}
      ref={nativeRef}
      debugSystemToolPicker={debugSystemToolPicker}
      onDrawingChanged={forward("onDrawingChanged", DrawingChangedEvent, onDrawingChanged)}
      onPencilAction={forward("onPencilAction", PencilActionEvent, onPencilAction)}
      onCanvasError={forward("onCanvasError", CanvasErrorEvent, onCanvasError)}
      onPageSwipe={forward("onPageSwipe", PageSwipeEvent, onPageSwipe)}
      onToolUsage={forward("onToolUsage", ToolUsageEvent, onToolUsage)}
      onHistoryGesture={forward("onHistoryGesture", HistoryGestureEvent, onHistoryGesture)}
      onToolFeedback={forward("onToolFeedback", ToolFeedbackEvent, onToolFeedback)}
      onSelectionChanged={forward("onSelectionChanged", SelectionChangedEvent, onSelectionChanged)}
    />
  );
}
