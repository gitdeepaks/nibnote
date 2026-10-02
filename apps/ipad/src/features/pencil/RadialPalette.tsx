import {
  colorName,
  colorSlotOf,
  colorTarget,
  isPaletteItemSelected,
  PALETTE_ITEM,
  PALETTE_RADIUS,
  paletteItems,
  radialLayout,
  type AreaSize,
  type CanvasPoint,
  type PaletteItem,
  type ToolSlot,
} from "@nibnote/shared";
import type { SFSymbol } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { colors } from "../../theme/colors";
import { SwatchButton, ToolbarButton } from "../toolbar/toolbarControls";
import { useToolbox } from "../toolbar/ToolboxProvider";
import { useReduceMotion } from "../toolbar/useToolbarCollapse";

// The Apple Pencil palette: opens at the Pencil's tip on squeeze (or double-tap, per the user's
// setting), with the five tools, the three pinned colours and the active tool's options in a ring.

const TOOLS: Readonly<Record<ToolSlot, { readonly label: string; readonly icon: SFSymbol }>> = {
  pen: { label: "Pen", icon: "pencil.tip" },
  pencil: { label: "Pencil", icon: "pencil" },
  highlighter: { label: "Highlighter", icon: "highlighter" },
  eraser: { label: "Eraser", icon: "eraser" },
  lasso: { label: "Lasso", icon: "lasso" },
};

const OPEN_MS = 140;
const CLOSE_MS = 120;
/** After a pick, the ring shows the new choice this long before fading, so the change is seen. */
const PICKED_HOLD_MS = 180;
/** The disc behind the ring: the items plus a little room around them. */
const DISC = (PALETTE_RADIUS + PALETTE_ITEM / 2 + 6) * 2;

type RadialPaletteProps = {
  /** Where the Pencil is, in the page area; null centres the palette. */
  readonly point: CanvasPoint | null;
  readonly area: AreaSize;
  /** A tool or colour was picked with the Pencil at `at` (for the Pencil Pro haptic). */
  readonly onPicked: (at: CanvasPoint) => void;
  /** Open the active tool's options at the Pencil. */
  readonly onOptions: () => void;
  readonly onClose: () => void;
};

export function RadialPalette({ point, area, onPicked, onOptions, onClose }: RadialPaletteProps) {
  const toolbox = useToolbox((state) => state.toolbox);
  const actions = useToolbox((state) => state.actions);
  const reduceMotion = useReduceMotion();
  const [appear] = useState(() => new Animated.Value(0));
  const closing = useRef(false);

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: OPEN_MS,
      easing: Easing.out(Easing.poly(3)),
      useNativeDriver: true,
    }).start();
  }, [appear]);

  /**
   * Waits `holdMs` (after a pick, so the ring shows the new choice), fades out, then closes. Taps
   * during the fade are ignored, so a quick second tap can't pick again.
   */
  const dismiss = (holdMs: number, after: () => void) => {
    if (closing.current) return;
    closing.current = true;
    Animated.sequence([
      Animated.delay(holdMs),
      Animated.timing(appear, { toValue: 0, duration: CLOSE_MS, useNativeDriver: true }),
    ]).start(() => {
      after();
    });
  };

  const items = paletteItems(toolbox);
  const layout = radialLayout(point, area, items.length);
  const target = colorTarget(toolbox);
  const targetSettings = toolbox.slots[target];
  const active = TOOLS[toolbox.active];
  const activeColor = colorSlotOf(toolbox.active);

  const choose = (item: PaletteItem, at: CanvasPoint) => {
    switch (item.kind) {
      case "tool":
        actions.selectSlot(item.slot);
        onPicked(at);
        dismiss(PICKED_HOLD_MS, onClose);
        return;
      case "color":
        actions.chooseColor(target, targetSettings.pinnedColors[item.index]);
        onPicked(at);
        dismiss(PICKED_HOLD_MS, onClose);
        return;
      case "options":
        dismiss(0, onOptions);
        return;
    }
  };

  const renderItem = (item: PaletteItem, at: CanvasPoint) => {
    const selected = isPaletteItemSelected(toolbox, item);
    const press = () => {
      choose(item, at);
    };
    switch (item.kind) {
      case "tool":
        return (
          <ToolbarButton
            icon={TOOLS[item.slot].icon}
            label={TOOLS[item.slot].label}
            hint={null}
            selected={selected}
            disabled={false}
            dot={null}
            onPress={press}
          />
        );
      case "color": {
        const color = targetSettings.pinnedColors[item.index];
        return (
          <SwatchButton
            color={color}
            label={`${colorName(color)} ${target}`}
            hint={null}
            selected={selected}
            size={26}
            onPress={press}
            onLongPress={null}
          />
        );
      }
      case "options":
        return (
          <ToolbarButton
            icon="slider.horizontal.3"
            label={`${active.label} options`}
            hint={null}
            selected={false}
            disabled={false}
            dot={null}
            onPress={press}
          />
        );
    }
  };

  const close = () => {
    dismiss(0, onClose);
  };

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal onAccessibilityEscape={close}>
      {/* Tapping anywhere else closes the palette without drawing, as with Apple's palette. */}
      <Pressable style={StyleSheet.absoluteFill} accessible={false} importantForAccessibility="no" onPress={close} />
      <Animated.View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: area.width,
          height: area.height,
          opacity: appear,
          ...(reduceMotion
            ? {}
            : {
                transform: [
                  { translateX: layout.center.x },
                  { translateY: layout.center.y },
                  { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
                  { translateX: -layout.center.x },
                  { translateY: -layout.center.y },
                ],
              }),
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: layout.center.x - DISC / 2,
            top: layout.center.y - DISC / 2,
            width: DISC,
            height: DISC,
            borderRadius: DISC / 2,
            backgroundColor: colors.secondaryBackground,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.separator,
            boxShadow: "0 6px 24px rgba(0, 0, 0, 0.22)",
          }}
        />
        {items.map((item, index) => {
          const at = layout.items[index];
          if (at === undefined) return null;
          return (
            <View
              key={item.kind === "tool" ? item.slot : item.kind === "color" ? `color-${String(item.index)}` : "options"}
              style={{
                position: "absolute",
                left: at.x - PALETTE_ITEM / 2,
                top: at.y - PALETTE_ITEM / 2,
                width: PALETTE_ITEM,
                height: PALETTE_ITEM,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {renderItem(item, at)}
            </View>
          );
        })}
        <View
          style={{
            position: "absolute",
            left: layout.center.x - PALETTE_ITEM / 2,
            top: layout.center.y - PALETTE_ITEM / 2,
          }}
        >
          <ToolbarButton
            icon={active.icon}
            label="Close palette"
            hint={null}
            selected={false}
            disabled={false}
            dot={activeColor === null ? null : toolbox.slots[activeColor].color}
            onPress={close}
          />
        </View>
      </Animated.View>
    </View>
  );
}
