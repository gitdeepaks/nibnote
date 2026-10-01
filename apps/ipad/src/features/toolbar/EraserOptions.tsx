import {
  activeEraserPreset,
  clampWidth,
  ERASER_WIDTH_RANGE,
  EraserMode,
  setEraserPreset,
  type TrioIndex,
} from "@nibnote/shared";
import { Button, HStack, Picker, Slider, Text, Toggle, VStack } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  controlSize,
  font,
  foregroundStyle,
  frame,
  padding,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { useRef, useState } from "react";
import { colors } from "../../theme/colors";
import { useToolbox } from "./ToolboxProvider";

// The eraser's options, all SwiftUI (parts appear and disappear with the mode after the popover
// opens, which hosted React Native controls can't do). PencilKit's stroke eraser has no width, so
// widths show only for the pixel eraser.

const PRESET_INDEXES: readonly TrioIndex[] = [0, 1, 2];
const WIDTH = 320;

const formatWidth = (width: number) => `${width.toFixed(1)} pt`;

export function EraserOptions() {
  const toolbox = useToolbox((state) => state.toolbox);
  const actions = useToolbox((state) => state.actions);
  // The slider's value while dragging; saved once when the finger lifts.
  const [draft, setDraft] = useState<number | null>(null);
  const latestDraft = useRef<number | null>(null);

  const eraser = toolbox.slots.eraser;
  const selectedPreset = activeEraserPreset(toolbox);
  const editedPreset: TrioIndex = selectedPreset ?? 1;
  const shown = draft === null ? toolbox : setEraserPreset(toolbox, editedPreset, draft);
  const width = clampWidth(shown.slots.eraser.width, ERASER_WIDTH_RANGE);

  return (
    <VStack spacing={14} alignment="leading" modifiers={[padding({ all: 16 }), frame({ width: WIDTH })]}>
      <HStack>
        <Text modifiers={[font({ size: 17, weight: "semibold" })]}>Eraser</Text>
        <Text
          modifiers={[frame({ maxWidth: Infinity, alignment: "trailing" }), foregroundStyle(colors.secondaryLabel)]}
        >
          {eraser.mode === "pixel" ? formatWidth(width) : "Whole strokes"}
        </Text>
      </HStack>
      <Picker
        modifiers={[pickerStyle("segmented")]}
        selection={eraser.mode}
        onSelectionChange={(selection) => {
          const parsed = EraserMode.safeParse(selection);
          if (parsed.success) actions.setEraserMode(parsed.data);
        }}
      >
        <Text modifiers={[tag("stroke")]}>Stroke</Text>
        <Text modifiers={[tag("pixel")]}>Pixel</Text>
      </Picker>
      {eraser.mode === "pixel" && (
        <HStack spacing={8}>
          {PRESET_INDEXES.map((index) => {
            const preset = clampWidth(shown.slots.eraser.widthPresets[index], ERASER_WIDTH_RANGE);
            const selected = index === (draft === null ? selectedPreset : editedPreset);
            return (
              <Button
                key={index}
                onPress={() => {
                  actions.selectEraserPreset(index);
                }}
                modifiers={[buttonStyle(selected ? "borderedProminent" : "bordered"), controlSize("large")]}
              >
                <Text modifiers={[frame({ maxWidth: Infinity }), font({ design: "monospaced" })]}>
                  {preset.toFixed(1)}
                </Text>
              </Button>
            );
          })}
        </HStack>
      )}
      {eraser.mode === "pixel" && (
        <Slider
          value={width}
          min={ERASER_WIDTH_RANGE.min}
          max={ERASER_WIDTH_RANGE.max}
          step={0.1}
          onValueChange={(value) => {
            latestDraft.current = value;
            setDraft(value);
          }}
          onEditingChanged={(editing) => {
            const value = latestDraft.current;
            if (editing || value === null) return;
            actions.setEraserPreset(editedPreset, value);
            latestDraft.current = null;
            setDraft(null);
          }}
        />
      )}
      <Toggle
        isOn={eraser.highlighterOnly}
        onIsOnChange={(on) => {
          if (on !== eraser.highlighterOnly) actions.toggleHighlighterOnly();
        }}
      >
        <Text>Erase highlighter only</Text>
        <Text>Pen and pencil stay as they are</Text>
      </Toggle>
    </VStack>
  );
}
