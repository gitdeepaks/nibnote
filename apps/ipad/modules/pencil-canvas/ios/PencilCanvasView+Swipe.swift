import ExpoModulesCore
import UIKit

/// Decides whether a page swipe may start. A separate object, because `UIView` already has its own
/// `gestureRecognizerShouldBegin(_:)`, so the canvas view can't be the swipes' delegate itself.
@MainActor
final class PageSwipeGate: NSObject, UIGestureRecognizerDelegate {
    private let allows: @MainActor () -> Bool

    init(allows: @escaping @MainActor () -> Bool) {
        self.allows = allows
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        allows()
    }

    /// The canvas's own scrolling keeps working alongside the swipe.
    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }
}

/// One-finger swipes turn the page. They never start while zoomed in (the swipe must pan
/// instead), while fingers draw ("any input"), or for the Pencil, which only ever writes.
extension PencilCanvasView {
    func installPageSwipes() {
        for direction in [UISwipeGestureRecognizer.Direction.left, .right] {
            let swipe = UISwipeGestureRecognizer(target: self, action: #selector(handlePageSwipe(_:)))
            swipe.direction = direction
            swipe.numberOfTouchesRequired = 1
            swipe.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.direct.rawValue)]
            swipe.delegate = pageSwipeGate
            canvasView.addGestureRecognizer(swipe)
        }
    }

    var allowsPageSwipe: Bool {
        page != nil && drawingPolicy == .pencilOnly && surface.allowsPageSwipe
    }

    @objc private func handlePageSwipe(_ swipe: UISwipeGestureRecognizer) {
        guard swipe.state == .ended else { return }
        let record = PageSwipeRecord()
        record.pageId = pageId
        record.direction = swipe.direction == .left ? "next" : "previous"
        onPageSwipe(record)
    }
}
