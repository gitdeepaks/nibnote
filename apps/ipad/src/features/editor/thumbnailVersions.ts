import type { PageId } from "@nibnote/shared";
import { useSyncExternalStore } from "react";

// A thumbnail file is rewritten in place after each save, so image caches can't tell it changed.
// Each rewrite bumps the page's version, and thumbnails fold it into their cache key.

const versions = new Map<PageId, number>();
const listeners = new Set<() => void>();

export function markThumbnailWritten(pageId: PageId): void {
  versions.set(pageId, (versions.get(pageId) ?? 0) + 1);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 0 until the page's thumbnail is rewritten while the app runs. */
export function useThumbnailVersion(pageId: PageId): number {
  return useSyncExternalStore(subscribe, () => versions.get(pageId) ?? 0);
}
