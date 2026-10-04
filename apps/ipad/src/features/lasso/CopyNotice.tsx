import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";

/** What "Duplicate to page" just did. `id` changes with every notice, so the same text shows again. */
export type CopyNoticeState = {
  readonly id: number;
  readonly text: string;
  /** Whether the copy can still be taken back. */
  readonly canUndo: boolean;
};

type CopyNoticeProps = {
  readonly notice: CopyNoticeState;
  readonly onUndo: () => void;
  /** The notice has faded out. */
  readonly onDone: () => void;
};

/** A notice with Undo stays long enough to read and reach; a plain one leaves sooner. */
const UNDO_MS = 5000;
const PLAIN_MS = 2200;
const FADE_MS = 180;

/** Tells the user the selection reached the other page, with Undo while that is still safe. */
export function CopyNotice({ notice, onUndo, onDone }: CopyNoticeProps) {
  const [opacity] = useState(() => new Animated.Value(0));
  // The editor passes a new `onDone` on every render; the timer below must not restart for that.
  const done = useRef(onDone);
  useLayoutEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(notice.text);
    const animation = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }),
      Animated.delay(notice.canUndo ? UNDO_MS : PLAIN_MS),
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => {
      if (finished) done.current();
    });
    return () => {
      animation.stop();
    };
  }, [notice.id, notice.text, notice.canUndo, opacity]);

  return (
    <Animated.View
      style={{
        opacity,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
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
      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.label }}>{notice.text}</Text>
      {notice.canUndo && (
        <View style={{ width: StyleSheet.hairlineWidth, height: 18, backgroundColor: colors.separator }} />
      )}
      {notice.canUndo && (
        <Pressable accessibilityRole="button" accessibilityLabel="Undo" hitSlop={10} onPress={onUndo}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.tint }}>Undo</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}
