import type { CanvasTool } from "@nibnote/shared";
import { View } from "react-native";
import { StrokePreview } from "../../../modules/pencil-canvas";

export const PREVIEW_WIDTH = 288;
const PREVIEW_HEIGHT = 72;

/** A strip of paper with one sample stroke in the real ink. The paper is white in both themes. */
export function InkPreview({ tool }: { readonly tool: CanvasTool }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Preview of the stroke"
      style={{
        width: PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT,
        borderRadius: 12,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "rgba(128, 128, 128, 0.35)",
      }}
    >
      <StrokePreview tool={tool} style={{ flex: 1 }} />
    </View>
  );
}
