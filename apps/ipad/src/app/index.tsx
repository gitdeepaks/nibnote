import { Link } from "expo-router";
import { StyleSheet, Text, useColorScheme, View } from "react-native";

export default function LibraryPlaceholder() {
  const isDark = useColorScheme() === "dark";
  return (
    <View style={[styles.container, isDark ? styles.dark : styles.light]}>
      <Text style={[styles.title, isDark ? styles.darkText : styles.lightText]}>
        Nibnote
      </Text>
      <Text
        style={[styles.subtitle, isDark ? styles.darkText : styles.lightText]}
      >
        Phase 1 dev build
      </Text>
      {__DEV__ && (
        <Link href="/dev/canvas-lab" style={styles.link}>
          Open Canvas Lab
        </Link>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  light: { backgroundColor: "#FAF8F3" },
  dark: { backgroundColor: "#141414" },
  title: { fontSize: 48, fontWeight: "700" },
  subtitle: { fontSize: 17, opacity: 0.6 },
  link: { marginTop: 16, fontSize: 17, color: "#0A60FF" },
  lightText: { color: "#1C1C1E" },
  darkText: { color: "#F2F2F7" },
});
