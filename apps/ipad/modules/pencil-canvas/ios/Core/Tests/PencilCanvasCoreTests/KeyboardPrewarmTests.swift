import XCTest

@testable import PencilCanvasCore

final class KeyboardPrewarmTests: XCTestCase {
    private func decide(
        done: Bool = false, voiceOver: Bool = false, toolInUse: Bool = false, textInput: Bool = false
    ) -> KeyboardPrewarm.Decision {
        KeyboardPrewarm.decide(
            alreadyDone: done, voiceOverRunning: voiceOver, toolInUse: toolInUse, textInputActive: textInput)
    }

    func testRunsWhenNothingIsHappening() {
        XCTAssertEqual(decide(), .run)
    }

    func testRunsOnlyOncePerLaunch() {
        XCTAssertEqual(decide(done: true), .skip)
    }

    func testNeverRunsWithVoiceOver() {
        XCTAssertEqual(decide(voiceOver: true), .skip)
    }

    func testWaitsWhileAToolIsTouchingThePage() {
        XCTAssertEqual(decide(toolInUse: true), .retry)
    }

    func testLeavesAnActiveSelectionOrTextFieldAlone() {
        XCTAssertEqual(decide(textInput: true), .skip)
        XCTAssertEqual(decide(toolInUse: true, textInput: true), .skip)
    }
}
