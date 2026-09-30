import {
  activePreset,
  canvasToolFor,
  effectiveWidth,
  PenInk,
  selectSlot,
  setWidthPreset,
  slotWidthRange,
  type ColorSlot,
  type TrioIndex,
  type WidthRange,
} from "@nibnote/shared";
import { Picker, RNHostView, Slider, Text as SwiftText, VStack } from "@expo/ui/swift-ui";
import { frame, padding, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { InkPreview, PREVIEW_WIDTH } from "./InkPreview";
import { useToolbox } from "./ToolboxProvider";

// The options of the selected colour tool: a live preview in the real ink, three width presets,
// a fine slider that edits the selected preset, and the pen's ink style.

const TOOL_NAMES: Readonly<Record<ColorSlot, string>> = { pen: "Pen", pencil: "Pencil", highlighter: "Highlighter" };

const PEN_INKS: readonly { readonly ink: PenInk; readonly label: string }[] = [
  { ink: "pen", label: "Pen" },
  { ink: "fountainPen", label: "Fountain" },
  { ink: "monoline", label: "Monoline" },
];

const PRESET_INDEXES: readonly TrioIndex[] = [0, 1, 2];

const formatWidth = (width: number) => `${width.toFixed(1)} pt`;

export function ToolOptions({ slot }: { readonly slot: ColorSlot }) {
  const toolbox = useToolbox((state) => state.toolbox);
  const actions = useToolbox((state) => state.actions);
  // The slider's value while dragging; saved once when the finger lifts.
  const [draft, setDraft] = useState<number | null>(null);
  const latestDraft = useRef<number | null>(null);

  const range = slotWidthRange(toolbox, slot);
  const selectedPreset = activePreset(toolbox, slot);
  // The slider edits the selected preset (the middle one after a custom width).
  const editedPreset: TrioIndex = selectedPreset ?? 1;
  const shown = draft === null ? toolbox : setWidthPreset(toolbox, slot, editedPreset, draft);
  const width = effectiveWidth(shown, slot);

  return (
    <VStack spacing={14} alignment="leading" modifiers={[padding({ all: 16 }), frame({ width: PREVIEW_WIDTH + 32 })]}>
      <RNHostView matchContents>
        <View style={{ width: PREVIEW_WIDTH, gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.label }}>{TOOL_NAMES[slot]}</Text>
            <Text style={{ fontSize: 15, fontVariant: ["tabular-nums"], color: colors.secondaryLabel }}>
              {formatWidth(width)}
            </Text>
          </View>
          <InkPreview tool={canvasToolFor(selectSlot(shown, slot))} />
          <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
            {PRESET_INDEXES.map((index) => {
              const preset = shown.slots[slot].widthPresets[index];
              return (
                <PresetButton
                  key={index}
                  width={preset}
                  range={range}
                  selected={index === (draft === null ? selectedPreset : editedPreset)}
                  onPress={() => {
                    actions.selectWidthPreset(slot, index);
                  }}
                />
              );
            })}
          </View>
        </View>
      </RNHostView>
      <Slider
        value={width}
        min={range.min}
        max={range.max}
        step={0.1}
        onValueChange={(value) => {
          latestDraft.current = value;
          setDraft(value);
        }}
        onEditingChanged={(editing) => {
          const value = latestDraft.current;
          if (editing || value === null) return;
          actions.setWidthPreset(slot, editedPreset, value);
          latestDraft.current = null;
          setDraft(null);
        }}
      />
      {slot === "pen" && (
        <Picker
          modifiers={[pickerStyle("segmented")]}
          selection={toolbox.slots.pen.ink}
          onSelectionChange={(selection) => {
            const parsed = PenInk.safeParse(selection);
            if (parsed.success) actions.setPenInk(parsed.data);
          }}
        >
          {PEN_INKS.map((option) => (
            <SwiftText key={option.ink} modifiers={[tag(option.ink)]}>
              {option.label}
            </SwiftText>
          ))}
        </Picker>
      )}
    </VStack>
  );
}

type PresetButtonProps = {
  readonly width: number;
  readonly range: WidthRange;
  readonly selected: boolean;
  readonly onPress: () => void;
};

/** A dot sized by the preset (on a square-root scale, so thin presets still differ) and its value. */
function PresetButton({ width, range, selected, onPress }: PresetButtonProps) {
  const clamped = Math.min(range.max, Math.max(range.min, width));
  const share = (clamped - range.min) / (range.max - range.min);
  const dot = 6 + 22 * Math.sqrt(share);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Width ${formatWidth(clamped)}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        width: 72,
        height: 64,
        borderRadius: 12,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        backgroundColor: selected ? colors.tint : "transparent",
      }}
    >
      <View
        style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: selected ? "#FFFFFF" : colors.label }}
      />
      <Text
        style={{ fontSize: 12, fontVariant: ["tabular-nums"], color: selected ? "#FFFFFF" : colors.secondaryLabel }}
      >
        {clamped.toFixed(1)}
      </Text>
    </Pressable>
  );
}
