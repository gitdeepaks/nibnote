import { Color } from "expo-router";

// iOS semantic colours (the app is iPad-only). They resolve on device and follow light/dark mode,
// Increase Contrast and tinting automatically.
export const colors = {
  label: Color.ios.label,
  secondaryLabel: Color.ios.secondaryLabel,
  tertiaryLabel: Color.ios.tertiaryLabel,
  separator: Color.ios.separator,
  background: Color.ios.systemBackground,
  groupedBackground: Color.ios.systemGroupedBackground,
  secondaryBackground: Color.ios.secondarySystemBackground,
  fill: Color.ios.tertiarySystemFill,
  tint: Color.ios.systemBlue,
  destructive: Color.ios.systemRed,
  warning: Color.ios.systemOrange,
  favourite: Color.ios.systemYellow,
} as const;
