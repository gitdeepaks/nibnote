import type { Repository } from "@nibnote/db";
import type { NotebookId } from "@nibnote/shared";

// Development builds only (the editor hides the menu when `__DEV__` is false). These replace the
// Phase 1 Canvas Lab's fixtures for the Phase 2 performance exit criteria.

export const DEV_STROKE_FILLS = [500, 2000] as const;
export const DEV_PAGE_BATCH = 300;

/** Appends blank pages; returns how many were added. The live read re-renders once for the burst. */
export function addDevPages(repository: Repository, notebookId: NotebookId, count: number): number {
  for (let added = 0; added < count; added++) {
    const result = repository.pages.add(notebookId);
    if (!result.ok) return added;
  }
  return count;
}
