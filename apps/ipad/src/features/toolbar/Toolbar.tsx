import { colorName, colorSlotOf, colorTarget, type ColorSlot, type HexColor, type ToolSlot } from "@nibnote/shared";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";
import { useToolbox } from "./ToolboxProvider";

// The floating toolbar: the five tools, the pinned colours of the current colour tool, undo and
// redo, and the Pencil-only switch. It floats over the page at the bottom; docking comes in M2a.

const BUTTON = 44;

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

type ToolbarProps = {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
};

export function Toolbar({ canUndo, canRedo, onUndo, onRedo }: ToolbarProps) {
  const insets = useSafeAreaInsets();
  const toolbox = useToolbox((state) => state.toolbox);
  const selectSlot = useToolbox((state) => state.selectSlot);
  const chooseColor = useToolbox((state) => state.chooseColor);
  const toggleDrawingPolicy = useToolbox((state) => state.toggleDrawingPolicy);
  const policy = toolbox.drawingPolicy;
  const target = colorTarget(toolbox);
  const targetSettings = toolbox.slots[target];

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
          return (
            <ToolbarButton
              key={item.slot}
              icon={item.icon}
              label={item.label}
              hint={null}
              selected={toolbox.active === item.slot}
              disabled={false}
              dot={colorSlot === null ? null : toolbox.slots[colorSlot].color}
              onPress={() => {
                selectSlot(item.slot);
              }}
            />
          );
        })}
        <Divider />
        {targetSettings.pinnedColors.map((color, index) => (
          <ColorButton
            // Pinned colours can repeat, so the position is the stable key.
            key={index}
            color={color}
            label={`${colorName(color)} ${COLOR_TOOL_NAMES[target]}`}
            selected={toolbox.active === target && targetSettings.color === color}
            onPress={() => {
              chooseColor(target, color);
            }}
          />
        ))}
        <Divider />
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
        <Divider />
        <ToolbarButton
          icon={policy === "pencilOnly" ? "applepencil" : "hand.draw"}
          label={policy === "pencilOnly" ? "Drawing with Apple Pencil only" : "Drawing with any input"}
          hint={policy === "pencilOnly" ? "Lets your finger draw too" : "Makes only Apple Pencil draw"}
          selected={false}
          disabled={false}
          dot={null}
          onPress={toggleDrawingPolicy}
        />
      </View>
    </View>
  );
}

type ToolbarButtonProps = {
  readonly icon: SFSymbol;
  readonly label: string;
  readonly hint: string | null;
  readonly selected: boolean;
  readonly disabled: boolean;
  /** The colour the tool draws with, shown as a dot under its icon. */
  readonly dot: HexColor | null;
  readonly onPress: () => void;
};

function ToolbarButton({ icon, label, hint, selected, disabled, dot, onPress }: ToolbarButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(hint === null ? {} : { accessibilityHint: hint })}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: BUTTON,
        height: BUTTON,
        borderRadius: BUTTON / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected ? colors.tint : "transparent",
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <SymbolView name={icon} size={22} tintColor={selected ? "#FFFFFF" : colors.label} />
      {dot !== null && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 4,
            width: 7,
            height: 7,
            borderRadius: 3.5,
            backgroundColor: dot,
            // A ring, so the dot shows on the selected tint and dark ink shows on the dark toolbar.
            borderWidth: 1,
            borderColor: selected ? "#FFFFFF" : colors.tertiaryLabel,
          }}
        />
      )}
    </Pressable>
  );
}

type ColorButtonProps = {
  readonly color: HexColor;
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
};

function ColorButton({ color, label, selected, onPress }: ColorButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ width: BUTTON, height: BUTTON, alignItems: "center", justifyContent: "center" }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: color,
          // A visible ring, so black ink still shows on the dark toolbar.
          borderWidth: selected ? 3 : 1.5,
          borderColor: selected ? colors.tint : colors.tertiaryLabel,
        }}
      />
    </Pressable>
  );
}

function Divider() {
  return (
    <View
      style={{ width: StyleSheet.hairlineWidth, height: 28, marginHorizontal: 4, backgroundColor: colors.separator }}
    />
  );
}
