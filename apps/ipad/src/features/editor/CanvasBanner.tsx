import { SymbolView } from "expo-symbols";
import { Pressable, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import type { CanvasMessage } from "./canvasMessages";

type CanvasBannerProps = {
  readonly message: CanvasMessage;
  readonly onDismiss: () => void;
};

/** A dismissible notice above the page for load and save problems. */
export function CanvasBanner({ message, onDismiss }: CanvasBannerProps) {
  const tint = message.tone === "error" ? colors.destructive : colors.favourite;
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginHorizontal: 16,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderCurve: "continuous",
        backgroundColor: colors.secondaryBackground,
      }}
    >
      <SymbolView name="exclamationmark.triangle.fill" size={18} tintColor={tint} />
      <Text selectable style={{ flex: 1, fontSize: 15, color: colors.label }}>
        {message.text}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10} onPress={onDismiss}>
        <SymbolView name="xmark" size={14} tintColor={colors.secondaryLabel} />
      </Pressable>
    </View>
  );
}
