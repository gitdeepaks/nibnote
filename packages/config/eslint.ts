import type { Linter } from "eslint";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

interface NibnoteConfigOptions {
  readonly tsconfigRootDir: string;
  readonly ignores: readonly string[];
  /** Files outside the package tsconfig (e.g. eslint.config.ts in the Expo app), linted with Bun types */
  readonly bunToolingFiles: readonly string[];
}

type RestrictedSyntax = { readonly selector: string; readonly message: string };

const bannedEverywhere: readonly RestrictedSyntax[] = [
  {
    selector: "TSAnyKeyword",
    message: "`any` is banned; parse with Zod instead.",
  },
  {
    selector: "TSUnknownKeyword",
    message: "`unknown` is banned; parse with Zod instead.",
  },
  {
    selector: "TSUndefinedKeyword",
    message: "`undefined` is banned in types; use `null` for a missing value.",
  },
  {
    // Narrowing a runtime value (`x === undefined`) is the only allowed use of `undefined`.
    selector:
      'Identifier[name="undefined"]:not(BinaryExpression[operator="==="] > Identifier, BinaryExpression[operator="!=="] > Identifier)',
    message: "`undefined` is banned as a value; use `null`, and only compare runtime values with `=== undefined`.",
  },
];

/** Optional members hide `undefined`; our own types use required fields with `| null`. */
const bannedOptionals: readonly RestrictedSyntax[] = [
  {
    // React's own props are the only optional properties we declare.
    selector: "TSPropertySignature[optional=true]:not([key.name=/^(children|style|ref)$/])",
    message: "Optional properties are banned; make it required with `| null`.",
  },
  {
    selector: "PropertyDefinition[optional=true]",
    message: "Optional properties are banned; make it required with `| null`.",
  },
  {
    selector: "Identifier[optional=true]",
    message: "Optional parameters are banned; make it required with `| null`.",
  },
  {
    selector: ":function > AssignmentPattern",
    message: "Default parameters make a parameter optional; pass the value explicitly.",
  },
];

// The rules from the Type-safety contract in docs/BUILD_PLAN.md
export const typeSafetyRules: Linter.RulesRecord = {
  "@typescript-eslint/no-explicit-any": "error",
  "no-restricted-syntax": ["error", ...bannedEverywhere, ...bannedOptionals],
  "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
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

export function nibnoteConfig({ tsconfigRootDir, ignores, bunToolingFiles }: NibnoteConfigOptions) {
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
      rules: {
        ...typeSafetyRules,
        "no-restricted-properties": [
          "error",
          {
            object: "z",
            property: "locales",
            message: "The app bundle ships Zod's English messages only (apps/ipad/metro.config.ts).",
          },
        ],
      },
    },
    {
      // Ambient declarations describe values from outside (like environment variables), which may
      // really be absent; they keep optional members, and the value is parsed with Zod where read.
      files: ["**/*.d.ts"],
      rules: { "no-restricted-syntax": ["error", ...bannedEverywhere] },
    },
  );
}
