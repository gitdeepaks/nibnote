import {
  colorName,
  colorSlotOf,
  colorTarget,
  isVerticalDock,
  sameColor,
  type ColorSlot,
  type HexColor,
  type ToolbarDock as Dock,
  type ToolSlot,
  type TrioIndex,
} from "@nibnote/shared";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { useRef, useState, type ReactElement } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { colors } from "../../theme/colors";
import { AnchoredPopover, type PopoverSide } from "./AnchoredPopover";
import { ColorOptions } from "./ColorOptions";
import { BUTTON, SwatchButton, ToolbarButton, ToolbarDivider } from "./toolbarControls";
import { ToolbarDock } from "./ToolbarDock";
import { useToolbox } from "./ToolboxProvider";
import { ToolOptions } from "./ToolOptions";

// The floating toolbar: a grip, the five tools, the pinned colours of the current colour tool, undo
// and redo, and the Pencil-only switch. It docks on any edge (vertical on the sides), shrinks to a
// pill while writing, and folds its three colours into one when the window is too narrow.

const SLOTS: readonly { readonly slot: ToolSlot; readonly label: string; readonly icon: SFSymbol }[] = [
  { slot: "pen", label: "Pen", icon: "pencil.tip" },
  { slot: "pencil", label: "Pencil", icon: "pencil" },
  { slot: "highlighter", label: "Highlighter", icon: "highlighter" },
  { slot: "eraser", label: "Eraser", icon: "eraser" },
  { slot: "lasso", label: "Lasso", icon: "lasso" },
];

const SLOT_ICONS: Readonly<Record<ToolSlot, SFSymbol>> = {
  pen: "pencil.tip",
  pencil: "pencil",
  highlighter: "highlighter",
  eraser: "eraser",
  lasso: "lasso",
};

/** For colour labels: "Blue pen", "Yellow highlighter". */
const COLOR_TOOL_NAMES: Readonly<Record<ColorSlot, string>> = {
  pen: "pen",
  pencil: "pencil",
  highlighter: "highlighter",
};

const PIN_INDEXES: readonly TrioIndex[] = [0, 1, 2];

/** The full toolbar's length along its axis (grip, 11 buttons, dividers, padding), in points. */
const FULL_LENGTH = 620;

/** Popovers open away from the edge the toolbar sits on. */
const POPOVER_SIDES: Readonly<Record<Dock, PopoverSide>> = {
  bottom: "above",
  top: "below",
  left: "trailing",
  right: "leading",
};

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
  /** Writing: show the pill instead of the toolbar. */
  readonly collapsed: boolean;
  readonly onExpand: () => void;
};

export function Toolbar({ canUndo, canRedo, onUndo, onRedo, collapsed, onExpand }: ToolbarProps) {
  const toolbox = useToolbox((state) => state.toolbox);
  const actions = useToolbox((state) => state.actions);
  const [open, setOpen] = useState<OpenPopover>(null);
  const [available, setAvailable] = useState(FULL_LENGTH);
  // The last colour from the system picker; it joins the recent colours when the popover closes.
  const systemPick = useRef<HexColor | null>(null);

  const dock = toolbox.dock;
  const vertical = isVerticalDock(dock);
  const side = POPOVER_SIDES[dock];
  const compact = available < FULL_LENGTH;
  const target = colorTarget(toolbox);
  const targetSettings = toolbox.slots[target];
  const policy = toolbox.drawingPolicy;

  const close = () => {
    const picked = systemPick.current;
    systemPick.current = null;
    if (picked !== null) actions.addRecentColor(picked);
    setOpen(null);
  };

  const colorPopover = (index: TrioIndex, anchor: ReactElement) => (
    <AnchoredPopover
      // Pinned colours can repeat, so the position is the stable key.
      key={`color-${String(index)}`}
      open={open?.kind === "color" && open.slot === target && open.index === index}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      side={side}
      anchor={anchor}
      content={
        <ColorOptions
          // A fresh editor for each pin.
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

  const pinButton = (index: TrioIndex) => {
    const color = targetSettings.pinnedColors[index];
    const selected = toolbox.active === target && sameColor(targetSettings.color, color);
    const openColor = () => {
      setOpen({ kind: "color", slot: target, index });
    };
    return colorPopover(
      index,
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
      />,
    );
  };

  // Too narrow for three colours: one swatch shows the current colour and opens its options.
  const compactColor = () => {
    const found = targetSettings.pinnedColors.findIndex((color) => sameColor(color, targetSettings.color));
    const index: TrioIndex = found === 1 || found === 2 ? found : 0;
    const color = targetSettings.color;
    return colorPopover(
      index,
      <SwatchButton
        color={color}
        label={`${colorName(color)} ${COLOR_TOOL_NAMES[target]}`}
        hint="Shows colour options"
        selected={toolbox.active === target}
        size={26}
        onPress={() => {
          if (toolbox.active !== target) actions.selectSlot(target);
          setOpen({ kind: "color", slot: target, index });
        }}
        onLongPress={null}
      />,
    );
  };

  const renderToolbar = (grip: ReactElement) => (
    <View
      accessibilityRole="toolbar"
      style={{
        flexDirection: vertical ? "column" : "row",
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
      {grip}
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
            side={side}
            anchor={button}
            content={<ToolOptions slot={colorSlot} />}
          />
        );
      })}
      <ToolbarDivider vertical={vertical} />
      {compact ? compactColor() : PIN_INDEXES.map(pinButton)}
      <ToolbarDivider vertical={vertical} />
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
      <ToolbarDivider vertical={vertical} />
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
  );

  const activeColor = colorSlotOf(toolbox.active);
  return (
    <ToolbarDock
      dock={dock}
      collapsed={collapsed && open === null}
      onDock={actions.setDock}
      onAvailableLength={setAvailable}
      renderToolbar={renderToolbar}
      pill={
        <ToolbarPill
          icon={SLOT_ICONS[toolbox.active]}
          dot={activeColor === null ? null : toolbox.slots[activeColor].color}
          onPress={onExpand}
        />
      }
    />
  );
}

type ToolbarPillProps = {
  readonly icon: SFSymbol;
  readonly dot: HexColor | null;
  readonly onPress: () => void;
};

/** The toolbar while writing: just the current tool and its colour. Tap to bring the toolbar back. */
function ToolbarPill({ icon, dot, onPress }: ToolbarPillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Show toolbar"
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 22,
        borderCurve: "continuous",
        backgroundColor: colors.secondaryBackground,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.separator,
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.18)",
      }}
    >
      <SymbolView name={icon} size={20} tintColor={colors.tint} />
      {dot !== null && (
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: dot,
            borderWidth: 1,
            borderColor: "rgba(128, 128, 128, 0.6)",
          }}
        />
      )}
    </Pressable>
  );
}
