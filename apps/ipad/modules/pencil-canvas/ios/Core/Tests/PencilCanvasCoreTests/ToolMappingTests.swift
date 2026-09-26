import PencilKit
import XCTest

@testable import PencilCanvasCore

final class CanvasToolSpecTests: XCTestCase {
    private let black = "#1C1C1E"

    func testParsesEveryToolKind() throws {
        let ink = RawCanvasTool(kind: "ink", ink: "fountainPen", colorHex: black, width: 3)
        let highlighter = RawCanvasTool(kind: "highlighter", colorHex: "#FFD60A", width: 18)
        let eraser = RawCanvasTool(kind: "eraser", width: 12, mode: "pixel")
        let lasso = RawCanvasTool(kind: "lasso")

        XCTAssertEqual(
            try CanvasToolSpec.parse(ink).get(),
            .ink(.fountainPen, color: try XCTUnwrap(RGBAColor(hex: black)), width: 3))
        XCTAssertEqual(
            try CanvasToolSpec.parse(highlighter).get(),
            .highlighter(color: try XCTUnwrap(RGBAColor(hex: "#FFD60A")), width: 18))
        XCTAssertEqual(try CanvasToolSpec.parse(eraser).get(), .eraser(.pixel, width: 12))
        XCTAssertEqual(try CanvasToolSpec.parse(lasso).get(), .lasso)
    }

    func testRejectsInvalidTools() {
        let cases: [(RawCanvasTool, CanvasToolSpecError)] = [
            (RawCanvasTool(kind: "brush"), .unknownKind("brush")),
            (RawCanvasTool(kind: "ink", ink: "crayon", colorHex: black, width: 3), .invalidField("ink")),
            (RawCanvasTool(kind: "ink", ink: "pen", colorHex: "black", width: 3), .invalidField("colorHex")),
            (RawCanvasTool(kind: "ink", ink: "pen", colorHex: black, width: 0), .invalidField("width")),
            (RawCanvasTool(kind: "ink", ink: "pen", colorHex: black, width: .nan), .invalidField("width")),
            (RawCanvasTool(kind: "highlighter", colorHex: black, width: 101), .invalidField("width")),
            (RawCanvasTool(kind: "eraser", width: 12, mode: "soft"), .invalidField("mode")),
            (RawCanvasTool(kind: "eraser", width: 12), .invalidField("mode"))
        ]
        for (raw, expected) in cases {
            XCTAssertEqual(CanvasToolSpec.parse(raw), .failure(expected), "\(raw)")
        }
    }

    func testParsesHexColours() throws {
        let opaque = try XCTUnwrap(RGBAColor(hex: "#FF8000"))
        XCTAssertEqual(opaque.red, 1)
        XCTAssertEqual(opaque.green, 128.0 / 255, accuracy: 0.0001)
        XCTAssertEqual(opaque.blue, 0)
        XCTAssertEqual(opaque.alpha, 1)
        XCTAssertEqual(try XCTUnwrap(RGBAColor(hex: "#00000080")).alpha, 128.0 / 255, accuracy: 0.0001)
        for invalid in ["#fff", "FF8000", "#GG8000", "#FF80001", ""] {
            XCTAssertNil(RGBAColor(hex: invalid), invalid)
        }
    }
}

final class ToolMappingTests: XCTestCase {
    private let blue = RGBAColor(red: 0, green: 0.4, blue: 1, alpha: 1)

    func testMapsEveryInkKindToItsPencilKitInk() throws {
        let expected: [InkKind: PKInkingTool.InkType] = [
            .pen: .pen, .fountainPen: .fountainPen, .pencil: .pencil, .marker: .marker, .monoline: .monoline
        ]
        for kind in InkKind.allCases {
            let tool = try XCTUnwrap(ToolMapping.pkTool(for: .ink(kind, color: blue, width: 4)) as? PKInkingTool)
            XCTAssertEqual(tool.inkType, expected[kind], kind.rawValue)
        }
    }

    func testHighlighterIsATranslucentMarker() throws {
        let tool = try XCTUnwrap(ToolMapping.pkTool(for: .highlighter(color: blue, width: 18)) as? PKInkingTool)
        XCTAssertEqual(tool.inkType, .marker)
        var alpha: CGFloat = 0
        tool.color.getRed(nil, green: nil, blue: nil, alpha: &alpha)
        XCTAssertEqual(alpha, ToolMapping.highlighterAlpha, accuracy: 0.01)
    }

    func testMapsEraserModes() throws {
        let stroke = try XCTUnwrap(ToolMapping.pkTool(for: .eraser(.stroke, width: 10)) as? PKEraserTool)
        let pixel = try XCTUnwrap(ToolMapping.pkTool(for: .eraser(.pixel, width: 10)) as? PKEraserTool)
        XCTAssertEqual(stroke.eraserType, .vector)
        XCTAssertEqual(pixel.eraserType, .fixedWidthBitmap)
        // Widths are clamped to PencilKit's range for the eraser type (the pixel eraser starts around 16 pt).
        let range = PKEraserTool.EraserType.fixedWidthBitmap.validWidthRange
        XCTAssertEqual(pixel.width, ToolMapping.clamp(10, to: range), accuracy: 0.001)
        XCTAssertTrue(range.contains(pixel.width))
    }

    func testMapsLasso() {
        XCTAssertNotNil(ToolMapping.pkTool(for: .lasso) as? PKLassoTool)
    }

    func testClampsWidthsToPencilKitRanges() throws {
        let range = PKInkingTool.InkType.pen.validWidthRange
        let wide = try XCTUnwrap(ToolMapping.pkTool(for: .ink(.pen, color: blue, width: 100)) as? PKInkingTool)
        XCTAssertEqual(wide.width, range.upperBound, accuracy: 0.001)
        XCTAssertEqual(ToolMapping.clamp(-5, to: 1...10), 1)
        XCTAssertEqual(ToolMapping.clamp(50, to: 1...10), 10)
        XCTAssertEqual(ToolMapping.clamp(5, to: 1...10), 5)
    }
}

final class PencilActionsTests: XCTestCase {
    func testNamesMatchTheSharedSchema() {
        XCTAssertEqual(PencilActions.name(for: .ignore), "ignore")
        XCTAssertEqual(PencilActions.name(for: .switchEraser), "switchEraser")
        XCTAssertEqual(PencilActions.name(for: .switchPrevious), "switchPrevious")
        XCTAssertEqual(PencilActions.name(for: .showColorPalette), "showColorPalette")
        XCTAssertEqual(PencilActions.name(for: .showInkAttributes), "showInkAttributes")
        XCTAssertEqual(PencilActions.name(for: .showContextualPalette), "showContextualPalette")
        XCTAssertEqual(PencilActions.name(for: .runSystemShortcut), "runSystemShortcut")
    }
}
