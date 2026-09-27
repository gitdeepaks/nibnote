import { SymbolView, type SFSymbol } from "expo-symbols";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { colors } from "../../theme/colors";

type EmptyStateProps = {
  readonly icon: SFSymbol;
  readonly title: string;
  readonly message: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
};

/** Centred message for empty and error states. */
export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: 32,
      }}
    >
      <SymbolView name={icon} size={44} tintColor={colors.tertiaryLabel} />
      <Text style={{ fontSize: 20, fontWeight: "600", color: colors.label }}>
        {title}
      </Text>
      <Text
        selectable
        style={{
          maxWidth: 420,
          fontSize: 15,
          textAlign: "center",
          color: colors.secondaryLabel,
        }}
      >
        {message}
      </Text>
      {action !== undefined && (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={{ paddingTop: 6 }}
        >
          <Text style={{ fontSize: 17, fontWeight: "600", color: colors.tint }}>
            {action.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** Shown only while the first read is resolving, never in place of an empty state. */
export function LoadingState() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}
