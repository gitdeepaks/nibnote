import PencilKit
import XCTest

@testable import PencilCanvasCore

final class SelectionCopyTests: XCTestCase {
    /// PencilKit's Duplicate, as measured on the iPad: the same path, moved by a translation.
    private let duplicateOffset = CGVector(dx: 22.5, dy: 15.2)

    /// A horizontal stroke starting at `start`, drawn at `second` seconds.
    private func stroke(at start: CGPoint, second: TimeInterval, length: CGFloat = 60) -> PKStroke {
        let points = (0..<21).map { step in
            PKStrokePoint(
                location: CGPoint(x: start.x + CGFloat(step) * length / 20, y: start.y),
                timeOffset: TimeInterval(step) * 0.01, size: CGSize(width: 3, height: 3), opacity: 1, force: 0.5,
                azimuth: 1.75, altitude: 0.84)
        }
        let path = PKStrokePath(controlPoints: points, creationDate: Date(timeIntervalSinceReferenceDate: second))
        return PKStroke(ink: PKInk(.pen, color: .black), path: path)
    }

    private func duplicate(_ stroke: PKStroke) -> PKStroke {
        SelectionCopy.moved(stroke, by: duplicateOffset)
    }

    private func translation(of stroke: PKStroke) -> CGPoint {
        CGPoint(x: stroke.transform.tx, y: stroke.transform.ty)
    }

    private lazy var first = stroke(at: CGPoint(x: 20, y: 20), second: 1)
    private lazy var second = stroke(at: CGPoint(x: 20, y: 60), second: 2)
    private lazy var third = stroke(at: CGPoint(x: 20, y: 100), second: 3)

    func testFindsTheStrokesDuplicateAdded() {
        let before = [first, second, third]
        let after = before + [duplicate(second), duplicate(third)]
        let added = SelectionCopy.added(before: before, after: after)
        XCTAssertEqual(added.map(SelectionCopy.pathKey(of:)), [second, third].map(SelectionCopy.pathKey(of:)))
        XCTAssertEqual(added.map(translation(of:)), [CGPoint(x: 22.5, y: 15.2), CGPoint(x: 22.5, y: 15.2)])
    }

    func testNothingAddedMeansNothingSelected() {
        XCTAssertTrue(SelectionCopy.selected(before: [first, second], after: [first, second]).isEmpty)
        XCTAssertTrue(SelectionCopy.selected(before: [], after: []).isEmpty)
    }

    func testTheSelectionIsTheOriginalsInTheirOwnPlace() {
        let before = [first, second, third]
        let selected = SelectionCopy.selected(before: before, after: before + [duplicate(first), duplicate(third)])
        XCTAssertEqual(selected.map(SelectionCopy.pathKey(of:)), [first, third].map(SelectionCopy.pathKey(of:)))
        XCTAssertEqual(selected.map(translation(of:)), [.zero, .zero])
    }

    func testAnEarlierDuplicateUnderTheNewCopyDoesNotConfuseIt() {
        // The user duplicated `first` before; that copy sits exactly where a new copy of `first` lands.
        let earlier = duplicate(first)
        let before = [first, second, earlier]
        let selected = SelectionCopy.selected(before: before, after: before + [duplicate(first)])
        XCTAssertEqual(selected.count, 1)
        XCTAssertEqual(selected.first.map(translation(of:)), .zero, "the original, not the earlier copy")
    }

    func testSelectingAnEarlierDuplicateCopiesThatDuplicate() {
        let earlier = duplicate(first)
        let before = [first, earlier]
        let selected = SelectionCopy.selected(before: before, after: before + [duplicate(earlier)])
        XCTAssertEqual(selected.first.map(translation(of:)), CGPoint(x: 22.5, y: 15.2))
    }

    func testAMaskTravelsWithTheStroke() throws {
        let masked = PKStroke(
            ink: first.ink, path: first.path, transform: .identity,
            mask: UIBezierPath(rect: CGRect(x: 20, y: 10, width: 30, height: 20)))
        let before = [masked, second]
        let selected = SelectionCopy.selected(before: before, after: before + [duplicate(masked)])
        XCTAssertNotNil(try XCTUnwrap(selected.first).mask)
    }

    func testStrokesThatFitThePageStayWhereTheyAre() {
        let fitted = SelectionCopy.fitted([first, second], into: CGSize(width: 595, height: 842))
        XCTAssertEqual(fitted.map(translation(of:)), [.zero, .zero])
    }

    func testStrokesPastTheEdgeMoveInsideTogether() {
        let low = stroke(at: CGPoint(x: 500, y: 800), second: 4)
        let lower = stroke(at: CGPoint(x: 500, y: 830), second: 5)
        let page = CGSize(width: 595, height: 595)
        let fitted = SelectionCopy.fitted([low, lower], into: page)
        let shifts = fitted.map(translation(of:))
        XCTAssertEqual(shifts[0], shifts[1], "the group moves as one")
        XCTAssertLessThan(shifts[0].y, 0)
        let bounds = fitted.reduce(CGRect.null) { $0.union(HighlighterEraser.bounds(of: $1)) }
        XCTAssertLessThanOrEqual(bounds.maxY, page.height + 0.001)
        XCTAssertGreaterThanOrEqual(bounds.minX, -0.001)
    }

    func testAGroupLargerThanThePageStartsAtItsTopLeft() {
        let wide = stroke(at: CGPoint(x: 100, y: 100), second: 6, length: 900)
        let fitted = SelectionCopy.fitted([wide], into: CGSize(width: 595, height: 842))
        let bounds = HighlighterEraser.bounds(of: fitted[0])
        XCTAssertEqual(bounds.minX, 0, accuracy: 0.001)
    }

    func testAppendingPutsTheStrokesOnTop() {
        let merged = SelectionCopy.appending([third], to: PKDrawing(strokes: [first, second]))
        XCTAssertEqual(
            merged.strokes.map(SelectionCopy.pathKey(of:)), [first, second, third].map(SelectionCopy.pathKey(of:)))
    }
}
