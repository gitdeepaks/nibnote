import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";
import { DatabaseProvider } from "../db/DatabaseProvider";
import { CanvasSaveRecorder } from "../features/editor/CanvasSaveRecorder";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <DatabaseProvider>
        <CanvasSaveRecorder />
        <Stack>
          <Stack.Screen name="index" />
          <Stack.Screen
            name="new-notebook"
            options={{ presentation: "formSheet", sheetGrabberVisible: true, sheetAllowedDetents: [0.8, 1] }}
          />
          <Stack.Screen
            name="notebook/[notebookId]"
            // iOS 26 turns a right swipe anywhere into "go back", which fought page swipes and
            // closed the notebook. Back stays on the button and the left-edge swipe.
            options={{ headerBackButtonDisplayMode: "minimal", fullScreenGestureEnabled: false }}
          />
        </Stack>
      </DatabaseProvider>
    </ThemeProvider>
  );
}
