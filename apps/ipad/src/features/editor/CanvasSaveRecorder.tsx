import { useEffect } from "react";
import { addDrawingSavedListener, addThumbnailWrittenListener } from "../../../modules/pencil-canvas";
import { useRepository } from "../../db/DatabaseProvider";
import { markThumbnailWritten } from "./thumbnailVersions";

/**
 * Records every drawing save in the database (hash, thumbnail path, sync outbox) and tells
 * thumbnails to reload. Mounted once at the root, not in the editor, so the final save made while
 * the editor closes is still recorded. The drawing file is already durable when this runs; a page
 * deleted meanwhile is only logged.
 */
export function CanvasSaveRecorder() {
  const repository = useRepository();
  useEffect(() => {
    const saved = addDrawingSavedListener((event) => {
      const result = repository.pages.recordSave(event.pageId, event.sha256);
      if (!result.ok) console.warn("A saved page is no longer live; its save wasn't recorded", event.pageId);
    });
    const thumbnails = addThumbnailWrittenListener((event) => {
      markThumbnailWritten(event.pageId);
    });
    return () => {
      saved.remove();
      thumbnails.remove();
    };
  }, [repository]);
  return null;
}
