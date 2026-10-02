import CoreGraphics
import XCTest

@testable import PencilCanvasCore

final class FingerTapTests: XCTestCase {
    private typealias Viewport = FingerTap.Viewport
    private let still = Viewport(zoom: 1.5, offset: CGPoint(x: 0, y: 300))

    private func accept(
        fingers: Int, end: Viewport? = nil, pageReady: Bool = true, toolInUse: Bool = false
    ) -> FingerTap.Action? {
        FingerTap.accept(fingers: fingers, start: still, end: end ?? still, pageReady: pageReady, toolInUse: toolInUse)
    }

    func testTwoFingersUndoAndThreeRedo() {
        XCTAssertEqual(accept(fingers: 2), .undo)
        XCTAssertEqual(accept(fingers: 3), .redo)
    }

    func testOtherFingerCountsDoNothing() {
        XCTAssertNil(accept(fingers: 1))
        XCTAssertNil(accept(fingers: 4))
        XCTAssertNil(accept(fingers: 0))
    }

    func testAPinchThatZoomedIsNotATap() {
        XCTAssertNil(accept(fingers: 2, end: Viewport(zoom: 1.52, offset: still.offset)))
    }

    func testAScrollThatMovedThePageIsNotATap() {
        XCTAssertNil(accept(fingers: 2, end: Viewport(zoom: still.zoom, offset: CGPoint(x: 0, y: 306))))
        XCTAssertNil(accept(fingers: 3, end: Viewport(zoom: still.zoom, offset: CGPoint(x: 4, y: 300))))
    }

    func testNoiseWithinTheTolerancesStillCounts() {
        let jitter = Viewport(zoom: 1.5 * 1.004, offset: CGPoint(x: 1, y: 301))
        XCTAssertEqual(accept(fingers: 2, end: jitter), .undo)
    }

    func testNothingHappensOnAPageThatIsNotReady() {
        XCTAssertNil(accept(fingers: 2, pageReady: false))
    }

    func testNothingHappensWhileSomethingIsBeingDrawn() {
        XCTAssertNil(accept(fingers: 2, toolInUse: true))
    }

    func testAZeroZoomNeverCountsAsStill() {
        let broken = Viewport(zoom: 0, offset: .zero)
        XCTAssertFalse(FingerTap.pageStayedStill(from: broken, to: broken))
    }
}
