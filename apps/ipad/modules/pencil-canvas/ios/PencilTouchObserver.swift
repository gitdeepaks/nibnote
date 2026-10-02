import UIKit.UIGestureRecognizerSubclass

/// Watches Apple Pencil touches anywhere in the window (the toolbar, the palette, popovers) and
/// reports where one lifted, so a tool change it made can play the Pencil Pro haptic. Attached to
/// the window; it never recognizes, delays or cancels a touch, and runs alongside every gesture.
@MainActor
final class PencilTouchObserver: UIGestureRecognizer, UIGestureRecognizerDelegate {
    /// A Pencil touch began (the haptic can get ready).
    var onBegan: () -> Void = {}
    /// A Pencil touch lifted at this point, in the window's coordinates, on this view.
    var onEnded: (_ location: CGPoint, _ view: UIView?) -> Void = { _, _ in }
    private var touches = 0

    init() {
        super.init(target: nil, action: nil)
        allowedTouchTypes = [NSNumber(value: UITouch.TouchType.pencil.rawValue)]
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
        delegate = self
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        self.touches += touches.count
        onBegan()
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        for touch in touches {
            onEnded(touch.location(in: nil), touch.view)
        }
        lift(touches.count)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        lift(touches.count)
    }

    override func reset() {
        touches = 0
    }

    /// When the last touch lifts, the observer fails, which resets it for the next touch.
    private func lift(_ count: Int) {
        touches = max(0, touches - count)
        if touches == 0 {
            state = .failed
        }
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }
}
