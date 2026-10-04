import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../../theme/colors";

type SelectionPillProps = {
  readonly onPress: () => void;
};

/**
 * Shown while the lasso holds a selection: copies it to another page. PencilKit's own edit menu
 * (Cut, Copy, Delete, Duplicate) can't carry our items, so this one sits at the top of the page.
 */
export function SelectionPill({ onPress }: SelectionPillProps) {
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true }).start();
  }, [opacity]);

  return (
    <Animated.View style={{ opacity }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Duplicate selection to another page"
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          minHeight: 36,
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: 18,
          borderCurve: "continuous",
          backgroundColor: colors.secondaryBackground,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.separator,
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
        }}
      >
        <SymbolView name="doc.on.doc" size={15} weight="semibold" tintColor={colors.tint} />
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.tint }}>Duplicate to page…</Text>
      </Pressable>
    </Animated.View>
  );
}
