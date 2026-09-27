import { Pressable, StyleSheet, Text, View } from "react-native";

type RecoveryScreenProps = {
  readonly message: string;
  readonly restoredBackup: boolean;
  readonly onRetry: () => void;
};

/** Shown when the local database can't be brought up to date. Never crash on a failed migration. */
export function RecoveryScreen({ message, restoredBackup, onRetry }: RecoveryScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your notes need a moment</Text>
      <Text style={styles.body}>
        {restoredBackup
          ? "An update to your library didn't finish, so Nibnote restored the copy made just before it. Your notes are safe."
          : "Nibnote couldn't open your library. Your drawings are stored separately and are not affected."}
      </Text>
      <Text style={styles.detail}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32, backgroundColor: "#FAF8F3" },
  title: { fontSize: 24, fontWeight: "700", color: "#1C1C1E" },
  body: { maxWidth: 480, fontSize: 16, textAlign: "center", color: "#3A3A3C" },
  detail: { maxWidth: 480, fontSize: 12, textAlign: "center", color: "#8E8E93" },
  button: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: "#1C1C1E" },
  buttonText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
});
