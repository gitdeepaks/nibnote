import PencilKit
import UIKit

/// A `PKCanvasView` with its own undo history. PencilKit registers undo actions with the canvas's
/// `undoManager`; by default that comes from the responder chain and would be shared across pages.
final class PageCanvasView: PKCanvasView {
    let pageUndoManager = UndoManager()

    override var undoManager: UndoManager? {
        pageUndoManager
    }
}
