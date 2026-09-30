import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

// Fractional sort keys: moving one item rewrites one row. Keys grow a little each time an item
// is inserted between two neighbours; past SORT_KEY_MAX_LENGTH the siblings are rebalanced.

export const SORT_KEY_MAX_LENGTH = 24;

export function keyBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

export function needsRebalance(key: string): boolean {
  return key.length > SORT_KEY_MAX_LENGTH;
}

/** Fresh, short, evenly spaced keys for `count` siblings in their current order. */
export function evenlySpacedKeys(count: number): string[] {
  return generateNKeysBetween(null, null, count);
}
