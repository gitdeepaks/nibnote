import path from "node:path";
import { getDefaultConfig } from "expo/metro-config";

const config = getDefaultConfig(import.meta.dirname);

// Zod re-exports all 64 of its error-message languages as `z.locales` (~350 KB of bundle).
// Resolve that index to an English-only module; `z.locales` is banned by lint to match.
const zodLocaleIndex = /[\\/]zod[\\/]v4[\\/]locales[\\/]index\.c?js$/;
const englishOnly = path.join(import.meta.dirname, "src/bundling/zodLocales.ts");

export default {
  ...config,
  resolver: {
    ...config.resolver,
    resolveRequest: (context, moduleName, platform) => {
      const resolution = context.resolveRequest(context, moduleName, platform);
      return resolution.type === "sourceFile" && zodLocaleIndex.test(resolution.filePath)
        ? { type: "sourceFile", filePath: englishOnly }
        : resolution;
    },
  },
} satisfies typeof config;
