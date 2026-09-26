import ExpoModulesCore
import PencilKit
import UIKit

extension PencilCanvasView: PKCanvasViewDelegate {
    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        guard !isReplacingDrawing, pageState == .ready else { return }
        hasUnsavedChanges = true
        autosave.changeHappened()
        scheduleDrawingChangedEvent()
    }

    func scrollViewWillBeginZooming(_ scrollView: UIScrollView, with view: UIView?) {
        surface.userWillZoom()
    }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        surface.syncToZoom()
    }
}

extension PencilCanvasView: UIPencilInteractionDelegate {
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) {
        emitPencilAction(kind: "tap", preferred: UIPencilInteraction.preferredTapAction)
    }

    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze) {
        guard squeeze.phase == .ended else { return }
        emitPencilAction(kind: "squeeze", preferred: UIPencilInteraction.preferredSqueezeAction)
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

    private func emitPencilAction(kind: String, preferred: UIPencilPreferredAction) {
        let record = PencilActionRecord()
        record.pageId = pageId
        record.kind = kind
        record.preferredAction = PencilActions.name(for: preferred)
        onPencilAction(record)
    }
}
