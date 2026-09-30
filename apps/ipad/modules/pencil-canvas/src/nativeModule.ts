import type { PageSize, PageTemplate } from "@nibnote/shared";
import { NativeModule, requireNativeModule } from "expo";

// The PencilCanvas module itself (the view is typed in PencilCanvas.tsx). Event payloads and
// return values arrive untyped and are parsed by the callers before use.
type NativeModuleEvents = {
  readonly onDrawingSaved: (payload: object) => void;
  readonly onThumbnailWritten: (payload: object) => void;
};

// Expo's documented way to type a native module.
declare class PencilCanvasModule extends NativeModule<NativeModuleEvents> {
  renderThumbnail(pageId: string, drawingUri: string, pageSize: PageSize, template: PageTemplate): Promise<boolean>;
}

export const nativeModule = requireNativeModule<PencilCanvasModule>("PencilCanvas");
