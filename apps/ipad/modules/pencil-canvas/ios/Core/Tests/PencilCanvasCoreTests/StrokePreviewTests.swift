import PencilKit
import XCTest

@testable import PencilCanvasCore

final class StrokePreviewTests: XCTestCase {
    private let size = CGSize(width: 240, height: 64)
    private let blue = RGBAColor(red: 0.04, green: 0.38, blue: 1, alpha: 1)

    func testDrawsOneStrokeInTheToolsInk() {
        let drawing = StrokePreview.drawing(for: .ink(.fountainPen, color: blue, width: 6), size: size)
        XCTAssertEqual(drawing.strokes.count, 1)
        XCTAssertEqual(drawing.strokes.first?.ink.inkType, .fountainPen)
        XCTAssertEqual(drawing.strokes.first?.path.first?.size.width ?? 0, 7.9, accuracy: 0.001)
    }

    func testPointSizesFollowHowPencilKitRecordsEachInk() {
        XCTAssertEqual(StrokePreview.pointSize(ink: .pen, width: 0.9).width, 2.609, accuracy: 0.001)
        XCTAssertEqual(StrokePreview.pointSize(ink: .pen, width: 6).width, 3.17, accuracy: 0.001)
        XCTAssertEqual(StrokePreview.pointSize(ink: .monoline, width: 0.5).width, 2.5, accuracy: 0.001)
        XCTAssertEqual(StrokePreview.pointSize(ink: .monoline, width: 4).width, 6, accuracy: 0.001)
        XCTAssertEqual(StrokePreview.pointSize(ink: .fountainPen, width: 4).width, 5.9, accuracy: 0.001)
        XCTAssertEqual(StrokePreview.pointSize(ink: .pencil, width: 4).width, 1.52, accuracy: 0.001)
        let marker = StrokePreview.pointSize(ink: .marker, width: 18)
        XCTAssertEqual(marker.width, 13.14, accuracy: 0.001)
        XCTAssertEqual(marker.height, 18, accuracy: 0.001)
    }

    func testAWideHighlighterIsShrunkToFitThePreview() {
        let bounds = StrokePreview.drawing(for: .highlighter(color: blue, width: 60), size: size).bounds
        XCTAssertGreaterThanOrEqual(bounds.minX, -1)
        XCTAssertGreaterThanOrEqual(bounds.minY, -1)
        XCTAssertLessThanOrEqual(bounds.maxX, size.width + 1)
        XCTAssertLessThanOrEqual(bounds.maxY, size.height + 1)
    }

    func testEvenTheThinnestPenShowsAndWiderInkCoversMore() {
        let thinnest = inkedPixels(StrokePreview.image(for: .ink(.pen, color: blue, width: 0.9), size: size, scale: 2))
        let thick = inkedPixels(StrokePreview.image(for: .ink(.pen, color: blue, width: 20), size: size, scale: 2))
        XCTAssertGreaterThan(thinnest, 0)
        XCTAssertGreaterThan(thick, thinnest * 2)
    }

    func testPointSizesGrowWithWidthForEveryInk() {
        for ink in [PKInk.InkType.pen, .monoline, .fountainPen, .pencil, .marker] {
            let widths: [CGFloat] = [0.5, 1, 2, 4, 8, 16]
            let sides = widths.map { StrokePreview.pointSize(ink: ink, width: $0).height }
            XCTAssertEqual(sides, sides.sorted(), "\(ink.rawValue)")
        }
    }

    func testEraserAndLassoDrawNothing() {
        XCTAssertTrue(StrokePreview.drawing(for: .eraser(.pixel, width: 20), size: size).strokes.isEmpty)
        XCTAssertTrue(StrokePreview.drawing(for: .lasso, size: size).strokes.isEmpty)
        XCTAssertTrue(StrokePreview.drawing(for: .ink(.pen, color: blue, width: 3), size: .zero).strokes.isEmpty)
    }

    /// Pixels with any ink on them.
    private func inkedPixels(_ image: UIImage) -> Int {
        guard let cgImage = image.cgImage else { return 0 }
        let width = cgImage.width
        let height = cgImage.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard
                let context = CGContext(
                    data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                    bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard drawn else { return 0 }
        return stride(from: 3, to: pixels.count, by: 4).filter { pixels[$0] > 0 }.count
    }
}
