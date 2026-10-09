import PencilKit
import UIKit

/// Shape snapping: a pen, pencil or highlighter stroke that ends with the Pencil held still becomes
/// a clean line, oval, rectangle or triangle when it lifts. While the Pencil rests, the shape shows
/// over the hand-drawn stroke. One undo brings the hand stroke back; a second removes it.
extension PencilCanvasView {
    /// How long after a touch lifts PencilKit may take to add its stroke to the drawing.
    private static let strokeArrival: TimeInterval = 0.6

    func installShapeSnapping() {
        canvasView.addGestureRecognizer(holdObserver)
        shapePreview.fillColor = nil
        shapePreview.lineCap = .round
        shapePreview.lineJoin = .round
        shapePreview.isHidden = true
        // Above the ink, below the eraser's cursor.
        shapePreview.zPosition = 900
        canvasView.layer.addSublayer(shapePreview)
        holdObserver.onRest = { [weak self] points in
            self?.showShapePreview(for: points)
        }
        holdObserver.onRestEnded = { [weak self] in
            self?.shapePreview.isHidden = true
        }
    }

    /// The hold is watched only on touches that draw: the Pencil, and fingers when they draw too.
    func applyShapeSnapping() {
        let pencil = NSNumber(value: UITouch.TouchType.pencil.rawValue)
        let finger = NSNumber(value: UITouch.TouchType.direct.rawValue)
        holdObserver.allowedTouchTypes = drawingPolicy == .anyInput ? [pencil, finger] : [pencil]
        holdObserver.isEnabled = shapeSnapping
        if !shapeSnapping { shapePreview.isHidden = true }
    }

    /// The colour and width of the tool that snaps, or nil for tools that don't (eraser, lasso).
    private var snappingInk: (color: RGBAColor, width: CGFloat)? {
        switch currentTool {
        case let .ink(_, color, width): (color, width)
        case let .highlighter(color, width): (color, width)
        case .eraser, .lasso: nil
        }
    }

    /// While the Pencil rests, shows the shape the stroke will become, over the hand-drawn stroke.
    private func showShapePreview(for viewPoints: [CGPoint]) {
        guard pageState == .ready, let ink = snappingInk else { return }
        let zoom = max(canvasView.zoomScale, 0.01)
        let pagePoints = viewPoints.map { CGPoint(x: $0.x / zoom, y: $0.y / zoom) }
        guard let shape = ShapeFit.fit(pagePoints, zoom: zoom) else { return }
        let outline = ShapeOutline.exactPoints(of: shape, spacing: ShapeStroke.spacing(zoom: zoom))
        let path = CGMutablePath()
        path.addLines(between: outline.map { CGPoint(x: $0.x * zoom, y: $0.y * zoom) })
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        shapePreview.path = path
        shapePreview.strokeColor =
            UIColor(red: ink.color.red, green: ink.color.green, blue: ink.color.blue, alpha: 1).cgColor
        shapePreview.lineWidth = max(1.5, ink.width * 0.6 * zoom)
        shapePreview.isHidden = false
        CATransaction.commit()
    }

    /// Called whenever the drawing changed: if exactly one stroke was just added and its touch
    /// ended held, replaces it with the shape it is closest to, if any.
    func snapShapeIfHeld() {
        let strokes = canvasView.drawing.strokes
        // Updated first: replacing the stroke below changes the drawing again, and must not snap twice.
        let added = strokes.count - strokeCountAtLastChange
        strokeCountAtLastChange = strokes.count
        let zoom = canvasView.zoomScale
        guard shapeSnapping, !isReplacingDrawing, pageState == .ready, added == 1, snappingInk != nil,
            let stroke = strokes.last, holdObserver.takeHeldLift(within: Self.strokeArrival),
            let shape = ShapeFit.fit(ShapeStroke.pagePoints(of: stroke, zoom: zoom), zoom: zoom)
        else { return }
        replaceLastStroke(with: shape, version: drawingVersion, attempt: 0)
    }

    /// PencilKit registers the stroke's own undo in the run-loop pass that reports the change.
    /// Registering ours inside that pass puts both in one undo group, and a single undo then removes
    /// the stroke altogether. So the swap waits until PencilKit's group has closed: the first undo
    /// brings the hand stroke back, the second removes it. It always waits at least once, in case
    /// PencilKit registers only after reporting the change; if the group never closes, the stroke
    /// stays as drawn.
    private func replaceLastStroke(with shape: ShapeFit.Shape, version: Int, attempt: Int) {
        let manager = canvasView.pageUndoManager
        guard attempt > 0, manager.groupingLevel == 0 else {
            guard attempt < 10 else { return }
            Task { [weak self] in
                try? await Task.sleep(for: .milliseconds(8))
                self?.replaceLastStroke(with: shape, version: version, attempt: attempt + 1)
            }
            return
        }
        let before = canvasView.drawing
        // Nothing else may have changed the page meanwhile (another stroke, an undo, a new page).
        guard drawingVersion == version, pageState == .ready, let stroke = before.strokes.last else { return }
        let snapped = ShapeStroke.make(shape, like: stroke, look: shapeLook, zoom: canvasView.zoomScale)
        let after = PKDrawing(strokes: before.strokes.dropLast() + [snapped])
        canvasView.drawing = after
        swapUndo(to: before, from: after)
        manager.setActionName("Snap to Shape")
        scheduleDrawingChangedEvent()
        announceSnap(to: shape)
    }

    /// Apple Pencil Pro taps when the shape lands (other Pencils have no motor), and VoiceOver says
    /// what the stroke became, because the change is otherwise only visible.
    private func announceSnap(to shape: ShapeFit.Shape) {
        let center = CGPoint(x: canvasView.bounds.midX, y: canvasView.bounds.midY)
        shapeFeedback.pathCompleted(at: canvasView.convert(lastTouchInContent ?? center, to: self))
        if UIAccessibility.isVoiceOverRunning {
            UIAccessibility.post(notification: .announcement, argument: "Snapped to \(shape.spokenName)")
        }
    }
}
