import {
  CanvasErrorEvent,
  DrawingChangedEvent,
  PencilActionEvent,
  SaveResult,
  type CanvasTool,
  type DrawingPolicy,
  type FileUri,
  type PageId,
  type PageSize,
  type PageTemplate,
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
  readonly debugFillStrokes: (count: number) => Promise<void>;
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
  readonly debugSystemToolPicker: boolean;
  readonly onDrawingChanged: (event: NativeEvent) => void;
  readonly onPencilAction: (event: NativeEvent) => void;
  readonly onCanvasError: (event: NativeEvent) => void;
};

const NativePencilCanvas = requireNativeView<NativeCanvasProps>("PencilCanvas");

export type PencilCanvasRef = {
  readonly undo: () => Promise<void>;
  readonly redo: () => Promise<void>;
  readonly save: () => Promise<SaveResult>;
  /** Canvas Lab only: fills the page with synthetic strokes. A no-op in release builds. */
  readonly debugFillStrokes: (count: number) => Promise<void>;
};

export type PencilCanvasProps = {
  readonly pageId: PageId;
  readonly drawingFileUri: FileUri;
  readonly pageSize: PageSize;
  readonly template: PageTemplate;
  readonly tool: CanvasTool;
  readonly drawingPolicy: DrawingPolicy;
  readonly onDrawingChanged: (event: DrawingChangedEvent) => void;
  readonly onPencilAction: (event: PencilActionEvent) => void;
  readonly onCanvasError: (event: CanvasErrorEvent) => void;
  readonly style?: StyleProp<ViewStyle>;
  /** Debug builds only: Apple's PKToolPicker, the Phase 1 fallback from the build plan. */
  readonly debugSystemToolPicker?: boolean;
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
      console.error(
        `PencilCanvas: invalid ${name} payload`,
        result.error.issues,
      );
    }
  };
}

export function PencilCanvas({
  ref,
  onDrawingChanged,
  onPencilAction,
  onCanvasError,
  debugSystemToolPicker = false,
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
      debugFillStrokes: (count) => native().debugFillStrokes(count),
    };
  }, []);

  return (
    <NativePencilCanvas
      {...props}
      ref={nativeRef}
      debugSystemToolPicker={debugSystemToolPicker}
      onDrawingChanged={forward(
        "onDrawingChanged",
        DrawingChangedEvent,
        onDrawingChanged,
      )}
      onPencilAction={forward(
        "onPencilAction",
        PencilActionEvent,
        onPencilAction,
      )}
      onCanvasError={forward("onCanvasError", CanvasErrorEvent, onCanvasError)}
    />
  );
}
