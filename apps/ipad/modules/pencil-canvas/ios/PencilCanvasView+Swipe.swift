import ExpoModulesCore
import UIKit

/// Decides whether a page swipe may start. A separate object, because `UIView` already has its own
/// `gestureRecognizerShouldBegin(_:)`, so the canvas view can't be the swipes' delegate itself.
@MainActor
final class PageSwipeGate: NSObject, UIGestureRecognizerDelegate {
    private let allows: @MainActor (_ touches: Int) -> Bool

    init(allows: @escaping @MainActor (_ touches: Int) -> Bool) {
        self.allows = allows
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard let swipe = gestureRecognizer as? UISwipeGestureRecognizer else { return false }
        return allows(swipe.numberOfTouchesRequired)
    }

    /// The canvas's own scrolling keeps working alongside the swipe.
    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }
}

/// Finger swipes turn the page: one finger with "Apple Pencil only", two when a finger draws
/// (`PageGeometry.pageSwipeTouches`). They never start while zoomed in (the swipe must pan
/// instead), or for the Pencil, which only ever writes.
extension PencilCanvasView {
    func installPageSwipes() {
        for touches in [1, 2] {
            for direction in [UISwipeGestureRecognizer.Direction.left, .right] {
                let swipe = UISwipeGestureRecognizer(target: self, action: #selector(handlePageSwipe(_:)))
                swipe.direction = direction
                swipe.numberOfTouchesRequired = touches
                swipe.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.direct.rawValue)]
                swipe.delegate = pageSwipeGate
                canvasView.addGestureRecognizer(swipe)
            }
        }
    }

    func allowsPageSwipe(touches: Int) -> Bool {
        page != nil && touches == PageGeometry.pageSwipeTouches(drawingPolicy: drawingPolicy)
            && surface.allowsPageSwipe
    }

    @objc private func handlePageSwipe(_ swipe: UISwipeGestureRecognizer) {
        guard swipe.state == .ended else { return }
        let record = PageSwipeRecord()
        record.pageId = pageId
        record.direction = swipe.direction == .left ? "next" : "previous"
        onPageSwipe(record)
    }
}
