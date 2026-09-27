import { useEffect } from "react";
import { addDrawingSavedListener } from "../../../modules/pencil-canvas";
import { useRepository } from "../../db/DatabaseProvider";

/**
 * Records every drawing save in the database (hash, thumbnail path, sync outbox). Mounted once at
 * the root, not in the editor, so the final save made while the editor closes is still recorded.
 * The drawing file is already durable when this runs; a page deleted meanwhile is only logged.
 */
export function CanvasSaveRecorder() {
  const repository = useRepository();
  useEffect(() => {
    const subscription = addDrawingSavedListener((event) => {
      const result = repository.pages.recordSave(event.pageId, event.sha256);
      if (!result.ok) console.warn("A saved page is no longer live; its save wasn't recorded", event.pageId);
    });
    return () => {
      subscription.remove();
    };
  }, [repository]);
  return null;
}
