import { describe, expect, test } from "bun:test";
import { ESLint } from "eslint";
import { nibnoteConfig } from "./eslint";

const fixture = `${import.meta.dirname}/fixtures/violations.ts`;

async function lintFixture() {
  const eslint = new ESLint({
    cwd: import.meta.dirname,
    overrideConfigFile: true,
    overrideConfig: nibnoteConfig({ tsconfigRootDir: import.meta.dirname }),
    allowInlineConfig: false,
  });
  const [result] = await eslint.lintFiles([fixture]);
  return result?.messages ?? [];
}

describe("type-safety contract", () => {
  test("rejects every banned construct", async () => {
    const messages = await lintFixture();
    const byRule = (ruleId: string) => messages.filter((m) => m.ruleId === ruleId);

    expect(byRule("@typescript-eslint/no-explicit-any").length).toBeGreaterThan(0);
    const restricted = byRule("no-restricted-syntax").map((m) => m.message);
    expect(restricted.some((m) => m.includes("`any`"))).toBe(true);
    expect(restricted.some((m) => m.includes("`unknown`"))).toBe(true);
    expect(byRule("@typescript-eslint/consistent-type-assertions")).toHaveLength(1);
    expect(byRule("@typescript-eslint/no-non-null-assertion").length).toBeGreaterThan(0);
    expect(byRule("@typescript-eslint/ban-ts-comment").length).toBeGreaterThan(0);
  });

  test("allows `as const`", async () => {
    const messages = await lintFixture();
    const constLine = 20;
    expect(messages.filter((m) => m.line === constLine)).toEqual([]);
  });
});
