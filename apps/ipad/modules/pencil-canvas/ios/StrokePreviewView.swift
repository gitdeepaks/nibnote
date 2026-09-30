import ExpoModulesCore
import PencilKit
import UIKit

/// A sample stroke in the tool's real PencilKit ink, for the toolbar's width and colour popovers.
/// It is drawn by a small, non-interactive `PKCanvasView`: the same renderer as the page. The
/// first version used `PKDrawing.image`, which renders thin pen strokes (about 2.5 pt and less)
/// almost transparent, so a 2.4 pt pen showed on the page but not in the preview (seen on device).
/// Transparent: the React side draws the paper.
final class StrokePreviewView: ExpoView {
    private let canvasView = PKCanvasView()
    private var spec: CanvasToolSpec?
    private var rendered: Rendered?

    /// What the canvas shows; any difference draws it again.
    private struct Rendered: Equatable {
        let spec: CanvasToolSpec
        let size: CGSize
    }

    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        clipsToBounds = true
        canvasView.isUserInteractionEnabled = false
        canvasView.drawingGestureRecognizer.isEnabled = false
        canvasView.isScrollEnabled = false
        canvasView.backgroundColor = .clear
        canvasView.isOpaque = false
        // The paper is always white, so ink colours must never adapt to dark mode.
        canvasView.overrideUserInterfaceStyle = .light
        addSubview(canvasView)
    }

    func setTool(_ record: ToolRecord) {
        switch CanvasToolSpec.parse(record.raw) {
        case let .success(parsed): spec = parsed
        case .failure: spec = nil
        }
        render()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        canvasView.frame = bounds
        render()
    }

    /// Replaces the sample drawing only when the tool or the size changed; a slider drag changes the
    /// width every frame.
    private func render() {
        guard let spec, bounds.width > 0, bounds.height > 0 else {
            if spec == nil {
                canvasView.drawing = PKDrawing()
                rendered = nil
            }
            return
        }
        let next = Rendered(spec: spec, size: bounds.size)
        guard next != rendered else { return }
        rendered = next
        canvasView.drawing = StrokePreview.drawing(for: spec, size: bounds.size)
    }
}
