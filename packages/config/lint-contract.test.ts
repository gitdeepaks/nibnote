import { describe, expect, test } from "bun:test";
import { ESLint } from "eslint";
import { nibnoteConfig } from "./eslint";

const fixture = `${import.meta.dirname}/fixtures/violations.ts`;

async function lintFixture() {
  const eslint = new ESLint({
    cwd: import.meta.dirname,
    overrideConfigFile: true,
    overrideConfig: nibnoteConfig({ tsconfigRootDir: import.meta.dirname, ignores: [], bunToolingFiles: [] }),
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

  test("bans `undefined` and optional members, but allows narrowing with `=== undefined`", async () => {
    const messages = await lintFixture();
    const restricted = messages.filter((m) => m.ruleId === "no-restricted-syntax").map((m) => m.message);
    expect(restricted.some((m) => m.includes("`undefined` is banned in types"))).toBe(true);
    expect(restricted.some((m) => m.includes("`undefined` is banned as a value"))).toBe(true);
    expect(restricted.some((m) => m.includes("Optional properties are banned"))).toBe(true);
    expect(restricted.some((m) => m.includes("Optional parameters are banned"))).toBe(true);
    expect(restricted.some((m) => m.includes("Default parameters"))).toBe(true);

    const lines = (await Bun.file(fixture).text()).split("\n");
    for (const allowed of ["=== undefined", "readonly children?"]) {
      const line = lines.findIndex((text) => text.includes(allowed)) + 1;
      expect(line).toBeGreaterThan(0);
      expect(messages.filter((m) => m.line === line && m.ruleId === "no-restricted-syntax")).toEqual([]);
    }
  });

  test("allows `as const`", async () => {
    const messages = await lintFixture();
    const lines = (await Bun.file(fixture).text()).split("\n");
    const constLine = lines.findIndex((line) => line.includes("as const")) + 1;
    expect(constLine).toBeGreaterThan(0);
    expect(messages.filter((m) => m.line === constLine)).toEqual([]);
  });

  test("bans Zod locales, which the app bundle leaves out", async () => {
    const messages = await lintFixture();
    expect(messages.filter((m) => m.ruleId === "no-restricted-properties")).toHaveLength(1);
  });
});
