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

/**
 * The placement that puts `pageId` at `targetIndex` in the new order (for drag and drop). The
 * index is clamped to the page count; null when the page wouldn't move or isn't in `order`.
 */
export function placementForIndex(order: readonly PageId[], pageId: PageId, targetIndex: number): PagePlacement | null {
  const index = order.indexOf(pageId);
  if (index < 0) return null;
  const others = order.filter((id) => id !== pageId);
  const target = Math.min(Math.max(Math.trunc(targetIndex), 0), others.length);
  if (target === index) return null;
  return { afterId: target === 0 ? null : (others[target - 1] ?? null) };
}

/**
 * The page to show when `removed` pages leave the notebook while `from` is on screen: the first
 * remaining page after it, else the nearest one before it. Null when nothing remains.
 */
export function nearestRemaining(order: readonly PageId[], removed: readonly PageId[], from: PageId): PageId | null {
  const index = order.indexOf(from);
  if (index < 0) return null;
  const gone = new Set(removed);
  const after = order.slice(index).find((id) => !gone.has(id));
  if (after !== undefined) return after;
  for (let i = index - 1; i >= 0; i--) {
    const id = order[i];
    if (id !== undefined && !gone.has(id)) return id;
  }
  return null;
}

/** The page to show once `pageId` leaves the notebook: the next page, else the previous one. */
export function neighbourAfterRemoval(order: readonly PageId[], pageId: PageId): PageId | null {
  return nearestRemaining(order, [pageId], pageId);
}
