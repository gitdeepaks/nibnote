import {
  colorName,
  colorSlotOf,
  colorTarget,
  sameColor,
  type ColorSlot,
  type HexColor,
  type ToolSlot,
  type TrioIndex,
} from "@nibnote/shared";
import type { SFSymbol } from "expo-symbols";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";
import { AnchoredPopover } from "./AnchoredPopover";
import { ColorOptions } from "./ColorOptions";
import { BUTTON, SwatchButton, ToolbarButton, ToolbarDivider } from "./toolbarControls";
import { useToolbox } from "./ToolboxProvider";
import { ToolOptions } from "./ToolOptions";

// The floating toolbar: the five tools, the pinned colours of the current colour tool, undo and
// redo, and the Pencil-only switch. Tapping the selected tool opens its width options; tapping the
// selected colour (or long-pressing any colour) opens the colour options for that pin.

const SLOTS: readonly { readonly slot: ToolSlot; readonly label: string; readonly icon: SFSymbol }[] = [
  { slot: "pen", label: "Pen", icon: "pencil.tip" },
  { slot: "pencil", label: "Pencil", icon: "pencil" },
  { slot: "highlighter", label: "Highlighter", icon: "highlighter" },
  { slot: "eraser", label: "Eraser", icon: "eraser" },
  { slot: "lasso", label: "Lasso", icon: "lasso" },
];

/** For colour labels: "Blue pen", "Yellow highlighter". */
const COLOR_TOOL_NAMES: Readonly<Record<ColorSlot, string>> = {
  pen: "pen",
  pencil: "pencil",
  highlighter: "highlighter",
};

const PIN_INDEXES: readonly TrioIndex[] = [0, 1, 2];

/** Which popover is open; only one at a time. */
type OpenPopover =
  | { readonly kind: "tool"; readonly slot: ColorSlot }
  | { readonly kind: "color"; readonly slot: ColorSlot; readonly index: TrioIndex }
  | null;

type ToolbarProps = {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
};

export function Toolbar({ canUndo, canRedo, onUndo, onRedo }: ToolbarProps) {
  const insets = useSafeAreaInsets();
  const toolbox = useToolbox((state) => state.toolbox);
  const actions = useToolbox((state) => state.actions);
  const [open, setOpen] = useState<OpenPopover>(null);
  // The last colour from the system picker; it joins the recent colours when the popover closes.
  const systemPick = useRef<HexColor | null>(null);

  const target = colorTarget(toolbox);
  const targetSettings = toolbox.slots[target];
  const policy = toolbox.drawingPolicy;

  const close = () => {
    const picked = systemPick.current;
    systemPick.current = null;
    if (picked !== null) actions.addRecentColor(picked);
    setOpen(null);
  };

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 12, alignItems: "center" }}
    >
      <View
        accessibilityRole="toolbar"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          padding: 6,
          borderRadius: BUTTON / 2 + 6,
          borderCurve: "continuous",
          backgroundColor: colors.secondaryBackground,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.separator,
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.18)",
        }}
      >
        {SLOTS.map((item) => {
          const colorSlot = colorSlotOf(item.slot);
          const selected = toolbox.active === item.slot;
          const button = (
            <ToolbarButton
              icon={item.icon}
              label={item.label}
              hint={selected && colorSlot !== null ? "Shows width options" : null}
              selected={selected}
              disabled={false}
              dot={colorSlot === null ? null : toolbox.slots[colorSlot].color}
              onPress={() => {
                if (selected && colorSlot !== null) setOpen({ kind: "tool", slot: colorSlot });
                else actions.selectSlot(item.slot);
              }}
            />
          );
          if (colorSlot === null) return <View key={item.slot}>{button}</View>;
          return (
            <AnchoredPopover
              key={item.slot}
              open={open?.kind === "tool" && open.slot === colorSlot}
              onOpenChange={(next) => {
                if (!next) close();
              }}
              side="above"
              anchor={button}
              content={<ToolOptions slot={colorSlot} />}
            />
          );
        })}
        <ToolbarDivider />
        {PIN_INDEXES.map((index) => {
          const color = targetSettings.pinnedColors[index];
          const selected = toolbox.active === target && sameColor(targetSettings.color, color);
          const openColor = () => {
            setOpen({ kind: "color", slot: target, index });
          };
          return (
            <AnchoredPopover
              // Pinned colours can repeat, so the position is the stable key.
              key={index}
              open={open?.kind === "color" && open.slot === target && open.index === index}
              onOpenChange={(next) => {
                if (!next) close();
              }}
              side="above"
              anchor={
                <SwatchButton
                  color={color}
                  label={`${colorName(color)} ${COLOR_TOOL_NAMES[target]}`}
                  hint={selected ? "Shows colour options" : "Long press for colour options"}
                  selected={selected}
                  size={26}
                  onPress={() => {
                    if (selected) openColor();
                    else actions.chooseColor(target, color);
                  }}
                  onLongPress={openColor}
                />
              }
              content={
                <ColorOptions
                  // A fresh editor (and HEX field) for each pin.
                  key={`${target}-${String(index)}`}
                  slot={target}
                  index={index}
                  onSystemPick={(picked) => {
                    systemPick.current = picked;
                  }}
                />
              }
            />
          );
        })}
        <ToolbarDivider />
        <ToolbarButton
          icon="arrow.uturn.backward"
          label="Undo"
          hint={null}
          selected={false}
          disabled={!canUndo}
          dot={null}
          onPress={onUndo}
        />
        <ToolbarButton
          icon="arrow.uturn.forward"
          label="Redo"
          hint={null}
          selected={false}
          disabled={!canRedo}
          dot={null}
          onPress={onRedo}
        />
        <ToolbarDivider />
        <ToolbarButton
          icon={policy === "pencilOnly" ? "applepencil" : "hand.draw"}
          label={policy === "pencilOnly" ? "Drawing with Apple Pencil only" : "Drawing with any input"}
          hint={policy === "pencilOnly" ? "Lets your finger draw too" : "Makes only Apple Pencil draw"}
          selected={false}
          disabled={false}
          dot={null}
          onPress={actions.toggleDrawingPolicy}
        />
      </View>
    </View>
  );
}
