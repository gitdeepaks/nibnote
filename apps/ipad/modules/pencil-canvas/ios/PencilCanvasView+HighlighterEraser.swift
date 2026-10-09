import PencilKit
import UIKit

/// Wires "erase highlighter only" into the canvas: switching it on and off with the tool, keeping
/// PencilKit's drawing gesture off meanwhile, and one undo step per erase gesture.
extension PencilCanvasView {
    func installHighlighterEraser() {
        highlighterEraser.drawingVersion = { [weak self] in
            self?.drawingVersion ?? 0
        }
        highlighterEraser.onBegin = { [weak self] in
            self?.emitToolUsage(active: true)
        }
        highlighterEraser.onEnd = { [weak self] before, changed in
            guard let self else { return }
            lastTouchInContent = highlighterEraser.lastLocation
            if changed { registerEraseUndo(restoring: before) }
            emitToolUsage(active: false)
        }
    }

    /// The highlighter eraser runs while the tool is an eraser set to "highlighter only".
    func applyHighlighterEraser() {
        let configuration: HighlighterEraserInput.Configuration? =
            if case let .eraser(mode, width, true) = currentTool {
                HighlighterEraserInput.Configuration(mode: mode == .stroke ? .stroke : .pixel, width: width)
            } else {
                nil
            }
        let wanted = (configuration: configuration, policy: drawingPolicy)
        if let applied = appliedHighlighterEraserState, applied.configuration == wanted.configuration,
            applied.policy == wanted.policy {
            return
        }
        appliedHighlighterEraserState = wanted
        highlighterEraser.configure(configuration, policy: drawingPolicy)
        updateDrawingGesture()
    }

    /// PencilKit draws only on a ready page, and never while the highlighter eraser has the touches.
    func updateDrawingGesture() {
        canvasView.drawingGestureRecognizer.isEnabled = pageState == .ready && !highlighterEraser.isActive
    }

    /// One undo step for the whole gesture. Setting `drawing` registers nothing with PencilKit, so
    /// the step swaps whole drawings, and redo swaps them back.
    private func registerEraseUndo(restoring before: PKDrawing) {
        swapUndo(to: before, from: canvasView.drawing)
        canvasView.pageUndoManager.setActionName("Erase")
        scheduleDrawingChangedEvent()
    }

    func swapUndo(to target: PKDrawing, from current: PKDrawing) {
        canvasView.pageUndoManager.registerUndo(withTarget: self) { view in
            view.canvasView.drawing = target
            view.swapUndo(to: current, from: target)
            view.scheduleDrawingChangedEvent()
        }
    }
}
