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
