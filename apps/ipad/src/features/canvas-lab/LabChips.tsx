import { Pressable, StyleSheet, Text, View } from "react-native";

export type LabChip<Value> = {
  readonly label: string;
  readonly value: Value;
};

type LabChipsProps<Value> = {
  readonly title: string;
  readonly chips: readonly LabChip<Value>[];
  readonly selected: Value;
  readonly onSelect: (value: Value) => void;
};

/** A labelled row of single-select chips for the Canvas Lab toolbar. */
export function LabChips<Value>({
  title,
  chips,
  selected,
  onSelect,
}: LabChipsProps<Value>) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {chips.map((chip) => {
        const isSelected = Object.is(chip.value, selected);
        return (
          <Pressable
            key={chip.label}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => {
              onSelect(chip.value);
            }}
            style={[styles.chip, isSelected && styles.chipSelected]}
          >
            <Text
              style={[styles.chipText, isSelected && styles.chipTextSelected]}
            >
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type LabButtonProps = {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
};

export function LabButton({
  label,
  onPress,
  disabled = false,
}: LabButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, disabled && styles.chipDisabled]}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  title: { width: 72, fontSize: 12, fontWeight: "600", color: "#6B6B70" },
  chip: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#E5E5EA",
  },
  chipSelected: { backgroundColor: "#1C1C1E" },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontSize: 13, color: "#1C1C1E" },
  chipTextSelected: { color: "#FFFFFF" },
});
