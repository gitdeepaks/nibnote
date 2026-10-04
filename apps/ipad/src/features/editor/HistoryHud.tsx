import type { HistoryAction, ToolbarDock } from "@nibnote/shared";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Text } from "react-native";
import { colors } from "../../theme/colors";

/** One finger-tap undo or redo; `id` changes with every tap, so repeated taps show again. */
export type HistoryNotice = {
  readonly id: number;
  readonly action: HistoryAction;
  readonly applied: boolean;
};

type HistoryHudProps = {
  readonly notice: HistoryNotice;
  /** The toolbar's edge: the notice sits at the top unless the toolbar is there. */
  readonly dock: ToolbarDock;
  /** Something else (the lasso's pill or its notice) has the top of the page: sit below it. */
  readonly lowered: boolean;
};

const FADE_IN_MS = 120;
const HOLD_MS = 650;
const FADE_OUT_MS = 200;
const EDGE = 12;
/** Room for the lasso's pill above the notice. */
const LOWERED = 56;

function messageFor(notice: HistoryNotice): string {
  if (notice.applied) return notice.action === "undo" ? "Undo" : "Redo";
  return notice.action === "undo" ? "Nothing to undo" : "Nothing to redo";
}

/**
 * A short confirmation for the two- and three-finger taps, which give no other sign when there is
 * nothing to undo. It never takes touches, fades only (fine with Reduce Motion), and VoiceOver
 * hears it as an announcement instead of finding it on screen.
 */
export function HistoryHud({ notice, dock, lowered }: HistoryHudProps) {
  const [opacity] = useState(() => new Animated.Value(0));
  const message = messageFor(notice);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
    const easing = Easing.out(Easing.poly(3));
    const animation = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, easing, useNativeDriver: true }),
      Animated.delay(HOLD_MS),
      Animated.timing(opacity, { toValue: 0, duration: FADE_OUT_MS, easing, useNativeDriver: true }),
    ]);
    animation.start();
    return () => {
      animation.stop();
    };
  }, [notice.id, message, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: "absolute",
        alignSelf: "center",
        ...(dock === "top" ? { bottom: EDGE * 2 } : { top: lowered ? LOWERED : EDGE }),
        opacity,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 18,
        borderCurve: "continuous",
        backgroundColor: colors.secondaryBackground,
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
      }}
    >
      <SymbolView
        name={notice.action === "undo" ? "arrow.uturn.backward" : "arrow.uturn.forward"}
        size={15}
        weight="semibold"
        tintColor={notice.applied ? colors.label : colors.secondaryLabel}
      />
      <Text style={{ fontSize: 15, fontWeight: "600", color: notice.applied ? colors.label : colors.secondaryLabel }}>
        {message}
      </Text>
    </Animated.View>
  );
}
