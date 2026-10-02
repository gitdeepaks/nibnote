import ExpoModulesCore
import PencilKit
import UIKit

extension PencilCanvasView: PKCanvasViewDelegate {
    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        drawingVersion += 1
        highlighterEraser.drawingDidChange()
        guard !isReplacingDrawing, pageState == .ready else { return }
        hasUnsavedChanges = true
        autosave.changeHappened()
        scheduleDrawingChangedEvent()
    }

    // Only drawing, erasing and the lasso call these; scrolling and zooming don't.
    func canvasViewDidBeginUsingTool(_ canvasView: PKCanvasView) {
        emitToolUsage(active: true)
    }

    func canvasViewDidEndUsingTool(_ canvasView: PKCanvasView) {
        emitToolUsage(active: false)
    }

    func scrollViewWillBeginZooming(_ scrollView: UIScrollView, with view: UIView?) {
        surface.userWillZoom()
    }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        surface.syncToZoom()
    }
}

extension PencilCanvasView {
    /// Coalesces bursts (stroke end + undo registration + save) into one event on the next
    /// main-actor turn, after PencilKit has registered the undo action.
    func scheduleDrawingChangedEvent() {
        guard !isDrawingChangedScheduled else { return }
        isDrawingChangedScheduled = true
        Task { [weak self] in
            self?.isDrawingChangedScheduled = false
            self?.emitDrawingChanged()
        }
    }

    /// Sends `onDrawingChanged` only when something JS can see actually changed.
    func emitDrawingChanged() {
        guard let page else { return }
        let record = DrawingChangedRecord()
        record.pageId = page.pageId
        record.strokeCount = canvasView.drawing.strokes.count
        record.canUndo = canvasView.pageUndoManager.canUndo
        record.canRedo = canvasView.pageUndoManager.canRedo
        record.hasUnsavedChanges = hasUnsavedChanges
        guard record != lastDrawingChanged else { return }
        lastDrawingChanged = record
        onDrawingChanged(record)
    }

    func emitError(pageId: String? = nil, code: String, message: String) {
        let record = CanvasErrorRecord()
        record.pageId = pageId ?? self.pageId
        record.code = code
        record.message = message
        onCanvasError(record)
    }

    /// Module-level events reach JS even while this view is unmounting. The app context outlives
    /// every view, so callers capture it instead of the view.
    static func emitModuleEvent(_ name: String, _ record: some Record, appContext: AppContext?) {
        guard let appContext,
            let module = appContext.moduleRegistry.get(moduleWithName: PencilCanvasModule.moduleName)
                as? PencilCanvasModule
        else { return }
        module.sendEvent(name, record.toDictionary(appContext: appContext))
    }

    func emitToolUsage(active: Bool) {
        isToolInUse = active
        let record = ToolUsageRecord()
        record.pageId = pageId
        record.active = active
        onToolUsage(record)
    }
}
