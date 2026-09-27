import type { CanvasErrorEvent } from "@nibnote/shared";

export type CanvasMessage = { readonly tone: "warning" | "error"; readonly text: string };

/**
 * What the user sees for a canvas error. Tool and template errors are programming errors: they
 * are logged, never shown. The raw native message is logged too, never shown.
 */
export function canvasMessageFor(event: CanvasErrorEvent): CanvasMessage | null {
  switch (event.code) {
    case "fileCorrupt":
    case "readFailed":
      return {
        tone: "error",
        text: "This page couldn't be opened. It's read-only, so nothing on it will be overwritten.",
      };
    case "saveFailed":
      return {
        tone: "error",
        text: "Couldn't save this page. Your strokes are still here, and saving is retried on your next stroke.",
      };
    case "recoveredFromBackup":
      return { tone: "warning", text: "This page was damaged, so its last good version was restored." };
    case "invalidTool":
    case "invalidTemplate":
      return null;
  }
}
