import PencilKit
import XCTest

@testable import PencilCanvasCore

final class HighlighterEraserTests: XCTestCase {
    private typealias Sweep = HighlighterEraser.Sweep

    /// A horizontal stroke at `line` from x = 10 to 190.
    private func stroke(_ ink: PKInk.InkType, y line: CGFloat, size: CGSize) -> PKStroke {
        let points = (0..<61).map { step in
            PKStrokePoint(
                location: CGPoint(x: 10 + CGFloat(step) * 3, y: line), timeOffset: TimeInterval(step) * 0.01,
                size: size, opacity: 1, force: 0.5, azimuth: 1.75, altitude: 0.84)
        }
        let path = PKStrokePath(controlPoints: points, creationDate: Date())
        return PKStroke(ink: PKInk(ink, color: .black), path: path)
    }

    private var highlighter: PKStroke { stroke(.marker, y: 50, size: CGSize(width: 13, height: 18)) }
    private var pen: PKStroke { stroke(.pen, y: 50, size: CGSize(width: 3, height: 3)) }
    /// A vertical sweep through x = 100.
    private let throughMiddle = Sweep(from: CGPoint(x: 100, y: 0), to: CGPoint(x: 100, y: 100), radius: 8)

    private func erase(_ strokes: [PKStroke], _ sweep: Sweep, _ mode: HighlighterEraser.Mode) throws -> PKDrawing {
        try XCTUnwrap(HighlighterEraser.erasing(PKDrawing(strokes: strokes), along: sweep, mode: mode))
    }

    func testStrokeModeRemovesTouchedHighlightersAndNeverPen() throws {
        let erased = try erase([pen, highlighter], throughMiddle, .stroke)
        XCTAssertEqual(erased.strokes.map(\.ink.inkType), [.pen])
    }

    func testAMissReportsNoChange() {
        let miss = Sweep(from: CGPoint(x: 100, y: 200), to: CGPoint(x: 150, y: 220), radius: 8)
        XCTAssertNil(HighlighterEraser.erasing(PKDrawing(strokes: [pen, highlighter]), along: miss, mode: .stroke))
        XCTAssertNil(HighlighterEraser.erasing(PKDrawing(strokes: [pen]), along: throughMiddle, mode: .pixel))
    }

    func testPixelModeCutsTheHighlighterAndKeepsBothEnds() throws {
        let erased = try erase([pen, highlighter], throughMiddle, .pixel)
        XCTAssertEqual(erased.strokes.count, 2)
        XCTAssertNil(erased.strokes[0].mask, "the pen is untouched")
        let mask = try XCTUnwrap(erased.strokes[1].mask?.cgPath)
        XCTAssertFalse(mask.contains(CGPoint(x: 100, y: 50)), "the middle is erased")
        XCTAssertTrue(mask.contains(CGPoint(x: 30, y: 50)), "the left end stays")
        XCTAssertTrue(mask.contains(CGPoint(x: 170, y: 50)), "the right end stays")
    }

    func testErasingTheSameSpotTwiceChangesNothingTheSecondTime() throws {
        let once = try erase([highlighter], throughMiddle, .pixel)
        XCTAssertNil(HighlighterEraser.erasing(once, along: throughMiddle, mode: .pixel))
    }

    func testAStrokeErasedEverywhereIsRemoved() throws {
        let whole = Sweep(from: CGPoint(x: 0, y: 50), to: CGPoint(x: 200, y: 50), radius: 20)
        XCTAssertEqual(try erase([pen, highlighter], whole, .pixel).strokes.map(\.ink.inkType), [.pen])
    }

    func testAFramesMovementsActAsOnePath() throws {
        // A zigzag through two highlighters, joined into one sweep.
        let top = stroke(.marker, y: 30, size: CGSize(width: 13, height: 18))
        let bottom = stroke(.marker, y: 70, size: CGSize(width: 13, height: 18))
        let zigzag = Sweep(points: [CGPoint(x: 60, y: 0), CGPoint(x: 80, y: 100), CGPoint(x: 100, y: 0)], radius: 4)
        let erased = try erase([top, bottom], zigzag, .pixel)
        XCTAssertEqual(erased.strokes.count, 2)
        XCTAssertTrue(erased.strokes.allSatisfy { $0.mask != nil })
        XCTAssertEqual(zigzag.distance(to: CGPoint(x: 80, y: 100)), 0, accuracy: 0.001)
    }

    func testATapErasesAroundOnePoint() throws {
        let tap = Sweep(points: [CGPoint(x: 100, y: 50)], radius: 8)
        let mask = try XCTUnwrap(try erase([highlighter], tap, .pixel).strokes.first?.mask?.cgPath)
        XCTAssertFalse(mask.contains(CGPoint(x: 100, y: 50)))
    }

    func testTheCutSurvivesSavingAndLoading() throws {
        let erased = try erase([highlighter], throughMiddle, .pixel)
        let loaded = try PKDrawing(data: erased.dataRepresentation())
        let mask = try XCTUnwrap(loaded.strokes.first?.mask?.cgPath)
        XCTAssertFalse(mask.contains(CGPoint(x: 100, y: 50)))
    }

    /// Prints timings for a worst case (strokes stacked ~18 deep). Simulator timing swings several-fold
    /// between runs, so the gate is Instruments on the iPad, not a limit here.
    func testATwoThousandStrokePageErasesAndReportsTimings() {
        let strokes = (0..<2000).map { index -> PKStroke in
            let base = stroke(index.isMultiple(of: 2) ? .marker : .pen, y: 0, size: CGSize(width: 6, height: 8))
            let offset = CGAffineTransform(translationX: CGFloat(index % 20) * 20, y: 20 + CGFloat(index / 20) * 8)
            return PKStroke(ink: base.ink, path: base.path, transform: offset)
        }
        let drawing = PKDrawing(strokes: strokes)
        func milliseconds(_ body: () -> Void) -> Double {
            let start = CFAbsoluteTimeGetCurrent()
            body()
            return (CFAbsoluteTimeGetCurrent() - start) * 1000
        }
        for mode in [HighlighterEraser.Mode.stroke, .pixel] {
            var session = HighlighterEraser.Session(drawing: drawing)
            let start = milliseconds { session = HighlighterEraser.Session(drawing: drawing) }
            let moves = (0..<30).map { step in
                let from = CGPoint(x: 100 + CGFloat(step) * 6, y: 200 + CGFloat(step) * 4)
                let sweep = Sweep(from: from, to: CGPoint(x: from.x + 6, y: from.y + 4), radius: 12)
                return milliseconds { _ = session.erase(along: sweep, mode: mode) }
            }
            let build = milliseconds { _ = session.drawing }
            let median = moves.sorted()[moves.count / 2]
            let summary = String(format: "start %.1f ms, median move %.2f ms, drawing %.1f ms", start, median, build)
            print("ERASER \(mode) \(summary)")
            XCTAssertTrue(session.hasChanges)
        }
    }
}
