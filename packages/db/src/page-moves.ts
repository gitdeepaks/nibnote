import type { PageId } from "@nibnote/shared";
import type { PagePlacement } from "./repository/pages";

// Pure helpers for the editor's page menu. They work on the page order the screen shows, so the
// index arithmetic is tested once here instead of living in UI code.

export type PageMove = "start" | "earlier" | "later" | "end";

/**
 * The placement that moves `pageId` one step or to an end, for `pages.move`. Null when the page
 * can't move that way (already first or last) or isn't in `order`.
 */
export function placementFor(order: readonly PageId[], pageId: PageId, move: PageMove): PagePlacement | null {
  const index = order.indexOf(pageId);
  if (index < 0) return null;
  switch (move) {
    case "start":
      return index === 0 ? null : { afterId: null };
    case "earlier":
      // After the page two places up, which puts it right before its current predecessor.
      return index === 0 ? null : { afterId: order[index - 2] ?? null };
    case "later": {
      const next = order[index + 1];
      return next === undefined ? null : { afterId: next };
    }
    case "end": {
      const last = order.at(-1);
      return last === undefined || last === pageId ? null : { afterId: last };
    }
  }
}

/** The page to show once `pageId` leaves the notebook: the next page, else the previous one. */
export function neighbourAfterRemoval(order: readonly PageId[], pageId: PageId): PageId | null {
  const index = order.indexOf(pageId);
  if (index < 0) return null;
  return order[index + 1] ?? order[index - 1] ?? null;
}
