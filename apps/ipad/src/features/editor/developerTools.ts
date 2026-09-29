import type { Repository } from "@nibnote/db";
import type { NotebookId } from "@nibnote/shared";
import { Directory, File, Paths } from "expo-file-system";
import { forgetThumbnailRepairs } from "./thumbnailRepair";

// Shown in development builds, and in release builds made with EXPO_PUBLIC_DIAGNOSTICS=1 for
// on-device measurements (the Phase 2 exit criteria). Never in a normal release build.

export const DEV_STROKE_FILLS = [500, 2000] as const;
export const DEV_PAGE_BATCH = 300;

/** Appends blank pages; returns how many were added. The live read re-renders once for the burst. */
export function addDevPages(repository: Repository, notebookId: NotebookId, count: number): number {
  for (let added = 0; added < count; added++) {
    const result = repository.pages.add(notebookId, null);
    if (!result.ok) return added;
  }
  return count;
}

export type FileCheck = { readonly pages: number; readonly drawn: number; readonly missing: number };

/**
 * Every live page that has recorded a save must still have its drawing file: the "zero data loss"
 * check after a day of offline use. Only checks that files exist; drawing bytes never reach JS.
 */
export function checkDrawingFiles(repository: Repository): FileCheck {
  let pages = 0;
  let drawn = 0;
  let missing = 0;
  for (const notebook of repository.notebooks.list({ kind: "all" })) {
    for (const page of repository.pages.list(notebook.id)) {
      pages += 1;
      if (page.drawingHash === null) continue;
      drawn += 1;
      if (!new File(Paths.document, page.drawingPath).exists) missing += 1;
    }
  }
  return { pages, drawn, missing };
}

/** Deletes every cached thumbnail, to check that they are rebuilt (as after iOS purges Caches). */
export function clearThumbnailCache(): void {
  const thumbnails = new Directory(Paths.cache, "thumbs");
  if (thumbnails.exists) thumbnails.delete();
  forgetThumbnailRepairs();
}
