import UIKit.UIGestureRecognizerSubclass

/// Counts the fingers on the canvas and reports when a second one joins. It never recognizes,
/// delays or cancels a touch, and runs alongside every other gesture, so it keeps counting while a
/// finger erases or scrolls. (The tap recognizers can't do this: they fail as soon as the first
/// finger moves, and a failed recognizer receives no more touches.)
@MainActor
final class FingerCountObserver: UIGestureRecognizer, UIGestureRecognizerDelegate {
    var onSecondFinger: () -> Void = {}
    /// The last finger left the page.
    var onAllLifted: () -> Void = {}
    private var fingers = 0

    init() {
        super.init(target: nil, action: nil)
        allowedTouchTypes = [NSNumber(value: UITouch.TouchType.direct.rawValue)]
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
        delegate = self
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        let before = fingers
        fingers += touches.count
        if before < 2, fingers >= 2 {
            onSecondFinger()
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        lift(touches.count)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        lift(touches.count)
    }

    override func reset() {
        fingers = 0
    }

    /// When the last finger lifts, the observer fails, which resets it for the next touch.
    private func lift(_ count: Int) {
        fingers = max(0, fingers - count)
        if fingers == 0 {
            state = .failed
            onAllLifted()
        }
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }
}
