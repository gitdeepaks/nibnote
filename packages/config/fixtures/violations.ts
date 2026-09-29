// Deliberate violations of the Type-safety contract. Never import this file.
// lint-contract.test.ts asserts that ESLint rejects every one of them.

export const explicitAny: any = 1;

export function takesUnknown(value: unknown): string {
  return String(value);
}

const raw: object = { name: "page" };
export const casted = raw as { name: string };

const maybe: string | undefined = process.env["HOME"];
export const forced = maybe!.length;

// @ts-ignore
export const ignored: number = 1;

export const literal = ["pen", "pencil"] as const;

// Metro ships Zod's English messages only (apps/ipad/metro.config.ts), so other locales are banned.
import { z } from "zod";
z.config(z.locales.fr());

// No `undefined` and no optional members in our own types; absence is `null`.
export const missing = undefined;
export type WithOptional = { readonly name?: string };
export function withOptionalParam(name?: string): string {
  return name ?? "";
}
export function withDefault(name = "page"): string {
  return name;
}

// Allowed: narrowing a runtime value, and React's own optional props.
export const narrows = (values: readonly string[]): boolean => values[0] === undefined;
export type ReactProps = { readonly children?: string; readonly style?: string; readonly ref?: string };
