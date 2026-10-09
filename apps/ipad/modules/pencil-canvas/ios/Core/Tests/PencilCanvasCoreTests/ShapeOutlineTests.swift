import CoreGraphics
import XCTest

@testable import PencilCanvasCore

final class ShapeOutlineTests: XCTestCase {
    private let rectangle = ShapeFit.Shape.rectangle(
        center: CGPoint(x: 100, y: 100), half: CGSize(width: 50, height: 30), rotation: 0)

    func testARectangleClosesAndPinsItsCorners() {
        let outline = ShapeOutline.exactPoints(of: rectangle)
        XCTAssertEqual(outline.first, outline.last)
        XCTAssertEqual(outline.filter { $0 == CGPoint(x: 150, y: 70) }.count, 3, "each corner is repeated")
    }

    func testALineRunsFromEndToEndAndATriangleClosesOnItsFirstCorner() {
        let start = CGPoint(x: 10, y: 20)
        let end = CGPoint(x: 210, y: 20)
        let line = ShapeOutline.exactPoints(of: .line(start: start, end: end))
        XCTAssertEqual(line.first, start)
        XCTAssertEqual(line.last, end)
        let spacing = zip(line, line.dropFirst()).map { ShapeFit.distance($0, $1) }.max() ?? 0
        XCTAssertLessThanOrEqual(spacing, 3.1, "points are close enough for the curve to follow")

        let corner = CGPoint(x: 0, y: 0)
        let triangle = ShapeOutline.exactPoints(of: .triangle(corner, CGPoint(x: 90, y: 0), CGPoint(x: 0, y: 90)))
        XCTAssertEqual(triangle.first, corner)
        XCTAssertEqual(triangle.last, corner)
    }

    func testAnEllipseOverlapsItsEndsAndStaysOnItsCurve() {
        let center = CGPoint(x: 100, y: 100)
        let outline = ShapeOutline.exactPoints(
            of: .ellipse(center: center, radii: CGSize(width: 80, height: 40), rotation: 0))
        for point in outline {
            let unit = hypot((point.x - center.x) / 80, (point.y - center.y) / 40)
            XCTAssertEqual(unit, 1, accuracy: 0.0001)
        }
        XCTAssertGreaterThan(outline.count, 100)
        XCTAssertNotEqual(outline.first, outline.last, "the end runs past the start")
    }

    func testTheCleanLookIsExact() {
        XCTAssertEqual(
            ShapeOutline.points(of: rectangle, look: .clean, seed: 9), ShapeOutline.exactPoints(of: rectangle))
        XCTAssertEqual(ShapeLook.clean.wobble(for: CGSize(width: 500, height: 500)), 0)
    }

    func testTheHandDrawnLookMovesPointsALittleAndKeepsCornersTogether() {
        let exact = ShapeOutline.exactPoints(of: rectangle)
        let wobbly = ShapeOutline.points(of: rectangle, look: .handDrawn, seed: 7)
        let limit = ShapeLook.handDrawn.wobble(for: CGSize(width: 100, height: 60))
        XCTAssertEqual(wobbly.count, exact.count)
        XCTAssertNotEqual(wobbly, exact)
        for (moved, original) in zip(wobbly, exact) {
            XCTAssertLessThanOrEqual(ShapeFit.distance(moved, original), limit + 0.0001)
        }
        let corner = exact.indices.filter { exact[$0] == CGPoint(x: 150, y: 70) }
        XCTAssertEqual(Set(corner.map { wobbly[$0] }).count, 1, "a pinned corner stays one point")
    }

    func testTheSameSeedRepeatsAndAnotherSeedDiffers() {
        let first = ShapeOutline.points(of: rectangle, look: .handDrawn, seed: 7)
        XCTAssertEqual(ShapeOutline.points(of: rectangle, look: .handDrawn, seed: 7), first)
        XCTAssertNotEqual(ShapeOutline.points(of: rectangle, look: .handDrawn, seed: 8), first)
    }

    func testTheWobbleGrowsWithTheShapeAndIsCapped() {
        let small = ShapeLook.handDrawn.wobble(for: CGSize(width: 12, height: 10))
        let medium = ShapeLook.handDrawn.wobble(for: CGSize(width: 100, height: 60))
        let huge = ShapeLook.handDrawn.wobble(for: CGSize(width: 900, height: 900))
        XCTAssertEqual(small, 0.24, accuracy: 0.001, "tiny shapes get a minimum that doesn't swamp them")
        XCTAssertEqual(medium, 1.2, accuracy: 0.001)
        XCTAssertEqual(huge, 2.2)
    }
}
