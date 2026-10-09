import CoreGraphics
import XCTest

@testable import PencilCanvasCore

final class ShapeFitTests: XCTestCase {
    // MARK: - Lines

    func testAWobblyLineBecomesALine() {
        let drawn = ShapeSamples.line(from: CGPoint(x: 20, y: 30), to: CGPoint(x: 300, y: 180))
        guard case let .line(start, end) = ShapeFit.fit(drawn) else { return XCTFail("expected a line") }
        XCTAssertEqual(start.x, 20, accuracy: 4)
        XCTAssertEqual(end.y, 180, accuracy: 4)
    }

    func testANearlyLevelLineSnapsLevelAndASlantedOneKeepsItsSlant() {
        let nearlyLevel = ShapeSamples.line(from: CGPoint(x: 20, y: 100), to: CGPoint(x: 320, y: 112))
        guard case let .line(start, end) = ShapeFit.fit(nearlyLevel) else { return XCTFail("expected a line") }
        XCTAssertEqual(start.y, end.y, accuracy: 0.001)

        let slanted = ShapeSamples.line(from: CGPoint(x: 20, y: 100), to: CGPoint(x: 320, y: 220))
        guard case let .line(slantStart, slantEnd) = ShapeFit.fit(slanted) else { return XCTFail("expected a line") }
        XCTAssertGreaterThan(slantEnd.y - slantStart.y, 100)
    }

    func testABowedLineIsLeftAlone() {
        // Device log: `straight=0.94 dev=0.119`, a line that curved too much to be meant straight.
        let bowed = (0...40).map { step -> CGPoint in
            let progress = CGFloat(step) / 40
            return CGPoint(x: 20 + progress * 300, y: 100 + sin(progress * .pi) * 38)
        }
        XCTAssertNil(ShapeFit.fit(bowed))
    }

    // MARK: - Closed shapes

    func testAWobblyOvalBecomesAnEllipse() {
        let drawn = ShapeSamples.oval(center: CGPoint(x: 200, y: 200), radii: CGSize(width: 120, height: 70))
        guard case let .ellipse(center, radii, rotation) = ShapeFit.fit(drawn) else {
            return XCTFail("expected an ellipse")
        }
        XCTAssertEqual(center.x, 200, accuracy: 8)
        XCTAssertEqual(radii.width, 120, accuracy: 10)
        XCTAssertEqual(radii.height, 70, accuracy: 10)
        XCTAssertEqual(rotation, 0, accuracy: 0.001, "a nearly level oval snaps level")
    }

    func testANearCircleHasNoDirection() {
        let drawn = ShapeSamples.oval(center: CGPoint(x: 200, y: 200), radii: CGSize(width: 90, height: 86))
        guard case let .ellipse(_, _, rotation) = ShapeFit.fit(drawn) else { return XCTFail("expected an ellipse") }
        XCTAssertEqual(rotation, 0)
    }

    func testAWobblyBoxBecomesARectangle() {
        guard case let .rectangle(center, half, rotation) = ShapeFit.fit(
            ShapeSamples.box(CGRect(x: 60, y: 80, width: 240, height: 140)))
        else { return XCTFail("expected a rectangle") }
        XCTAssertEqual(center.x, 180, accuracy: 6)
        XCTAssertEqual(half.width, 120, accuracy: 8)
        XCTAssertEqual(rotation, 0, accuracy: 0.001)
    }

    func testATiltedBoxKeepsItsTilt() {
        let tilt: CGFloat = 0.5
        let center = CGPoint(x: 200, y: 200)
        let drawn = ShapeSamples.box(CGRect(x: 100, y: 140, width: 200, height: 120)).map {
            ShapeFit.rotate($0, around: center, by: tilt)
        }
        guard case let .rectangle(_, half, rotation) = ShapeFit.fit(drawn) else {
            return XCTFail("expected a rectangle")
        }
        // The sides repeat every quarter turn, so the fitted angle may be the tilt plus or minus 90°.
        let offset = (rotation - tilt) / (.pi / 2)
        XCTAssertEqual(offset, offset.rounded(), accuracy: 0.05)
        XCTAssertEqual(max(half.width, half.height), 100, accuracy: 8)
    }

