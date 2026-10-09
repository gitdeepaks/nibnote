import PencilKit
import XCTest

@testable import PencilCanvasCore

final class ShapeStrokeTests: XCTestCase {
    private let date = Date(timeIntervalSinceReferenceDate: 800_000_000)
    private let rectangle = ShapeFit.Shape.rectangle(
        center: CGPoint(x: 200, y: 150), half: CGSize(width: 80, height: 50), rotation: 0)

    /// A hand stroke along `locations` that tapers: thin at both ends, `size` in the middle.
    private func handStroke(_ locations: [CGPoint], ink: PKInk, size: CGFloat = 6) -> PKStroke {
        let points = locations.enumerated().map { index, location in
            let middle = index > 2 && index < locations.count - 3
            return PKStrokePoint(
                location: location, timeOffset: TimeInterval(index) * 0.01,
                size: CGSize(width: middle ? size : 1, height: middle ? size : 1), opacity: middle ? 0.8 : 0.3,
                force: 0.7, azimuth: 0.4, altitude: 1.1)
        }
        let path = PKStrokePath(controlPoints: points, creationDate: date)
        return PKStroke(ink: ink, path: path, transform: .identity, mask: nil, randomSeed: 42)
    }

    private var drawnBox: PKStroke {
        handStroke(ShapeSamples.box(CGRect(x: 120, y: 100, width: 160, height: 100)), ink: PKInk(.pen, color: .blue))
    }

    func testTheShapeKeepsTheInkSeedAndDateOfTheStrokeItReplaces() {
        let highlighter = PKInk(.marker, color: UIColor.yellow.withAlphaComponent(0.5))
        let original = handStroke(ShapeSamples.box(CGRect(x: 120, y: 100, width: 160, height: 100)), ink: highlighter)
        let shape = ShapeStroke.make(rectangle, like: original, look: .clean, zoom: 1)
        XCTAssertEqual(shape.ink.inkType, .marker)
        XCTAssertEqual(shape.ink.color.cgColor.alpha, 0.5, accuracy: 0.001)
        XCTAssertEqual(shape.randomSeed, 42)
        XCTAssertEqual(shape.path.creationDate, date)
        XCTAssertEqual(shape.transform, .identity)
        XCTAssertNil(shape.mask)
    }

    func testEveryPointHasTheWidthOfTheMiddleOfTheHandStroke() {
        let shape = ShapeStroke.make(rectangle, like: drawnBox, look: .clean, zoom: 1)
        XCTAssertGreaterThan(shape.path.count, 100)
        for point in shape.path {
            XCTAssertEqual(point.size.width, 6, accuracy: 0.001, "not the tapered ends")
            XCTAssertEqual(point.opacity, 0.8, accuracy: 0.001)
            XCTAssertEqual(point.azimuth, 0.4, accuracy: 0.001)
        }
    }

    func testTheStrokeRunsAlongTheShape() {
        let shape = ShapeStroke.make(rectangle, like: drawnBox, look: .clean, zoom: 1)
        let expected = ShapeOutline.exactPoints(of: rectangle)
        XCTAssertEqual(shape.path.count, expected.count)
        // PencilKit stores locations in single precision.
        for (point, location) in zip(shape.path, expected) {
            XCTAssertEqual(point.location.x, location.x, accuracy: 0.001)
            XCTAssertEqual(point.location.y, location.y, accuracy: 0.001)
        }
        let bounds = shape.renderBounds
        XCTAssertEqual(bounds.midX, 200, accuracy: 2)
        XCTAssertEqual(bounds.width, 160, accuracy: 12, "the shape's width plus the ink's")
    }

    func testTheHandDrawnLookIsRepeatableForTheSameStroke() {
        let first = ShapeStroke.make(rectangle, like: drawnBox, look: .handDrawn, zoom: 1)
        let second = ShapeStroke.make(rectangle, like: drawnBox, look: .handDrawn, zoom: 1)
        XCTAssertEqual(first.path.map(\.location), second.path.map(\.location))
        let exact = ShapeOutline.exactPoints(of: rectangle)
        let furthest = zip(first.path, exact).map { ShapeFit.distance($0.location, $1) }.max() ?? 0
        XCTAssertGreaterThan(furthest, 0.5, "it wobbles")
        XCTAssertLessThanOrEqual(furthest, 2.2001)
    }

    func testPagePointsFollowTheStrokesTransform() {
        var moved = handStroke([CGPoint(x: 0, y: 0), CGPoint(x: 60, y: 0), CGPoint(x: 120, y: 0)], ink: PKInk(.pen))
        moved.transform = CGAffineTransform(translationX: 100, y: 40)
        let points = ShapeStroke.pagePoints(of: moved, zoom: 1)
        XCTAssertEqual(points.first?.x ?? 0, 100, accuracy: 0.5)
        XCTAssertEqual(points.first?.y ?? 0, 40, accuracy: 0.5)
        XCTAssertEqual(points.last?.x ?? 0, 220, accuracy: 3.5)
    }

    func testAZoomedInPageGetsFinerPoints() {
        XCTAssertEqual(ShapeStroke.spacing(zoom: 1), 3)
        XCTAssertEqual(ShapeStroke.spacing(zoom: 0.5), 3, "never coarser than 3 points")
        XCTAssertEqual(ShapeStroke.spacing(zoom: 3), 1, accuracy: 0.001)
        XCTAssertEqual(ShapeStroke.spacing(zoom: 8), 0.75, "never finer than PencilKit resolves")
        let small = ShapeFit.Shape.ellipse(
            center: CGPoint(x: 50, y: 50), radii: CGSize(width: 6, height: 6), rotation: 0)
        let coarse = ShapeStroke.make(small, like: drawnBox, look: .clean, zoom: 1)
        let fine = ShapeStroke.make(small, like: drawnBox, look: .clean, zoom: 4)
        XCTAssertGreaterThan(fine.path.count, coarse.path.count)
    }

    func testAnEmptyStrokeIsReturnedAsItIs() {
        let empty = PKStroke(ink: PKInk(.pen), path: PKStrokePath(controlPoints: [], creationDate: date))
        XCTAssertEqual(ShapeStroke.make(rectangle, like: empty, look: .clean, zoom: 1).path.count, 0)
    }
}
