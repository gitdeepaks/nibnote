import { isVerticalDock, nearestDock, type ToolbarDock as Dock } from "@nibnote/shared";
import { SymbolView } from "expo-symbols";
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Animated, Easing, PanResponder, View, type HostInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";
import { useReduceMotion } from "./useToolbarCollapse";

// Places the floating toolbar on its edge, lets the user drag it by its grip to another edge, and
// swaps it for the pill while writing. Animations move only transform and opacity, on the native
// driver, except the drag itself, which follows the finger from JavaScript.

/** Space kept clear at the top edge for the page counter. */
const TOP_CLEARANCE = 52;
const EDGE = 12;

const DOCK_NAMES: Readonly<Record<Dock, string>> = { bottom: "bottom", top: "top", left: "left", right: "right" };
const MOVES: readonly Dock[] = ["bottom", "top", "left", "right"];

type ToolbarDockProps = {
  readonly dock: Dock;
  readonly collapsed: boolean;
  readonly onDock: (dock: Dock) => void;
  /** Length available along the toolbar (width when horizontal, height when vertical). */
  readonly onAvailableLength: (length: number) => void;
  /** The full toolbar, given the grip to put at its start. */
  readonly renderToolbar: (grip: ReactElement) => ReactNode;
  readonly pill: ReactNode;
};

export function ToolbarDock({ dock, collapsed, onDock, onAvailableLength, renderToolbar, pill }: ToolbarDockProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const containerRef = useRef<HostInstance>(null);
  const area = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const [motion] = useState(() => ({
    drag: new Animated.ValueXY({ x: 0, y: 0 }),
    appear: new Animated.Value(1),
    collapse: new Animated.Value(collapsed ? 1 : 0),
  }));
  const vertical = isVerticalDock(dock);

  useEffect(() => {
    Animated.timing(motion.collapse, {
      toValue: collapsed ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.poly(3)),
      useNativeDriver: true,
    }).start();
  }, [collapsed, motion]);

  const measure = () => {
    containerRef.current?.measureInWindow((x, y, width, height) => {
      area.current = { x, y, width, height };
    });
  };

  /** Snaps to `next`: back into place when it's the same edge, a short fade-in on a new one. */
  const settle = (next: Dock) => {
    setDragging(false);
    if (next === dock) {
      Animated.spring(motion.drag, { toValue: { x: 0, y: 0 }, useNativeDriver: false, bounciness: 4 }).start();
      return;
    }
    motion.drag.setValue({ x: 0, y: 0 });
    motion.appear.setValue(0);
    onDock(next);
    Animated.timing(motion.appear, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.poly(3)),
      useNativeDriver: true,
    }).start();
  };

  // The responder is created once; it reads the latest dock and `settle` through refs, updated
  // after each render (never during it).
  const settleRef = useRef(settle);
  const dockRef = useRef(dock);
  useLayoutEffect(() => {
    settleRef.current = settle;
    dockRef.current = dock;
  });

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        measure();
        setDragging(true);
      },
      onPanResponderMove: (_event, gesture) => {
        motion.drag.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_event, gesture) => {
        const { x, y, width, height } = area.current;
        settleRef.current(nearestDock({ x: gesture.moveX - x, y: gesture.moveY - y }, { width, height }));
      },
      onPanResponderTerminate: () => {
        settleRef.current(dockRef.current);
      },
    }),
  );

  const grip = (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Move toolbar"
      accessibilityHint={`Docked at the ${DOCK_NAMES[dock]}. Drag to another edge.`}
      accessibilityActions={MOVES.filter((edge) => edge !== dock).map((edge) => ({
        name: edge,
        label: `Move to the ${DOCK_NAMES[edge]}`,
      }))}
      onAccessibilityAction={(event) => {
        const edge = MOVES.find((candidate) => candidate === event.nativeEvent.actionName);
        if (edge !== undefined) onDock(edge);
      }}
      style={{
        width: vertical ? 44 : 24,
        height: vertical ? 24 : 44,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SymbolView
        name="line.3.horizontal"
        size={16}
        tintColor={colors.tertiaryLabel}
        style={vertical ? null : { transform: [{ rotate: "90deg" }] }}
      />
    </View>
  );

  const appearScale = motion.appear.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 1 : 0.92, 1] });
  const toolbarOpacity = motion.collapse.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const toolbarScale = motion.collapse.interpolate({ inputRange: [0, 1], outputRange: [1, reduceMotion ? 1 : 0.9] });
  const pillScale = motion.collapse.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 1 : 0.8, 1] });

  return (
    <View
      ref={containerRef}
      pointerEvents="box-none"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        onAvailableLength(vertical ? height - TOP_CLEARANCE - EDGE * 2 : width - EDGE * 2);
        measure();
      }}
      style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, placement(dock, insets.bottom)]}
    >
      <Animated.View
        pointerEvents="box-none"
        style={{ transform: motion.drag.getTranslateTransform(), zIndex: dragging ? 10 : 0 }}
      >
        <Animated.View
          pointerEvents="box-none"
          style={{
            opacity: motion.appear,
            transform: [{ scale: appearScale }],
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Animated.View
            pointerEvents={collapsed ? "none" : "box-none"}
            style={{
              opacity: toolbarOpacity,
              transform: [{ scale: dragging ? 1.03 : toolbarScale }],
            }}
          >
            {renderToolbar(grip)}
          </Animated.View>
          <Animated.View
            pointerEvents={collapsed ? "box-none" : "none"}
            style={{ position: "absolute", opacity: motion.collapse, transform: [{ scale: pillScale }] }}
          >
            {pill}
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** Lines the toolbar up on its edge, clear of the home indicator and the page counter. */
function placement(dock: Dock, bottomInset: number) {
  switch (dock) {
    case "bottom":
      return { justifyContent: "flex-end", alignItems: "center", paddingBottom: bottomInset + EDGE } as const;
    case "top":
      return { justifyContent: "flex-start", alignItems: "center", paddingTop: TOP_CLEARANCE } as const;
    case "left":
      return {
        justifyContent: "center",
        alignItems: "flex-start",
        paddingLeft: EDGE,
        paddingTop: TOP_CLEARANCE,
      } as const;
    case "right":
      return {
        justifyContent: "center",
        alignItems: "flex-end",
        paddingRight: EDGE,
        paddingTop: TOP_CLEARANCE,
      } as const;
  }
}
