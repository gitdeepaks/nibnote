import { z } from "zod";

// The app's only reads of build-time environment values. Expo inlines `EXPO_PUBLIC_*` variables
// when the bundle is built, so each is read directly and parsed once, here.
const Env = z.object({
  /** "1" shows the diagnostics menu in release builds (for on-device measurements only). */
  EXPO_PUBLIC_DIAGNOSTICS: z.enum(["0", "1"]).optional(),
});

const values = Env.parse({ EXPO_PUBLIC_DIAGNOSTICS: process.env.EXPO_PUBLIC_DIAGNOSTICS });

export const env = {
  diagnostics: values.EXPO_PUBLIC_DIAGNOSTICS === "1",
} as const;
