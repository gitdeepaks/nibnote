import XCTest

@testable import PencilCanvasCore

final class ToolFeedbackRuleTests: XCTestCase {
    private let black = RGBAColor(red: 0, green: 0, blue: 0, alpha: 1)
    private let blue = RGBAColor(red: 0, green: 0.4, blue: 1, alpha: 1)
    private var pen: CanvasToolSpec { .ink(.pen, color: black, width: 3) }

    private func plays(_ previous: CanvasToolSpec?, _ next: CanvasToolSpec, pencilAgo: TimeInterval?) -> Bool {
        let now: TimeInterval = 100
        return ToolFeedbackRule.shouldPlay(
            previous: previous, next: next, lastPencilEvent: pencilAgo.map { now - $0 }, now: now)
    }

    func testAToolChangeRightAfterAPencilTapPlays() {
        XCTAssertTrue(plays(pen, .eraser(.stroke, width: 24, highlighterOnly: false), pencilAgo: 0.05))
        XCTAssertTrue(plays(pen, .lasso, pencilAgo: 0.5))
    }

    func testAColourOrInkChangePlays() {
        XCTAssertTrue(plays(pen, .ink(.pen, color: blue, width: 3), pencilAgo: 0.1))
        XCTAssertTrue(plays(pen, .ink(.fountainPen, color: black, width: 3), pencilAgo: 0.1))
        let eraser = CanvasToolSpec.eraser(.stroke, width: 24, highlighterOnly: false)
        XCTAssertTrue(plays(eraser, .eraser(.stroke, width: 24, highlighterOnly: true), pencilAgo: 0.1))
    }

    func testAWidthChangeNeverPlays() {
        XCTAssertFalse(plays(pen, .ink(.pen, color: black, width: 5), pencilAgo: 0.05))
        let eraser = CanvasToolSpec.eraser(.pixel, width: 24, highlighterOnly: false)
        XCTAssertFalse(plays(eraser, .eraser(.pixel, width: 40, highlighterOnly: false), pencilAgo: 0.05))
    }

    func testWithoutARecentPencilEventNothingPlays() {
        XCTAssertFalse(plays(pen, .lasso, pencilAgo: nil))
        XCTAssertFalse(plays(pen, .lasso, pencilAgo: 0.6))
        XCTAssertFalse(plays(pen, .lasso, pencilAgo: -0.1), "an event stamped after the change is ignored")
    }

    func testTheFirstToolACanvasGetsNeverPlays() {
        XCTAssertFalse(plays(nil, pen, pencilAgo: 0.05))
    }

    func testTheSameToolNeverPlays() {
        XCTAssertFalse(plays(pen, pen, pencilAgo: 0.05))
    }
}
