import ExpoModulesCore
import UIKit

/// The finger taps' delegate. Lets them run alongside the canvas's own gestures and remembers where
/// the page sat when the first finger came down. A separate object, like `PageSwipeGate`, because
/// `UIView` already has its own `gestureRecognizerShouldBegin(_:)`.
@MainActor
final class FingerTapGate: NSObject, UIGestureRecognizerDelegate {
    private let viewport: @MainActor () -> FingerTap.Viewport
    private(set) var touchDownViewport: FingerTap.Viewport?

    init(viewport: @escaping @MainActor () -> FingerTap.Viewport) {
        self.viewport = viewport
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        if gestureRecognizer.numberOfTouches == 0 {
            touchDownViewport = viewport()
        }
        return true
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }
}

/// Two fingers tap to undo, three to redo, on the page only. Both recognizers watch every finger
/// touch without delaying or cancelling it, so writing, scrolling, zooming and page swipes behave as
/// before; `FingerTap` decides whether a recognized tap counts.
extension PencilCanvasView {
    func installFingerTaps() {
        let redo = makeFingerTap(fingers: 3)
        let undo = makeFingerTap(fingers: 2)
        // A three-finger tap also contains two fingers; undo waits until it is clearly not redo.
        undo.require(toFail: redo)
        // A second finger turns what the first one started into a tap or a scroll, so a finger
        // erasing highlighter stops and puts back what it erased.
        let fingers = FingerCountObserver()
        fingers.onSecondFinger = { [weak self] in
            self?.highlighterEraser.secondFingerDown()
        }
        canvasView.addGestureRecognizer(fingers)
    }

    var currentViewport: FingerTap.Viewport {
        FingerTap.Viewport(zoom: canvasView.zoomScale, offset: canvasView.contentOffset)
    }

    private func makeFingerTap(fingers: Int) -> UITapGestureRecognizer {
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleFingerTap(_:)))
        tap.numberOfTouchesRequired = fingers
        tap.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.direct.rawValue)]
        tap.cancelsTouchesInView = false
        tap.delaysTouchesEnded = false
        tap.delegate = fingerTapGate
        canvasView.addGestureRecognizer(tap)
        return tap
    }

    @objc private func handleFingerTap(_ tap: UITapGestureRecognizer) {
        guard tap.state == .ended, let start = fingerTapGate.touchDownViewport,
            let action = FingerTap.accept(
                fingers: tap.numberOfTouchesRequired, start: start, end: currentViewport,
                pageReady: pageState == .ready, toolInUse: isToolInUse)
        else { return }
        let applied =
            switch action {
            case .undo: undo()
            case .redo: redo()
            }
        let record = HistoryGestureRecord()
        record.pageId = pageId
        record.action = action == .undo ? "undo" : "redo"
        record.applied = applied
        onHistoryGesture(record)
    }
}
