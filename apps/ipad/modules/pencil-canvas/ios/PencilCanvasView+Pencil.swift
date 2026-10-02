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

    func installToolFeedback() {
        pencilTouchObserver.onBegan = { [weak self] in
            self?.toolFeedbackGenerator.prepare()
        }
        pencilTouchObserver.onEnded = { [weak self] location, view in
            guard let self else { return }
            // A Pencil lifting from the page is writing, not choosing a tool.
            if let view, view.isDescendant(of: canvasView) { return }
            lastPencilEvent = PencilEvent(
                time: CACurrentMediaTime(), location: convert(location, from: nil), source: "touch")
        }
    }

    /// Plays the light tap on Apple Pencil Pro when the tool just changed because of the Pencil, at
    /// the spot it happened. The system plays it only on Pencil Pro and honours the user's haptics
    /// setting. Development builds report each one, so the rule can be checked with any Pencil.
    func playToolFeedback(after previous: CanvasToolSpec?) {
        guard let event = lastPencilEvent,
            ToolFeedbackRule.shouldPlay(
                previous: previous, next: currentTool, lastPencilEvent: event.time, now: CACurrentMediaTime())
        else { return }
        // One Pencil tap plays once, even if it changes the tool twice.
        lastPencilEvent = nil
        if let location = event.location {
            toolFeedbackGenerator.impactOccurred(at: location)
        } else {
            toolFeedbackGenerator.impactOccurred()
        }
        #if DEBUG
        let record = ToolFeedbackRecord()
        record.pageId = pageId
        record.source = event.source
        onToolFeedback(record)
        #endif
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
        let location = PencilLocation.choose(hover: hover?.location, lastTouch: lastTouch, visible: bounds)
        lastPencilEvent = PencilEvent(time: CACurrentMediaTime(), location: location, source: kind)
        let record = PencilActionRecord()
        record.pageId = pageId
        record.kind = kind
        record.preferredAction = PencilActions.name(for: preferred)
        record.location = location
            .map { point in
                let location = CanvasPointRecord()
                location.pointX = point.x
                location.pointY = point.y
                return location
            }
        onPencilAction(record)
    }
}

/// A Pencil tap outside the page, or a double-tap or squeeze, in this view's coordinates.
struct PencilEvent {
    let time: CFTimeInterval
    let location: CGPoint?
    /// "touch", "tap" (double-tap) or "squeeze", for the development report.
    let source: String
}
