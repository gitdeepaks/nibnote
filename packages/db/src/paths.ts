import { RelativePath, type NotebookId, type PageId } from "@nibnote/shared";

// Stored paths are relative: the app container path can change between installs and updates.
// The app resolves them against Documents (drawings) or Caches (thumbnails) at runtime.

export function drawingPathFor(notebookId: NotebookId, pageId: PageId): RelativePath {
  return RelativePath.parse(`notebooks/${notebookId}/${pageId}.drawing`);
}

/** Matches where the PencilCanvas module writes thumbnails: Caches/thumbs/<pageId>.png. */
export function thumbnailPathFor(pageId: PageId): RelativePath {
  return RelativePath.parse(`thumbs/${pageId}.png`);
}

/** Joins a directory URI (e.g. `file:///…/Documents/`) with a stored relative path. */
export function resolvePath(directoryUri: string, path: RelativePath): string {
  return `${directoryUri.endsWith("/") ? directoryUri : `${directoryUri}/`}${path}`;
}
