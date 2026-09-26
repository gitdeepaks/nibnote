import CoreGraphics
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

    /// Insets that keep the page centred when it is smaller than the viewport.
    static func centeringInsets(page: CGSize, zoom: CGFloat, viewport: CGSize) -> UIEdgeInsets {
        let horizontal = max(0, (viewport.width - page.width * zoom) / 2)
        let vertical = max(0, (viewport.height - page.height * zoom) / 2)
        return UIEdgeInsets(top: vertical, left: horizontal, bottom: vertical, right: horizontal)
    }
}
