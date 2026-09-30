import type { CanvasTool } from "@nibnote/shared";
import { requireNativeView } from "expo";
import type { StyleProp, ViewStyle } from "react-native";

type StrokePreviewProps = {
  /** The tool to preview; the eraser and lasso show nothing. */
  readonly tool: CanvasTool;
  readonly style?: StyleProp<ViewStyle>;
};

const NativeStrokePreview = requireNativeView<StrokePreviewProps>("PencilCanvas", "StrokePreviewView");

/**
 * One sample stroke in the tool's real PencilKit ink, rendered natively. Transparent, so the caller
 * draws the paper behind it; no bytes cross the bridge, only the tool.
 */
export function StrokePreview({ tool, style }: StrokePreviewProps) {
  return <NativeStrokePreview tool={tool} style={style} />;
}
