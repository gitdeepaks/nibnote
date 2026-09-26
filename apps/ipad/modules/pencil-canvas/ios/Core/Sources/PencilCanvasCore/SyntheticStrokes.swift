import PencilKit
import UIKit

/// Generates realistic-sized handwriting strokes for performance tests (the Phase 1 exit criteria
/// need 500 strokes on a page and 2,000 on a Whiteboard). Used by XCTest and the dev-only Canvas Lab.
enum SyntheticStrokes {
    static let columns = 20
    static let pointsPerStroke = 24

    static func drawing(count: Int, pageSize: CGSize) -> PKDrawing {
        guard count > 0, pageSize.width > 0, pageSize.height > 0 else { return PKDrawing() }
        let rows = (count + columns - 1) / columns
        let cell = CGSize(width: pageSize.width / CGFloat(columns), height: pageSize.height / CGFloat(rows))
        let ink = PKInk(.pen, color: .black)
        let strokes = (0..<count).map { index in
            let origin = CGPoint(
                x: CGFloat(index % columns) * cell.width,
                y: CGFloat(index / columns) * cell.height)
            return PKStroke(ink: ink, path: path(in: CGRect(origin: origin, size: cell)))
        }
        return PKDrawing(strokes: strokes)
    }

    /// A zig-zag across the cell, like a scribbled word.
    private static func path(in cell: CGRect) -> PKStrokePath {
        let inset = cell.insetBy(dx: cell.width * 0.1, dy: cell.height * 0.25)
        let points = (0..<pointsPerStroke).map { step in
            let progress = CGFloat(step) / CGFloat(pointsPerStroke - 1)
            let location = CGPoint(
                x: inset.minX + inset.width * progress,
                y: step.isMultiple(of: 2) ? inset.minY : inset.maxY)
            return PKStrokePoint(
                location: location, timeOffset: TimeInterval(step) * 0.008, size: CGSize(width: 2.5, height: 2.5),
                opacity: 1, force: 1, azimuth: 0, altitude: .pi / 2)
        }
        return PKStrokePath(controlPoints: points, creationDate: Date())
    }
}
