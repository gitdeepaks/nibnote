import ExpoModulesCore

/// `PencilCanvas` native view. The TypeScript contract lives in the build plan (Phase 1) and
/// packages/shared/src/canvas.ts; drawing bytes never cross the bridge, only file URIs and events.
public final class PencilCanvasModule: Module {
    static let moduleName = "PencilCanvas"
    private static let viewEvents = [
        "onDrawingChanged", "onPencilAction", "onCanvasError", "onPageSwipe", "onToolUsage", "onHistoryGesture",
        "onToolFeedback"
    ]
    /// Rebuilds thumbnails for pages that aren't on a canvas (after iOS purges the Caches folder).
    /// An actor, so the Sendable module function can share it without capturing the module.
    private static let thumbnails = ThumbnailWriter()

    public func definition() -> ModuleDefinition {
        Name(Self.moduleName)

        // Save events belong to the module, not the view: the final save when the editor closes
        // completes after the view has left the window, and the database must still hear about it.
        Events("onDrawingSaved", "onThumbnailWritten")

        // Renders a page's missing thumbnail from its drawing file, without mounting a canvas.
        AsyncFunction("renderThumbnail") { (id: String, uri: String, size: PageSizeRecord, template: TemplateRecord) in
            try await Self.renderThumbnail(pageId: id, drawingUri: uri, pageSize: size, template: template)
        }

        Self.pencilCanvasView()

        // The toolbar's ink preview: one sample stroke in the real PencilKit ink.
        View(StrokePreviewView.self) {
            Prop("tool") { (view: StrokePreviewView, value: ToolRecord) in
                view.setTool(value)
            }
        }
    }

    /// The page canvas: props in, events out, and the functions the editor calls on it.
    private static func pencilCanvasView() -> ViewDefinition<PencilCanvasView> {
        View(PencilCanvasView.self) {
            Events(Self.viewEvents)

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
                MainActor.assumeIsolated { _ = view.undo() }
            }.runOnQueue(.main)
            AsyncFunction("redo") { (view: PencilCanvasView) in
                MainActor.assumeIsolated { _ = view.redo() }
            }.runOnQueue(.main)
            AsyncFunction("save") { (view: PencilCanvasView, promise: Promise) in
                MainActor.assumeIsolated { view.save(resolving: promise) }
            }.runOnQueue(.main)
            AsyncFunction("debugFillStrokes") { (view: PencilCanvasView, count: Int, mixed: Bool) in
                MainActor.assumeIsolated { view.debugFillStrokes(count: count, mixed: mixed) }
            }.runOnQueue(.main)
            AsyncFunction("debugPencilAction") { (view: PencilCanvasView, kind: String) in
                MainActor.assumeIsolated { view.debugPencilAction(kind: kind) }
            }.runOnQueue(.main)
        }
    }

    /// Resolves false when there is nothing to render (no drawing file, or an invalid page). The app
    /// reloads the page's image itself when this resolves true.
    private static func renderThumbnail(
        pageId: String, drawingUri: String, pageSize: PageSizeRecord, template: TemplateRecord
    ) async throws -> Bool {
        guard let drawingURL = URL(string: drawingUri), drawingURL.isFileURL, !pageId.isEmpty,
            let spec = PageTemplateSpec.parse(kind: template.kind, spacingPt: template.spacingPt),
            pageSize.widthPt > 0, pageSize.heightPt > 0
        else { return false }
        let request = ThumbnailRequest(
            url: PencilCanvasView.thumbnailURL(pageId: pageId),
            pageSize: CGSize(width: pageSize.widthPt, height: pageSize.heightPt),
            template: spec)
        return try await thumbnails.regenerate(from: drawingURL, request: request)
    }
}
