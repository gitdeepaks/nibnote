import CoreGraphics
import XCTest

@testable import PencilCanvasCore

final class PencilLocationTests: XCTestCase {
    private let screen = CGRect(x: 0, y: 0, width: 800, height: 1000)

    func testTheHoverPositionWins() {
        let hover = CGPoint(x: 10, y: 20)
        XCTAssertEqual(PencilLocation.choose(hover: hover, lastTouch: CGPoint(x: 400, y: 400), visible: screen), hover)
    }

    func testWithoutHoverTheLastTouchIsUsedWhileOnScreen() {
        let touch = CGPoint(x: 400, y: 900)
        XCTAssertEqual(PencilLocation.choose(hover: nil, lastTouch: touch, visible: screen), touch)
    }

    func testALastTouchScrolledOffScreenIsNotUsed() {
        XCTAssertNil(PencilLocation.choose(hover: nil, lastTouch: CGPoint(x: 400, y: -30), visible: screen))
        XCTAssertNil(PencilLocation.choose(hover: nil, lastTouch: CGPoint(x: 820, y: 400), visible: screen))
    }

    func testNothingKnownGivesNil() {
        XCTAssertNil(PencilLocation.choose(hover: nil, lastTouch: nil, visible: screen))
    }
}
