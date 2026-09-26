import PencilKit
import XCTest

@testable import PencilCanvasCore

final class PageGeometryTests: XCTestCase {
    private let a4Page = CGSize(width: 595, height: 842)
    private let whiteboard = CGSize(width: 2526, height: 1785)
    private let portraitIPad = CGSize(width: 834, height: 1194)
    private let landscapeIPad = CGSize(width: 1194, height: 834)

    func testMinimumZoomShowsTheWholePage() {
        let zoom = PageGeometry.minimumZoom(page: whiteboard, viewport: landscapeIPad)
        XCTAssertEqual(zoom, min(1194.0 / 2526, 834.0 / 1785), accuracy: 0.0001)
        XCTAssertLessThanOrEqual(whiteboard.width * zoom, landscapeIPad.width + 0.001)
        XCTAssertLessThanOrEqual(whiteboard.height * zoom, landscapeIPad.height + 0.001)
    }

    func testInitialZoomFillsTheWidthWithinLimits() {
        XCTAssertEqual(PageGeometry.initialZoom(page: a4Page, viewport: portraitIPad), 834.0 / 595, accuracy: 0.0001)
        let tiny = CGSize(width: 50, height: 50)
        XCTAssertEqual(PageGeometry.initialZoom(page: tiny, viewport: portraitIPad), PageGeometry.maximumZoom)
    }

    func testCentresASmallPageAndPinsALargeOne() {
        let small = PageGeometry.centeringInsets(page: a4Page, zoom: 0.5, viewport: portraitIPad)
        XCTAssertEqual(small.left, (834 - 297.5) / 2, accuracy: 0.001)
        XCTAssertEqual(small.top, (1194 - 421) / 2, accuracy: 0.001)
        let large = PageGeometry.centeringInsets(page: a4Page, zoom: 3, viewport: portraitIPad)
        XCTAssertEqual(large, .zero)
    }

    func testDegenerateSizesFallBackToOne() {
        XCTAssertEqual(PageGeometry.minimumZoom(page: .zero, viewport: portraitIPad), 1)
        XCTAssertEqual(PageGeometry.initialZoom(page: a4Page, viewport: .zero), 1)
    }
}

final class PageTemplateTests: XCTestCase {
    func testParsesTemplates() {
        XCTAssertEqual(PageTemplateSpec.parse(kind: "blank", spacingPt: nil), .blank)
        XCTAssertEqual(PageTemplateSpec.parse(kind: "cornell", spacingPt: nil), .cornell)
        XCTAssertEqual(PageTemplateSpec.parse(kind: "lined", spacingPt: 24), .lined(spacing: 24))
        XCTAssertEqual(PageTemplateSpec.parse(kind: "grid", spacingPt: 20), .grid(spacing: 20))
        XCTAssertEqual(PageTemplateSpec.parse(kind: "dotted", spacingPt: 16), .dotted(spacing: 16))
    }

    func testRejectsInvalidTemplates() {
        XCTAssertNil(PageTemplateSpec.parse(kind: "lined", spacingPt: nil))
        XCTAssertNil(PageTemplateSpec.parse(kind: "grid", spacingPt: 1))
        XCTAssertNil(PageTemplateSpec.parse(kind: "dotted", spacingPt: .infinity))
        XCTAssertNil(PageTemplateSpec.parse(kind: "music", spacingPt: 10))
    }

    func testStepsOnlyCoverTheVisibleArea() {
        // Lines at 20, 40, 60, ... up to 1000; a tile from y=95 to y=205 sees 100, 120, ..., 200.
        let range = TemplateRenderer.steps(start: 20, end: 1000, spacing: 20, low: 95, high: 205)
        XCTAssertEqual(range, 4...9)
        XCTAssertNil(TemplateRenderer.steps(start: 20, end: 1000, spacing: 20, low: 1200, high: 1300))
        XCTAssertNil(TemplateRenderer.steps(start: 20, end: 1000, spacing: 0, low: 0, high: 100))
    }

    func testRendersEveryTemplateWithoutCrashing() {
        let page = CGSize(width: 595, height: 842)
        let templates: [PageTemplateSpec] = [
            .blank, .lined(spacing: 24), .grid(spacing: 20), .dotted(spacing: 16), .cornell
        ]
        for template in templates {
            let request = ThumbnailRequest(url: URL(fileURLWithPath: "/unused"), pageSize: page, template: template)
            let png = DrawingStore.renderThumbnail(drawing: PKDrawing(), request: request)
            XCTAssertGreaterThan(png.count, 0, "\(template)")
        }
    }
}

final class SyntheticStrokesTests: XCTestCase {
    func testGeneratesTheRequestedStrokesInsideThePage() {
        let page = CGSize(width: 2526, height: 1785)
        let drawing = SyntheticStrokes.drawing(count: 2000, pageSize: page)
        XCTAssertEqual(drawing.strokes.count, 2000)
        XCTAssertTrue(CGRect(origin: .zero, size: page).insetBy(dx: -5, dy: -5).contains(drawing.bounds))
        XCTAssertEqual(SyntheticStrokes.drawing(count: 0, pageSize: page).strokes.count, 0)
    }
}

final class PageSurfaceTests: XCTestCase {
    /// Regression: React Native lays the view out at a provisional width first. Until the user
    /// zooms, the page must keep filling the final width, not the provisional one.
    @MainActor
    func testFitsTheFinalWidthAfterAProvisionalLayout() {
        let canvas = PKCanvasView()
        let surface = PageSurface(canvasView: canvas)
        surface.viewportDidChange(to: CGSize(width: 669, height: 700))
        surface.viewportDidChange(to: CGSize(width: 834, height: 900))
        XCTAssertEqual(canvas.zoomScale, 834.0 / 595, accuracy: 0.001)
        XCTAssertEqual(canvas.contentSize.width, 834, accuracy: 0.5)
    }

    @MainActor
    func testKeepsTheUsersZoomWhenTheViewportChanges() {
        let canvas = PKCanvasView()
        let surface = PageSurface(canvasView: canvas)
        surface.viewportDidChange(to: CGSize(width: 834, height: 900))
        surface.userWillZoom()
        canvas.zoomScale = 2.5
        surface.viewportDidChange(to: CGSize(width: 1194, height: 700))
        XCTAssertEqual(canvas.zoomScale, 2.5, accuracy: 0.001)
    }

    @MainActor
    func testANewPageSizeFitsAgainEvenAfterUserZoom() {
        let canvas = PKCanvasView()
        let surface = PageSurface(canvasView: canvas)
        surface.viewportDidChange(to: CGSize(width: 1194, height: 700))
        surface.userWillZoom()
        canvas.zoomScale = 3
        surface.configure(pageSize: CGSize(width: 2526, height: 1785), template: .grid(spacing: 20))
        XCTAssertEqual(canvas.zoomScale, PageGeometry.initialZoom(
            page: CGSize(width: 2526, height: 1785), viewport: CGSize(width: 1194, height: 700)), accuracy: 0.001)
    }
}

final class PageCanvasViewTests: XCTestCase {
    @MainActor
    func testEachCanvasHasItsOwnUndoHistory() {
        let first = PageCanvasView()
        let second = PageCanvasView()
        XCTAssertTrue(first.undoManager === first.pageUndoManager)
        XCTAssertFalse(first.undoManager === second.undoManager)
    }
}
