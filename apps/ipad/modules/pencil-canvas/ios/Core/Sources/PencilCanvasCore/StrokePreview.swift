import PencilKit
import UIKit

/// A sample stroke drawn with the real PencilKit ink, for the toolbar's width and colour previews:
/// the user sees what the pen, pencil or highlighter will put on the page.
enum StrokePreview {
    static let pointCount = 64

    /// The point size PencilKit records for a tool of a given width, which alone decides how thick a
    /// stroke renders (force and `secondaryScale` don't). Measured on the owner's iPad (iPadOS 27) on
    /// Sep 30, 2026, from calibration strokes at known widths and 462 everyday strokes:
    /// - pen: 0.9 → 2.61, 1.5 → 2.68, 2 → 2.72, 3 → 2.93, 6 → 3.17, so about 2.51 + 0.11 × width
    ///   (points below about 2 render nothing, which is why `size = width` left thin previews blank);
    /// - monoline: 2.5 up to a 1.5 pt tool, then 1.5 × width (4 → 6);
    /// - fountain pen: about width + 1.9 (1.5 → 3.2, 4 → 5.9, 10 → 11.8);
    /// - pencil: about 0.38 × width (4 → 1.53); marker: a 0.73 × 1 chisel of the width (18 → 13.2 × 19).
    static func pointSize(ink: PKInk.InkType, width: CGFloat) -> CGSize {
        switch ink {
        case .pen: square(2.51 + 0.11 * width)
        case .monoline: square(max(2.5, 1.5 * width))
        case .fountainPen: square(width + 1.9)
        case .pencil: square(width * 0.38)
        case .marker: CGSize(width: width * 0.73, height: width)
        default: square(width)
        }
    }

    private static func square(_ side: CGFloat) -> CGSize {
        CGSize(width: side, height: side)
    }

    static let force: CGFloat = 0.55
    static let altitude: CGFloat = 0.84
    static let azimuth: CGFloat = 1.75

    /// A gentle wave across `size`, one stroke in the tool's ink. Erasers and the lasso draw nothing.
    static func drawing(for spec: CanvasToolSpec, size: CGSize) -> PKDrawing {
        guard size.width > 0, size.height > 0,
            let inking = ToolMapping.pkTool(for: spec) as? PKInkingTool
        else { return PKDrawing() }
        let pointSize = pointSize(ink: inking.ink.inkType, width: inking.width)
        let points = (0..<pointCount).map { step in
            let progress = CGFloat(step) / CGFloat(pointCount - 1)
            let location = CGPoint(
                x: size.width * (0.1 + 0.8 * progress),
                y: size.height * (0.5 - 0.22 * sin(progress * .pi * 2)))
            return PKStrokePoint(
                location: location, timeOffset: TimeInterval(step) * 0.01, size: pointSize, opacity: 1,
                force: force, azimuth: azimuth, altitude: altitude)
        }
        let path = PKStrokePath(controlPoints: points, creationDate: Date())
        return fitted(PKDrawing(strokes: [PKStroke(ink: inking.ink, path: path)]), in: size)
    }

    /// The preview as an image, for tests. The app shows `drawing` in a `PKCanvasView` instead:
    /// `PKDrawing.image` renders thin pen strokes almost transparent. Rendered under a light trait,
    /// since the paper is always white.
    static func image(for spec: CanvasToolSpec, size: CGSize, scale: CGFloat) -> UIImage {
        let drawing = drawing(for: spec, size: size)
        var image = UIImage()
        UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
            image = drawing.image(from: CGRect(origin: .zero, size: size), scale: scale)
        }
        return image
    }

    /// Shrinks a stroke too thick for the preview (a wide highlighter) so none of it is cut off.
    /// Thinner strokes keep their true size.
    private static func fitted(_ drawing: PKDrawing, in size: CGSize) -> PKDrawing {
        let bounds = drawing.bounds
        guard bounds.width > 0, bounds.height > 0 else { return drawing }
        let scale = min(1, size.width / bounds.width, size.height / bounds.height)
        let scaled = drawing.transformed(using: CGAffineTransform(scaleX: scale, y: scale))
        let offset = CGPoint(x: size.width / 2 - scaled.bounds.midX, y: size.height / 2 - scaled.bounds.midY)
        return scaled.transformed(using: CGAffineTransform(translationX: offset.x, y: offset.y))
    }
}
