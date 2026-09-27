import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";
import { DatabaseProvider } from "../db/DatabaseProvider";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <DatabaseProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </DatabaseProvider>
    </ThemeProvider>
  );
}
