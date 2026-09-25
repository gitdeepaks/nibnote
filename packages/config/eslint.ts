import type { Linter } from "eslint";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

interface NibnoteConfigOptions {
  readonly tsconfigRootDir: string;
  readonly ignores?: readonly string[];
  /** Files outside the package tsconfig (e.g. eslint.config.ts in the Expo app), linted with Bun types */
  readonly bunToolingFiles?: readonly string[];
}

// The rules from the Type-safety contract in docs/BUILD_PLAN.md
export const typeSafetyRules: Linter.RulesRecord = {
  "@typescript-eslint/no-explicit-any": "error",
  "no-restricted-syntax": [
    "error",
    {
      selector: "TSAnyKeyword",
      message: "`any` is banned; parse with Zod instead.",
    },
    {
      selector: "TSUnknownKeyword",
      message: "`unknown` is banned; parse with Zod instead.",
    },
  ],
  "@typescript-eslint/consistent-type-assertions": [
    "error",
    { assertionStyle: "never" },
  ],
  "@typescript-eslint/no-non-null-assertion": "error",
  "@typescript-eslint/ban-ts-comment": [
    "error",
    {
      "ts-expect-error": true,
      "ts-ignore": true,
      "ts-nocheck": true,
      "ts-check": false,
    },
  ],
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-argument": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/no-unsafe-return": "error",
  "@typescript-eslint/switch-exhaustiveness-check": "error",
  "@typescript-eslint/strict-boolean-expressions": "error",
  "@typescript-eslint/no-floating-promises": "error",
};

export function nibnoteConfig({
  tsconfigRootDir,
  ignores = [],
  bunToolingFiles = [],
}: NibnoteConfigOptions) {
  const projectService =
    bunToolingFiles.length === 0
      ? true
      : {
          allowDefaultProject: [...bunToolingFiles],
          defaultProject: `${import.meta.dirname}/tsconfig.bun.json`,
        };

  return defineConfig(
    { ignores: ["**/node_modules/**", "**/dist/**", ...ignores] },
    {
      files: ["**/*.{ts,tsx}"],
      extends: [tseslint.configs.strictTypeChecked],
      languageOptions: {
        parserOptions: { projectService, tsconfigRootDir },
      },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: typeSafetyRules,
    },
  );
}
