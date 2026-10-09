import CoreGraphics
import XCTest

@testable import PencilCanvasCore

final class ShapeHoldTests: XCTestCase {
    private let start = CGPoint(x: 100, y: 100)
    private let far = CGPoint(x: 300, y: 100)

    /// A stroke from `start` to `far` that reaches `far` at 1 s.
    private func drawn() -> ShapeHold {
        var hold = ShapeHold()
        hold.begin(at: start, time: 0)
        XCTAssertTrue(hold.move(to: far, time: 1))
        return hold
    }

    func testAStrokeLiftedAtOnceIsNotHeld() {
        var hold = drawn()
        XCTAssertFalse(hold.lift(at: far, time: 1.1))
    }

    func testRestingForTheWholeDurationIsHeld() {
        var hold = drawn()
        XCTAssertFalse(hold.settle(time: 1.2), "too early to be resting")
        XCTAssertTrue(hold.settle(time: 1 + ShapeHold.duration))
        XCTAssertTrue(hold.lift(at: far, time: 1.6))
    }

    func testLiftingJustBeforeTheDurationIsNotHeld() {
        // Device log: three lines lifted after 0.38–0.43 s and, by the owner's choice, did not snap.
        var hold = drawn()
        XCTAssertFalse(hold.lift(at: far, time: 1.43))
    }

    func testWanderingWithinTheSlopIsStillTheSameSpot() {
        var hold = drawn()
        XCTAssertFalse(hold.move(to: CGPoint(x: far.x + 4, y: far.y - 3), time: 1.2))
        XCTAssertTrue(hold.lift(at: CGPoint(x: far.x + 4, y: far.y - 3), time: 1.5))
    }

    func testAHandThatMovesWhileLiftingIsStillHeld() {
        // Device log: 11 snaps were lost because the lift moved the Pencil 7–10 pt after the preview.
        var hold = drawn()
        XCTAssertTrue(hold.settle(time: 1.45))
        let lifting = CGPoint(x: far.x + 9, y: far.y + 2)
        XCTAssertTrue(hold.move(to: lifting, time: 1.8), "it left its spot")
        XCTAssertTrue(hold.lift(at: lifting, time: 1.81))
    }

    func testDrawingOnAfterRestingIsNotHeld() {
        var hold = drawn()
        XCTAssertTrue(hold.settle(time: 1.45))
        let onward = CGPoint(x: far.x + 80, y: far.y)
        XCTAssertTrue(hold.move(to: onward, time: 1.8))
        XCTAssertFalse(hold.lift(at: onward, time: 1.9), "too far from where it rested")
    }

    func testComingBackLongAfterRestingIsNotHeld() {
        var hold = drawn()
        XCTAssertTrue(hold.settle(time: 1.45))
        XCTAssertTrue(hold.move(to: CGPoint(x: far.x + 60, y: far.y), time: 1.8))
        XCTAssertTrue(hold.move(to: CGPoint(x: far.x + 8, y: far.y), time: 3.2))
        XCTAssertFalse(hold.lift(at: CGPoint(x: far.x + 8, y: far.y), time: 3.3), "outside the lift window")
    }

    func testRestingAgainSomewhereElseIsHeldThere() {
        var hold = drawn()
        XCTAssertTrue(hold.settle(time: 1.45))
        let second = CGPoint(x: far.x + 120, y: far.y + 40)
        XCTAssertTrue(hold.move(to: second, time: 2))
        XCTAssertTrue(hold.settle(time: 2.45))
        XCTAssertTrue(hold.lift(at: second, time: 2.5))
    }

    func testACancelledOrUnstartedTouchIsNeverHeld() {
        var cancelled = drawn()
        XCTAssertTrue(cancelled.settle(time: 1.45))
        cancelled.cancel()
        XCTAssertFalse(cancelled.settle(time: 2))
        XCTAssertFalse(cancelled.lift(at: far, time: 2))

        var unstarted = ShapeHold()
        XCTAssertFalse(unstarted.move(to: far, time: 0))
        XCTAssertFalse(unstarted.lift(at: far, time: 5))
    }

    func testALiftEndsTheTouch() {
        var hold = drawn()
        XCTAssertTrue(hold.lift(at: far, time: 2))
        XCTAssertFalse(hold.lift(at: far, time: 3), "the next lift needs a new touch")
    }
}
