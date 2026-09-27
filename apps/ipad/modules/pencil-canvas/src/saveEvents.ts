import { DrawingSavedEvent, ThumbnailWrittenEvent } from "@nibnote/shared";
import { NativeModule, requireNativeModule, type EventSubscription } from "expo";
import type { z } from "zod";

// Save events come from the module, not the view, so the final save when the editor closes still
// reaches JS after the canvas has unmounted. Payloads arrive untyped and are parsed before use.
type NativeSaveEvents = {
  readonly onDrawingSaved: (payload: object) => void;
  readonly onThumbnailWritten: (payload: object) => void;
};

// Expo's documented way to type a native module's events.
declare class PencilCanvasModule extends NativeModule<NativeSaveEvents> {}

const nativeModule = requireNativeModule<PencilCanvasModule>("PencilCanvas");

function parsed<Schema extends z.ZodType>(
  name: string,
  schema: Schema,
  listener: (event: z.output<Schema>) => void,
): (payload: object) => void {
  return (payload) => {
    const result = schema.safeParse(payload);
    if (result.success) {
      listener(result.data);
    } else {
      console.error(`PencilCanvas: invalid ${name} payload`, result.error.issues);
    }
  };
}

/** Fires after every successful save of any page, including flushes while unmounting. */
export function addDrawingSavedListener(listener: (event: DrawingSavedEvent) => void): EventSubscription {
  return nativeModule.addListener("onDrawingSaved", parsed("onDrawingSaved", DrawingSavedEvent, listener));
}

/** Fires when a page's thumbnail file (Caches/thumbs/<pageId>.png) has been rewritten. */
export function addThumbnailWrittenListener(listener: (event: ThumbnailWrittenEvent) => void): EventSubscription {
  return nativeModule.addListener(
    "onThumbnailWritten",
    parsed("onThumbnailWritten", ThumbnailWrittenEvent, listener),
  );
}
