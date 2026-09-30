import CoreGraphics
import PencilKit
import UIKit

/// Zoom limits and centring for a fixed-size page inside a scrolling viewport.
enum PageGeometry {
    static let maximumZoom: CGFloat = 4

    /// Smallest zoom: the whole page is visible. There is no zooming out past the page,
    /// so there is never an empty area that looks writable but isn't.
    static func minimumZoom(page: CGSize, viewport: CGSize) -> CGFloat {
        guard page.width > 0, page.height > 0, viewport.width > 0, viewport.height > 0 else { return 1 }
        return min(min(viewport.width / page.width, viewport.height / page.height), maximumZoom)
    }

    /// Opening zoom: the page fills the viewport width, like paper held at reading distance.
    static func initialZoom(page: CGSize, viewport: CGSize) -> CGFloat {
        guard page.width > 0, viewport.width > 0 else { return 1 }
        let fitWidth = viewport.width / page.width
        return min(max(fitWidth, minimumZoom(page: page, viewport: viewport)), maximumZoom)
    }

    /// A finger swipe turns the page only while the whole page width is on screen. Zoomed in, a
    /// horizontal swipe must pan the page instead.
    static func allowsPageSwipe(page: CGSize, zoom: CGFloat, viewport: CGSize) -> Bool {
        guard page.width > 0, viewport.width > 0 else { return false }
        return page.width * zoom <= viewport.width + 0.5
    }

    /// How many fingers turn the page. With "Apple Pencil only" a finger never draws, so one finger
    /// swipes. When a finger draws too, one finger is writing, so the swipe takes two.
    static func pageSwipeTouches(drawingPolicy: PKCanvasViewDrawingPolicy) -> Int {
        drawingPolicy == .anyInput ? 2 : 1
    }

    /// Insets that keep the page centred when it is smaller than the viewport.
    static func centeringInsets(page: CGSize, zoom: CGFloat, viewport: CGSize) -> UIEdgeInsets {
        let horizontal = max(0, (viewport.width - page.width * zoom) / 2)
        let vertical = max(0, (viewport.height - page.height * zoom) / 2)
        return UIEdgeInsets(top: vertical, left: horizontal, bottom: vertical, right: horizontal)
    }
}
