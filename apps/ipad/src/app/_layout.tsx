import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";
import { DatabaseProvider } from "../db/DatabaseProvider";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <DatabaseProvider>
        <Stack>
          <Stack.Screen name="index" />
          <Stack.Screen
            name="new-notebook"
            options={{ presentation: "formSheet", sheetGrabberVisible: true, sheetAllowedDetents: [0.8, 1] }}
          />
          <Stack.Screen name="dev/canvas-lab" options={{ headerShown: false }} />
        </Stack>
      </DatabaseProvider>
    </ThemeProvider>
  );
}
