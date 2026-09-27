import type { PurgedFiles } from "@nibnote/db";
import { File, Paths } from "expo-file-system";

/**
 * Deletes the drawing and thumbnail files of purged rows. Rows are gone already, so a file that
 * can't be deleted is only wasted space, never a broken page; it is skipped rather than retried.
 */
export function deletePurgedFiles(files: PurgedFiles): void {
  for (const path of files.drawings) {
    deleteIfPresent(new File(Paths.document, path));
    deleteIfPresent(new File(Paths.document, `${path}.bak`));
  }
  for (const path of files.thumbnails) {
    deleteIfPresent(new File(Paths.cache, path));
  }
}

function deleteIfPresent(file: File): void {
  if (!file.exists) return;
  try {
    file.delete();
  } catch (error) {
    console.warn("Could not delete a purged file", error instanceof Error ? error.message : String(error));
  }
}
