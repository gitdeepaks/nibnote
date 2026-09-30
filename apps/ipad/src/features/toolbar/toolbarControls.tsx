import type { HexColor } from "@nibnote/shared";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Pressable, StyleSheet, View } from "react-native";
import { colors } from "../../theme/colors";

// The toolbar's building blocks, shared by the toolbar and its popovers.

export const BUTTON = 44;

/** A neutral edge that shows on the light and the dark toolbar, so black and white swatches stay visible. */
const SWATCH_EDGE = "rgba(128, 128, 128, 0.6)";

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

export function ToolbarButton({ icon, label, hint, selected, disabled, dot, onPress }: ToolbarButtonProps) {
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
            borderColor: selected ? "#FFFFFF" : SWATCH_EDGE,
          }}
        />
      )}
    </Pressable>
  );
}

type SwatchButtonProps = {
  readonly color: HexColor;
  readonly label: string;
  readonly hint: string | null;
  readonly selected: boolean;
  /** Diameter of the colour itself; the tap target is always at least 44 pt. */
  readonly size: number;
  readonly onPress: () => void;
  readonly onLongPress: (() => void) | null;
};

/**
 * A colour to tap. The colour keeps a thin neutral edge, and the selected one gets a tinted ring
 * with a gap, so a black swatch on the dark toolbar is still visibly selected.
 */
export function SwatchButton({ color, label, hint, selected, size, onPress, onLongPress }: SwatchButtonProps) {
  const ring = size + 10;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(hint === null ? {} : { accessibilityHint: hint })}
      accessibilityState={{ selected }}
      onPress={onPress}
      {...(onLongPress === null ? {} : { onLongPress, delayLongPress: 350 })}
      style={{
        width: Math.max(BUTTON, ring),
        height: Math.max(BUTTON, ring),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: selected ? 2.5 : 0,
          borderColor: colors.tint,
        }}
      >
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: SWATCH_EDGE,
          }}
        />
      </View>
    </Pressable>
  );
}

export function ToolbarDivider() {
  return (
    <View
      style={{ width: StyleSheet.hairlineWidth, height: 28, marginHorizontal: 4, backgroundColor: colors.separator }}
    />
  );
}
