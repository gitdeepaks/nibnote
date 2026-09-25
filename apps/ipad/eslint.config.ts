import { nibnoteConfig } from "@nibnote/config/eslint";

export default nibnoteConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [".expo/**", "expo-env.d.ts", "ios/**", "android/**"],
  bunToolingFiles: ["eslint.config.ts"],
});
