import {
  canvasToolFor,
  colorName,
  HIGHLIGHTER_PRESETS,
  INK_PRESETS,
  inkVisibility,
  parseHexInput,
  sameColor,
  setPinnedColor,
  type ColorSlot,
  type HexColor,
  type InkVisibility,
  type TrioIndex,
} from "@nibnote/shared";
import { ColorPicker, Picker, RNHostView, Text as SwiftText, VStack } from "@expo/ui/swift-ui";
import { accessibilityLabel, frame, padding, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { useState } from "react";
import { Text, View } from "react-native";
import { z } from "zod";
import { colors } from "../../theme/colors";
import { HexPad } from "./HexPad";
import { InkPreview, PREVIEW_WIDTH } from "./InkPreview";
import { SwatchButton } from "./toolbarControls";
import { useToolbox } from "./ToolboxProvider";

// Edits one pinned colour of a colour tool. Everything applies at once, so the pin, the canvas and
// the preview always agree: presets, recent colours, a colour code on our keypad, or the system
// picker (spectrum, grid, eyedropper, and a HEX field that accepts pasting).

const TOOL_NAMES: Readonly<Record<ColorSlot, string>> = { pen: "pen", pencil: "pencil", highlighter: "highlighter" };

const WARNINGS: Readonly<Record<Exclude<InkVisibility, "fine">, Readonly<Record<"ink" | "highlighter", string>>>> = {
  tooLight: { ink: "Hard to see on white paper", highlighter: "Barely visible on the page" },
  tooDark: { ink: "", highlighter: "Hides the writing underneath" },
};

const SWATCH = 30;

const Mode = z.enum(["swatches", "code"]);
type Mode = z.infer<typeof Mode>;

type ColorOptionsProps = {
  readonly slot: ColorSlot;
  readonly index: TrioIndex;
  /** A colour from the system picker; it becomes a recent colour when the popover closes. */
  readonly onSystemPick: (color: HexColor) => void;
};

export function ColorOptions({ slot, index, onSystemPick }: ColorOptionsProps) {
  const toolbox = useToolbox((state) => state.toolbox);
  const actions = useToolbox((state) => state.actions);
  const pinned = toolbox.slots[slot].pinnedColors[index];
  const [mode, setMode] = useState<Mode>("swatches");
  // Digits typed on the keypad, without `#`.
  const [draft, setDraft] = useState("");

  const typed = mode === "code" ? parseHexInput(draft) : null;
  // While a valid code is typed, the preview shows it before it is used.
  const shown = typed ?? pinned;
  const kind = slot === "highlighter" ? "highlighter" : "ink";
  const visibility = inkVisibility(kind, shown);
  const presets = slot === "highlighter" ? HIGHLIGHTER_PRESETS : INK_PRESETS;

  const apply = (color: HexColor, remember: boolean) => {
    actions.setPinnedColor(slot, index, color);
    if (remember) actions.addRecentColor(color);
  };

  const canUse = typed !== null && !sameColor(typed, pinned);

  return (
    <VStack spacing={14} alignment="leading" modifiers={[padding({ all: 16 }), frame({ width: PREVIEW_WIDTH + 32 })]}>
      <RNHostView matchContents>
        <View style={{ width: PREVIEW_WIDTH, gap: 12 }}>
          <InkPreview tool={canvasToolFor(setPinnedColor(toolbox, slot, index, shown))} />
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.label }}>
              {`${colorName(shown)} ${TOOL_NAMES[slot]}`}
            </Text>
            <Text selectable style={{ fontSize: 13, fontVariant: ["tabular-nums"], color: colors.secondaryLabel }}>
              {shown}
            </Text>
            {visibility !== "fine" && (
              <Text accessibilityRole="alert" style={{ fontSize: 13, color: colors.warning }}>
                {WARNINGS[visibility][kind]}
              </Text>
            )}
          </View>
        </View>
      </RNHostView>
      <Picker
        modifiers={[pickerStyle("segmented"), accessibilityLabel("Choose colour by")]}
        selection={mode}
        onSelectionChange={(selection) => {
          const parsed = Mode.safeParse(selection);
          if (parsed.success) setMode(parsed.data);
        }}
      >
        <SwiftText modifiers={[tag("swatches")]}>Swatches</SwiftText>
        <SwiftText modifiers={[tag("code")]}>Colour code</SwiftText>
      </Picker>
      {/* Swatches are React Native (hosted); the keypad is SwiftUI. Swapping the child inside one
          RNHostView kept the old size and never attached the new content (seen on device). */}
      {mode === "swatches" ? (
        <RNHostView key="swatches" matchContents>
          <View style={{ width: PREVIEW_WIDTH, gap: 12 }}>
            <SwatchGrid
              title="Colours"
              colors={presets}
              selected={pinned}
              slotName={TOOL_NAMES[slot]}
              onPick={(color) => {
                apply(color, true);
              }}
            />
            {toolbox.recentColors.length > 0 && (
              <SwatchGrid
                title="Recent"
                colors={toolbox.recentColors}
                selected={pinned}
                slotName={TOOL_NAMES[slot]}
                onPick={(color) => {
                  apply(color, true);
                }}
              />
            )}
          </View>
        </RNHostView>
      ) : (
        <HexPad
          draft={draft}
          current={pinned.slice(1)}
          canUse={canUse}
          onChange={setDraft}
          onUse={() => {
            if (typed === null) return;
            apply(typed, true);
            setDraft("");
          }}
        />
      )}
      <ColorPicker
        label="More colours"
        selection={pinned}
        supportsOpacity={false}
        onSelectionChange={(value) => {
          const color = parseHexInput(value);
          if (color === null) return;
          apply(color, false);
          onSystemPick(color);
        }}
      />
    </VStack>
  );
}

type SwatchGridProps = {
  readonly title: string;
  readonly colors: readonly HexColor[];
  readonly selected: HexColor;
  readonly slotName: string;
  readonly onPick: (color: HexColor) => void;
};

function SwatchGrid({ title, colors: swatches, selected, slotName, onPick }: SwatchGridProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.secondaryLabel }}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {swatches.map((color) => (
          <SwatchButton
            key={color}
            color={color}
            label={`${colorName(color)} ${slotName}`}
            hint={null}
            selected={sameColor(color, selected)}
            size={SWATCH}
            onPress={() => {
              onPick(color);
            }}
            onLongPress={null}
          />
        ))}
      </View>
    </View>
  );
}
