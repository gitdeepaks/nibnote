import { colorSlotOf, popoverSideAt, type AreaSize, type CanvasPoint } from "@nibnote/shared";
import { View } from "react-native";
import { AnchoredPopover } from "../toolbar/AnchoredPopover";
import { EraserOptions } from "../toolbar/EraserOptions";
import { useToolbox } from "../toolbar/ToolboxProvider";
import { ToolOptions } from "../toolbar/ToolOptions";

type TipOptionsProps = {
  /** Where the Pencil is, in the page area; null uses the area's centre. */
  readonly point: CanvasPoint | null;
  readonly area: AreaSize;
  readonly onClose: () => void;
};

/**
 * The active tool's options (the same popover as the toolbar's) opened at the Pencil, for the
 * "Show ink attributes" setting and the palette's options item. The popover points at an invisible
 * anchor at the tip and opens away from the nearer edge. The lasso has no options.
 */
export function TipOptions({ point, area, onClose }: TipOptionsProps) {
  const active = useToolbox((state) => state.toolbox.active);
  const colorSlot = colorSlotOf(active);
  const content =
    colorSlot !== null ? (
      <ToolOptions key={colorSlot} slot={colorSlot} />
    ) : active === "eraser" ? (
      <EraserOptions />
    ) : null;
  if (content === null) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: point?.x ?? area.width / 2, top: point?.y ?? area.height / 2 }}
    >
      <AnchoredPopover
        open
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        side={popoverSideAt(point, area)}
        anchor={<View accessible={false} style={{ width: 2, height: 2 }} />}
        content={content}
      />
    </View>
  );
}
