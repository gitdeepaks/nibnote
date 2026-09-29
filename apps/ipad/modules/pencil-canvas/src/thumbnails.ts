import type { FileUri, PageId, PageSize, PageTemplate } from "@nibnote/shared";
import { z } from "zod";
import { nativeModule } from "./nativeModule";

/**
 * Rebuilds a page's thumbnail from its drawing file without mounting a canvas. Resolves true when
 * a thumbnail was written (the caller reloads the page's image), false when there was nothing to
 * render.
 */
export async function renderThumbnail(
  pageId: PageId,
  drawingFileUri: FileUri,
  pageSize: PageSize,
  template: PageTemplate,
): Promise<boolean> {
  return z.boolean().parse(await nativeModule.renderThumbnail(pageId, drawingFileUri, pageSize, template));
}
