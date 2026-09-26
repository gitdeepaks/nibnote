import PencilKit
import UIKit

/// Fits a fixed-size page into a `PKCanvasView`: zoom limits, centring, and the template underlay
/// that zooms with the ink. Layout work only runs when the page, template or viewport changes.
@MainActor
final class PageSurface {
    private(set) var pageSize = CGSize(width: 595, height: 842)
    private(set) var template: PageTemplateSpec = .blank
    private let canvasView: PKCanvasView
    private let underlay = UIView()
    private let tiledLayer = CATiledLayer()
    /// `CALayer.delegate` is weak, so the surface keeps the current drawer alive.
    private var drawer: TemplateTileDrawer?
    private var viewport: CGSize = .zero
    /// Until the user pinches, the page keeps fitting the width (React Native lays views out
    /// at a provisional size first, and rotation changes the width).
    private var userHasZoomed = false

    init(canvasView: PKCanvasView) {
        self.canvasView = canvasView
        underlay.isUserInteractionEnabled = false
        underlay.layer.addSublayer(tiledLayer)
        tiledLayer.tileSize = CGSize(width: 512, height: 512)
        // Enough detail for 4x zoom on a 2x or 3x screen without tiles going soft.
        tiledLayer.levelsOfDetail = 4
        tiledLayer.levelsOfDetailBias = 4
        canvasView.insertSubview(underlay, at: 0)
        installDrawer()
    }

    /// Returns true when the page geometry changed (callers reset zoom for a new page size).
    @discardableResult
    func configure(pageSize: CGSize, template: PageTemplateSpec) -> Bool {
        let sizeChanged = pageSize != self.pageSize
        guard sizeChanged || template != self.template else { return false }
        self.pageSize = pageSize
        self.template = template
        underlay.bounds = CGRect(origin: .zero, size: pageSize)
        tiledLayer.frame = underlay.bounds
        installDrawer()
        if sizeChanged {
            userHasZoomed = false
            resetZoom()
        }
        return sizeChanged
    }

    /// Call from `layoutSubviews`; cheap when the viewport size is unchanged.
    func viewportDidChange(to size: CGSize) {
        guard size != viewport, size.width > 0, size.height > 0 else { return }
        viewport = size
        canvasView.minimumZoomScale = PageGeometry.minimumZoom(page: pageSize, viewport: size)
        canvasView.maximumZoomScale = PageGeometry.maximumZoom
        if !userHasZoomed {
            resetZoom()
        } else {
            canvasView.zoomScale = min(max(canvasView.zoomScale, canvasView.minimumZoomScale), PageGeometry.maximumZoom)
            syncToZoom()
        }
    }

    /// Call from `scrollViewWillBeginZooming`: from now on the user's zoom is kept.
    func userWillZoom() {
        userHasZoomed = true
    }

    /// Call from `scrollViewDidZoom` so the content size, centring and template follow the pinch.
    func syncToZoom() {
        let zoom = canvasView.zoomScale
        let scaled = CGSize(width: pageSize.width * zoom, height: pageSize.height * zoom)
        canvasView.contentSize = scaled
        canvasView.contentInset = PageGeometry.centeringInsets(page: pageSize, zoom: zoom, viewport: viewport)
        underlay.transform = CGAffineTransform(scaleX: zoom, y: zoom)
        underlay.center = CGPoint(x: scaled.width / 2, y: scaled.height / 2)
    }

    private func resetZoom() {
        guard viewport != .zero else { return }
        canvasView.minimumZoomScale = PageGeometry.minimumZoom(page: pageSize, viewport: viewport)
        canvasView.zoomScale = PageGeometry.initialZoom(page: pageSize, viewport: viewport)
        syncToZoom()
        let insets = canvasView.contentInset
        canvasView.contentOffset = CGPoint(x: -insets.left, y: -insets.top)
    }

    private func installDrawer() {
        let next = TemplateTileDrawer(template: template, pageSize: pageSize)
        drawer = next
        tiledLayer.delegate = next
        tiledLayer.setNeedsDisplay()
    }
}
