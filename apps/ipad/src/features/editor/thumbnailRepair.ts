import type { Page, PageId } from "@nibnote/shared";
import { File, Paths } from "expo-file-system";
import { renderThumbnail } from "../../../modules/pencil-canvas";
import { drawingFileUri, thumbnailFile } from "../../db/files";
import { markThumbnailWritten } from "./thumbnailVersions";

// Thumbnails live in Caches, which iOS may purge. A page whose drawing file exists but whose
// thumbnail is gone gets it rebuilt natively, one page at a time, when it comes on screen. Once
// written, the page's thumbnail version is bumped so its image reloads.

const state: {
  waiting: Page[];
  queued: Set<PageId>;
  /** Pages already tried this session, so a page that can't render isn't retried on every mount. */
  tried: Set<PageId>;
  running: boolean;
} = { waiting: [], queued: new Set(), tried: new Set(), running: false };

export function repairThumbnailIfMissing(page: Page): void {
  if (state.queued.has(page.id) || state.tried.has(page.id)) return;
  if (thumbnailFile(page.id).exists) return;
  if (!new File(Paths.document, page.drawingPath).exists) return;
  state.queued.add(page.id);
  state.waiting.push(page);
  void drain();
}

/** After the thumbnail folder is cleared on purpose (diagnostics), every page may be tried again. */
export function forgetThumbnailRepairs(): void {
  state.tried.clear();
}

async function drain(): Promise<void> {
  if (state.running) return;
  state.running = true;
  try {
    for (let page = state.waiting.shift(); page !== undefined; page = state.waiting.shift()) {
      state.queued.delete(page.id);
      state.tried.add(page.id);
      try {
        const written = await renderThumbnail(
          page.id,
          drawingFileUri(page),
          { widthPt: page.widthPt, heightPt: page.heightPt },
          page.template,
        );
        if (written) markThumbnailWritten(page.id);
      } catch (error) {
        console.warn("Rebuilding a thumbnail failed", error instanceof Error ? error.message : String(error));
      }
    }
  } finally {
    state.running = false;
  }
}