    func testABoxWithRoundedCornersIsStillARectangle() {
        // Device logs: two rectangles drawn with rounded corners missed the stricter limit
        // (`edges=0.68 rect=0.129`, `edges=0.60 rect=0.117`).
        let drawn = ShapeSamples.roundedBox(CGRect(x: 60, y: 80, width: 240, height: 150), radius: 28)
        guard case .rectangle = ShapeFit.fit(drawn) else { return XCTFail("expected a rectangle") }
    }

    func testAWobblyTriangleBecomesATriangleWithItsCorners() {
        let drawn = [CGPoint(x: 200, y: 60), CGPoint(x: 340, y: 300), CGPoint(x: 70, y: 280)]
        guard case let .triangle(first, second, third) = ShapeFit.fit(ShapeSamples.path(through: drawn + [drawn[0]]))
        else { return XCTFail("expected a triangle") }
        for corner in drawn {
            let nearest = [first, second, third].map { ShapeFit.distance($0, corner) }.min() ?? .infinity
            XCTAssertLessThan(nearest, 10, "a corner near \(corner)")
        }
    }

    func testAnUpsideDownAndATiltedTriangleAreTriangles() {
        let upsideDown = [CGPoint(x: 80, y: 80), CGPoint(x: 320, y: 90), CGPoint(x: 190, y: 300)]
        let tilted = [CGPoint(x: 60, y: 200), CGPoint(x: 300, y: 60), CGPoint(x: 330, y: 260)]
        for corners in [upsideDown, tilted] {
            guard case .triangle = ShapeFit.fit(ShapeSamples.path(through: corners + [corners[0]])) else {
                return XCTFail("expected a triangle through \(corners)")
            }
        }
    }

    // MARK: - Left alone

    func testHandwritingIsLeftAlone() {
        // A looping scribble, like a word: neither straight nor a clean closed shape.
        let scribble = (0...120).map { step -> CGPoint in
            let progress = CGFloat(step) / 120
            return CGPoint(x: 40 + progress * 260 + sin(progress * 40) * 18, y: 120 + cos(progress * 31) * 26)
        }
        XCTAssertNil(ShapeFit.fit(scribble))
    }

    func testAnOpenCurveIsLeftAlone() {
        let arc = (0...40).map { step -> CGPoint in
            let angle = CGFloat(step) / 40 * .pi
            return CGPoint(x: 200 + cos(angle) * 100, y: 200 + sin(angle) * 100)
        }
        XCTAssertNil(ShapeFit.fit(arc))
    }

    func testLettersHeldAtTheEndAreLeftAlone() {
        // The owner's check: "V", ">", "Z" and "7" drawn with a hold must stay handwriting.
        let letters: [[CGPoint]] = [
            [CGPoint(x: 100, y: 100), CGPoint(x: 150, y: 220), CGPoint(x: 200, y: 100)],
            [CGPoint(x: 100, y: 100), CGPoint(x: 220, y: 160), CGPoint(x: 100, y: 220)],
            [CGPoint(x: 100, y: 100), CGPoint(x: 220, y: 100), CGPoint(x: 100, y: 220), CGPoint(x: 220, y: 220)],
            [CGPoint(x: 100, y: 100), CGPoint(x: 220, y: 100), CGPoint(x: 150, y: 240)]
        ]
        for letter in letters {
            XCTAssertNil(ShapeFit.fit(ShapeSamples.path(through: letter, wobble: 2)), "\(letter)")
        }
    }

    func testATinyMarkAndAnEmptyStrokeAreLeftAlone() {
        let dot = ShapeSamples.line(from: CGPoint(x: 10, y: 10), to: CGPoint(x: 30, y: 12), wobble: 0.5)
        XCTAssertNil(ShapeFit.fit(dot))
        XCTAssertNil(ShapeFit.fit([]))
        XCTAssertNil(ShapeFit.fit([CGPoint(x: 5, y: 5)]))
    }

    func testALineDrawnThereAndBackIsNotAShape() {
        let thereAndBack = ShapeSamples.path(
            through: [CGPoint(x: 60, y: 100), CGPoint(x: 320, y: 110), CGPoint(x: 62, y: 104)], wobble: 1)
        XCTAssertNil(ShapeFit.fit(thereAndBack))
    }

