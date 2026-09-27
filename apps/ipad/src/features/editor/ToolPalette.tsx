import type { DrawingPolicy, HexColor } from "@nibnote/shared";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";
import { PEN_COLORS, TOOLS, type ToolKey } from "./tools";

// A floating palette owned by the editor, so it disappears with it. (The native bottom toolbar
// stayed on the library after going back.) Phase 3 grows this into the full, dockable toolbar.

const BUTTON = 44;

type ToolPaletteProps = {
  readonly tool: ToolKey;
  readonly penColor: HexColor;
  readonly policy: DrawingPolicy;
  readonly onSelectTool: (tool: ToolKey) => void;
  readonly onSelectPenColor: (color: HexColor) => void;
  readonly onTogglePolicy: () => void;
};

export function ToolPalette({
  tool,
  penColor,
  policy,
  onSelectTool,
  onSelectPenColor,
  onTogglePolicy,
}: ToolPaletteProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 12, alignItems: "center" }}
    >
      <View
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
        {TOOLS.map((item) => (
          <PaletteButton
            key={item.key}
            icon={item.icon}
            label={item.label}
            selected={tool === item.key}
            onPress={() => {
              onSelectTool(item.key);
            }}
          />
        ))}
        <Divider />
        {PEN_COLORS.map((color) => {
          const selected = tool === "pen" && color.hex === penColor;
          return (
            <Pressable
              key={color.hex}
              accessibilityRole="button"
              accessibilityLabel={`${color.name} pen`}
              accessibilityState={{ selected }}
              onPress={() => {
                onSelectPenColor(color.hex);
              }}
              style={{ width: BUTTON, height: BUTTON, alignItems: "center", justifyContent: "center" }}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: color.hex,
                  // A visible ring, so black ink still shows on the dark palette.
                  borderWidth: selected ? 3 : 1.5,
                  borderColor: selected ? colors.tint : colors.tertiaryLabel,
                }}
              />
            </Pressable>
          );
        })}
        <Divider />
        <PaletteButton
          icon={policy === "pencilOnly" ? "applepencil" : "hand.draw"}
          label={policy === "pencilOnly" ? "Drawing with Apple Pencil only" : "Drawing with any input"}
          selected={false}
          onPress={onTogglePolicy}
        />
      </View>
    </View>
  );
}

type PaletteButtonProps = {
  readonly icon: SFSymbol;
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
};

function PaletteButton({ icon, label, selected, onPress }: PaletteButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        width: BUTTON,
        height: BUTTON,
        borderRadius: BUTTON / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected ? colors.tint : "transparent",
      }}
    >
      <SymbolView name={icon} size={22} tintColor={selected ? "#FFFFFF" : colors.label} />
    </Pressable>
  );
}

function Divider() {
  return <View style={{ width: StyleSheet.hairlineWidth, height: 28, marginHorizontal: 4, backgroundColor: colors.separator }} />;
}
