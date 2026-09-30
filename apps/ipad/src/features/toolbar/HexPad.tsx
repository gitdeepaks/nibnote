import { Button, HStack, Image, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonStyle,
  controlSize,
  disabled,
  font,
  foregroundStyle,
  frame,
} from "@expo/ui/swift-ui/modifiers";
import { colors } from "../../theme/colors";

// A colour-code keypad in the colour popover, built from native SwiftUI buttons. The system
// keyboard is not used: in a popover it competed with Scribble, the floating keyboard and the
// minimised shortcut bar. React Native keys hosted in the popover didn't receive touches when the
// host mounted after the popover opened (seen on device), so the keys are native too.

const ROWS: readonly (readonly string[])[] = [
  ["1", "2", "3", "A"],
  ["4", "5", "6", "B"],
  ["7", "8", "9", "C"],
  ["D", "0", "E", "F"],
];
const MAX_DIGITS = 6;
const KEY_HEIGHT = 36;

type HexPadProps = {
  /** The digits typed so far, without `#`. */
  readonly draft: string;
  /** The current colour's digits, shown faintly while nothing is typed. */
  readonly current: string;
  readonly canUse: boolean;
  readonly onChange: (draft: string) => void;
  readonly onUse: () => void;
};

export function HexPad({ draft, current, canUse, onChange, onUse }: HexPadProps) {
  const complete = draft.length === 3 || draft.length === MAX_DIGITS;
  const showsHint = draft.length > 0 && !complete;
  return (
    <VStack spacing={8}>
      <HStack spacing={8}>
        <Text
          modifiers={[
            font({ size: 22, design: "monospaced" }),
            foregroundStyle(draft === "" ? colors.tertiaryLabel : colors.label),
            frame({ maxWidth: Infinity, alignment: "leading" }),
            accessibilityLabel(draft === "" ? `Colour code ${current}` : `Typed ${draft}`),
          ]}
        >
          {`# ${draft === "" ? current : draft}`}
        </Text>
        {showsHint && <Text modifiers={[font({ size: 13 }), foregroundStyle(colors.warning)]}>3 or 6 digits</Text>}
      </HStack>
      {ROWS.map((row) => (
        <HStack key={row.join("")} spacing={8}>
          {row.map((digit) => (
            <Button
              key={digit}
              onPress={() => {
                onChange(draft + digit);
              }}
              modifiers={[buttonStyle("bordered"), controlSize("large"), disabled(draft.length >= MAX_DIGITS)]}
            >
              <Text
                modifiers={[
                  font({ size: 20, weight: "medium", design: "monospaced" }),
                  frame({ maxWidth: Infinity, minHeight: KEY_HEIGHT }),
                ]}
              >
                {digit}
              </Text>
            </Button>
          ))}
        </HStack>
      ))}
      <HStack spacing={8}>
        <Button
          onPress={() => {
            onChange("");
          }}
          modifiers={[buttonStyle("bordered"), controlSize("large"), disabled(draft === "")]}
        >
          <Text modifiers={[frame({ maxWidth: Infinity, minHeight: KEY_HEIGHT })]}>Clear</Text>
        </Button>
        <Button
          onPress={() => {
            onChange(draft.slice(0, -1));
          }}
          modifiers={[
            buttonStyle("bordered"),
            controlSize("large"),
            disabled(draft === ""),
            accessibilityLabel("Delete digit"),
          ]}
        >
          <Image systemName="delete.left" modifiers={[frame({ maxWidth: Infinity, minHeight: KEY_HEIGHT })]} />
        </Button>
        <Button onPress={onUse} modifiers={[buttonStyle("borderedProminent"), controlSize("large"), disabled(!canUse)]}>
          <Text modifiers={[font({ weight: "semibold" }), frame({ maxWidth: Infinity, minHeight: KEY_HEIGHT })]}>
            Use
          </Text>
        </Button>
      </HStack>
    </VStack>
  );
}