    func testALevelLineDrawnThereAndBackIsNotAThinTriangle() {
        // Owner's device check: a retraced underline often became a thin triangle.
        for lift in [CGFloat(1.5), 3, 5.5] {
            let retraced = ShapeSamples.path(
                through: [
                    CGPoint(x: 60, y: 200), CGPoint(x: 330, y: 200 + lift), CGPoint(x: 70, y: 200 + lift * 2),
                    CGPoint(x: 60, y: 200)
                ], wobble: 1)
            XCTAssertNil(ShapeFit.fit(retraced), "retraced \(lift) pt apart")
        }
    }

    func testAFlatTriangleIsStillATriangle() {
        let flat = [CGPoint(x: 60, y: 260), CGPoint(x: 340, y: 260), CGPoint(x: 200, y: 200)]
        guard case .triangle = ShapeFit.fit(ShapeSamples.path(through: flat + [flat[0]], wobble: 2)) else {
            return XCTFail("expected a triangle")
        }
    }

    func testASmallShapeSnapsOnlyWhenThePageIsZoomedIn() {
        // Owner's device check: a small circle drawn zoomed in did not snap.
        let small = ShapeSamples.oval(center: CGPoint(x: 100, y: 100), radii: CGSize(width: 5, height: 5), wobble: 0.2)
        XCTAssertNil(ShapeFit.fit(small, zoom: 1), "31 points round is handwriting at normal size")
        guard case let .ellipse(_, radii, _) = ShapeFit.fit(small, zoom: 3) else {
            return XCTFail("expected an ellipse when zoomed in")
        }
        XCTAssertEqual(radii.width, 5, accuracy: 1)
        let smallBox = ShapeSamples.box(CGRect(x: 100, y: 100, width: 14, height: 9), wobble: 0.2)
        guard case .rectangle = ShapeFit.fit(smallBox, zoom: 4) else { return XCTFail("expected a rectangle") }
    }

    func testALargeShapeIsHandwritingWhenThePageIsZoomedFarOut() {
        let line = ShapeSamples.line(from: CGPoint(x: 20, y: 30), to: CGPoint(x: 90, y: 34), wobble: 0.5)
        XCTAssertNotNil(ShapeFit.fit(line, zoom: 1))
        XCTAssertNil(ShapeFit.fit(line, zoom: 0.4), "28 points long on screen")
    }

    func testAThinRectangleIsStillARectangle() {
        let thin = ShapeSamples.box(CGRect(x: 40, y: 100, width: 300, height: 26), wobble: 1.5)
        guard case .rectangle = ShapeFit.fit(thin) else { return XCTFail("expected a rectangle") }
    }

    // MARK: - Speed

    func testFittingAnyShapeStaysWellInsideAFrame() {
        let triangle = [CGPoint(x: 200, y: 60), CGPoint(x: 340, y: 300), CGPoint(x: 70, y: 280)]
        let strokes = [
            ShapeSamples.path(through: triangle + [triangle[0]]),
            ShapeSamples.oval(center: CGPoint(x: 200, y: 200), radii: CGSize(width: 120, height: 70)),
            ShapeSamples.box(CGRect(x: 60, y: 80, width: 240, height: 140)),
            // A lumpy blob reaches the triangle search with most of its points on the hull.
            ShapeSamples.oval(center: CGPoint(x: 200, y: 200), radii: CGSize(width: 120, height: 110), wobble: 22)
        ]
        let clock = ContinuousClock()
        for stroke in strokes {
            let fastest = (0..<5).map { _ in clock.measure { _ = ShapeFit.fit(stroke) } }.min() ?? .zero
            XCTAssertLessThan(fastest, .milliseconds(5))
        }
    }

    func testResamplingSpacesPointsEvenly() {
        let points = ShapeFit.resample([CGPoint(x: 0, y: 0), CGPoint(x: 10, y: 0), CGPoint(x: 100, y: 0)], count: 11)
        XCTAssertEqual(points.count, 11)
        XCTAssertEqual(points[5].x, 50, accuracy: 0.001)
    }
}
