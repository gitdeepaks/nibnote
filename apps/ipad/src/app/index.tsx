import { StyleSheet, Text, useColorScheme, View } from "react-native";

export default function LibraryPlaceholder() {
  const isDark = useColorScheme() === "dark";
  return (
    <View style={[styles.container, isDark ? styles.dark : styles.light]}>
      <Text style={[styles.title, isDark ? styles.darkText : styles.lightText]}>Nibnote</Text>
      <Text style={[styles.subtitle, isDark ? styles.darkText : styles.lightText]}>Phase 0 dev build</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  light: { backgroundColor: "#FAF8F3" },
  dark: { backgroundColor: "#141414" },
  title: { fontSize: 48, fontWeight: "700" },
  subtitle: { fontSize: 17, opacity: 0.6 },
  lightText: { color: "#1C1C1E" },
  darkText: { color: "#F2F2F7" },
});
