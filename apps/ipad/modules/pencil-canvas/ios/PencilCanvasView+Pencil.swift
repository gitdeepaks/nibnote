import ExpoModulesCore
import UIKit

/// Apple Pencil's double-tap and squeeze. Native reports the gesture, the user's system preference
/// and where the Pencil is; JS decides what happens (`pencilResponse` in packages/shared).
extension PencilCanvasView: UIPencilInteractionDelegate {
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) {
        emitPencilAction(kind: "tap", preferred: UIPencilInteraction.preferredTapAction, hover: tap.hoverPose)
    }

    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze) {
        guard squeeze.phase == .ended else { return }
        emitPencilAction(
            kind: "squeeze", preferred: UIPencilInteraction.preferredSqueezeAction, hover: squeeze.hoverPose)
    }
}

extension PencilCanvasView {
    /// Remembers where PencilKit's tools touch the page, for the palette on iPads without hover. Read
    /// while the touch moves: once it has ended, the gesture no longer reports where it was.
    @objc func trackDrawingTouch(_ recognizer: UIGestureRecognizer) {
        switch recognizer.state {
        case .began, .changed:
            lastTouchInContent = recognizer.location(in: canvasView)
        default:
            break
        }
    }

    /// Plays the light tap on Apple Pencil Pro after a tool change made with the Pencil, at the spot
    /// it happened when known. The system decides where it plays and honours the user's haptics
    /// setting; other Pencils and the iPad itself play nothing.
    func toolFeedback(at location: CanvasPointRecord?) {
        if let location {
            toolFeedbackGenerator.impactOccurred(at: CGPoint(x: location.pointX, y: location.pointY))
        } else {
            toolFeedbackGenerator.impactOccurred()
        }
    }

    /// Development builds only: sends a Pencil action as if the Pencil had done it, for testing the
    /// palette on iPads without a Pencil Pro. Uses the last touch, since there is no hover.
    func debugPencilAction(kind: String) {
        #if DEBUG
        let preferred: UIPencilPreferredAction = kind == "squeeze" ? .showContextualPalette : .showColorPalette
        emitPencilAction(kind: kind == "squeeze" ? "squeeze" : "tap", preferred: preferred, hover: nil)
        #endif
    }

    private func emitPencilAction(kind: String, preferred: UIPencilPreferredAction, hover: UIPencilHoverPose?) {
        // A tool change or a palette may follow, so the haptic is ready without delay.
        toolFeedbackGenerator.prepare()
        let lastTouch = lastTouchInContent.map { canvasView.convert($0, to: self) }
        let record = PencilActionRecord()
        record.pageId = pageId
        record.kind = kind
        record.preferredAction = PencilActions.name(for: preferred)
        record.location = PencilLocation.choose(hover: hover?.location, lastTouch: lastTouch, visible: bounds)
            .map { point in
                let location = CanvasPointRecord()
                location.pointX = point.x
                location.pointY = point.y
                return location
            }
        onPencilAction(record)
    }
}
