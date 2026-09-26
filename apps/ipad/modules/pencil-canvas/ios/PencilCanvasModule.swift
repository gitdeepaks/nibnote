import ExpoModulesCore

/// `PencilCanvas` native view. The TypeScript contract lives in the build plan (Phase 1) and
/// packages/shared/src/canvas.ts; drawing bytes never cross the bridge, only file URIs and events.
public final class PencilCanvasModule: Module {
    public func definition() -> ModuleDefinition {
        Name("PencilCanvas")

        View(PencilCanvasView.self) {
            Events("onDrawingChanged", "onPencilAction", "onCanvasError")

            Prop("pageId") { (view: PencilCanvasView, value: String) in
                view.pageId = value
            }
            Prop("drawingFileUri") { (view: PencilCanvasView, value: String) in
                view.drawingFileUri = value
            }
            Prop("pageSize") { (view: PencilCanvasView, value: PageSizeRecord) in
                view.setPageSize(value)
            }
            Prop("template") { (view: PencilCanvasView, value: TemplateRecord) in
                view.setTemplate(value)
            }
            Prop("tool") { (view: PencilCanvasView, value: ToolRecord) in
                view.setTool(value)
            }
            Prop("drawingPolicy") { (view: PencilCanvasView, value: String) in
                view.setDrawingPolicy(value)
            }
            Prop("debugSystemToolPicker") { (view: PencilCanvasView, value: Bool) in
                view.showsSystemToolPicker = value
            }

            OnViewDidUpdateProps { (view: PencilCanvasView) in
                view.applyProps()
            }

            // View functions touch UIKit, so they run on the main queue. SDK 58 only offers
            // main-actor `async` view functions to SwiftUI views, so `save` resolves a Promise.
            AsyncFunction("undo") { (view: PencilCanvasView) in
                MainActor.assumeIsolated { view.undo() }
            }.runOnQueue(.main)
            AsyncFunction("redo") { (view: PencilCanvasView) in
                MainActor.assumeIsolated { view.redo() }
            }.runOnQueue(.main)
            AsyncFunction("save") { (view: PencilCanvasView, promise: Promise) in
                MainActor.assumeIsolated { view.save(resolving: promise) }
            }.runOnQueue(.main)
            AsyncFunction("debugFillStrokes") { (view: PencilCanvasView, count: Int) in
                MainActor.assumeIsolated { view.debugFillStrokes(count: count) }
            }.runOnQueue(.main)
        }
    }
}
