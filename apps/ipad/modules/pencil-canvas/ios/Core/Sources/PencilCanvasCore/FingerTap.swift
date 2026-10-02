import CoreGraphics

/// Finger taps on the page: two fingers undo, three redo. The tap recognizers run alongside
/// pinch-zoom, scrolling and page swipes, so a tap only counts when the page stayed where it was
/// (a pinch or a scroll that started under the fingers moves it) and nothing was being drawn.
enum FingerTap {
    enum Action: Equatable, Sendable {
        case undo
        case redo
    }

    /// Where the page sat: the canvas's zoom and scroll offset.
    struct Viewport: Equatable, Sendable {
        let zoom: CGFloat
        let offset: CGPoint
    }

    /// A zoom change smaller than this fraction is noise, not a pinch.
    static let zoomTolerance: CGFloat = 0.005
    /// A scroll smaller than this, in screen points, is noise, not a scroll.
    static let offsetTolerance: CGFloat = 2

    static func action(fingers: Int) -> Action? {
        switch fingers {
        case 2: .undo
        case 3: .redo
        default: nil
        }
    }

    /// Whether the page stayed still from the first touch to the tap.
    static func pageStayedStill(from start: Viewport, to end: Viewport) -> Bool {
        guard start.zoom > 0 else { return false }
        let zoomChange = abs(end.zoom - start.zoom) / start.zoom
        let offsetChange = hypot(end.offset.x - start.offset.x, end.offset.y - start.offset.y)
        return zoomChange <= zoomTolerance && offsetChange <= offsetTolerance
    }

    /// The action for a recognized tap, or nil when it must be ignored.
    static func accept(
        fingers: Int, start: Viewport, end: Viewport, pageReady: Bool, toolInUse: Bool
    ) -> Action? {
        guard pageReady, !toolInUse, pageStayedStill(from: start, to: end) else { return nil }
        return action(fingers: fingers)
    }
}
