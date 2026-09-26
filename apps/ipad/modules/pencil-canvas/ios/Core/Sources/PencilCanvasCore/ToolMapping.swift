import PencilKit
import UIKit

/// Maps a validated `CanvasToolSpec` to the PencilKit tool the canvas uses.
enum ToolMapping {
    /// PencilKit has no highlighter ink, so the highlighter is a translucent marker.
    static let highlighterAlpha: CGFloat = 0.35

    static func pkTool(for spec: CanvasToolSpec) -> any PKTool {
        switch spec {
        case let .ink(kind, color, width):
            let inkType = inkType(for: kind)
            return PKInkingTool(inkType, color: uiColor(color), width: clamp(width, to: inkType.validWidthRange))
        case let .highlighter(color, width):
            let translucent = RGBAColor(
                red: color.red,
                green: color.green,
                blue: color.blue,
                alpha: color.alpha * highlighterAlpha
            )
            let range = PKInkingTool.InkType.marker.validWidthRange
            return PKInkingTool(.marker, color: uiColor(translucent), width: clamp(width, to: range))
        case let .eraser(mode, width):
            let eraserType = eraserType(for: mode)
            return PKEraserTool(eraserType, width: clamp(width, to: eraserType.validWidthRange))
        case .lasso:
            return PKLassoTool()
        }
    }

    static func inkType(for kind: InkKind) -> PKInkingTool.InkType {
        switch kind {
        case .pen: .pen
        case .fountainPen: .fountainPen
        case .pencil: .pencil
        case .marker: .marker
        case .monoline: .monoline
        }
    }

    /// The pixel eraser uses `.fixedWidthBitmap` so the chosen width is respected;
    /// PencilKit's plain `.bitmap` eraser varies its width with pressure.
    static func eraserType(for mode: EraserMode) -> PKEraserTool.EraserType {
        switch mode {
        case .stroke: .vector
        case .pixel: .fixedWidthBitmap
        }
    }

    static func uiColor(_ color: RGBAColor) -> UIColor {
        UIColor(red: color.red, green: color.green, blue: color.blue, alpha: color.alpha)
    }

    static func clamp(_ value: CGFloat, to range: ClosedRange<CGFloat>) -> CGFloat {
        min(max(value, range.lowerBound), range.upperBound)
    }
}
