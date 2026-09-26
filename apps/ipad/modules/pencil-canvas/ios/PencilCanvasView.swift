import ExpoModulesCore
import PencilKit
import UIKit

/// Identity of the page on screen. A change of either field means a different page.
struct PageRef: Equatable, Sendable {
    let pageId: String
    let fileURL: URL
}

enum PageState: Equatable {
    case idle
    case loading
    case ready
    /// The file couldn't be read; the page is never saved, so it can't be overwritten.
    case readOnly
}

/// Glue between React props/events and the Core pieces: `PageSurface` (layout), `DrawingStore`
/// (files) and `AutosaveScheduler` (debounce). Props are collected by the setters and applied once
/// per update in `applyProps()`, and each piece of work only runs when its input changed.
final class PencilCanvasView: ExpoView {
    let onDrawingChanged = EventDispatcher()
    let onPencilAction = EventDispatcher()
    let onCanvasError = EventDispatcher()

    let canvasView = PageCanvasView()
    let store = DrawingStore()
    private(set) lazy var surface = PageSurface(canvasView: canvasView)
    private(set) lazy var autosave = AutosaveScheduler { [weak self] in
        await self?.saveCurrentPage()
    }
    private let toolPicker = PKToolPicker()
    private let pencilInteraction = UIPencilInteraction()
    private static let defaultInk = RGBAColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1)

    // Desired state from props.
    var pageId = ""
    var drawingFileUri = ""
    var drawingPolicy: PKCanvasViewDrawingPolicy = .pencilOnly
    var showsSystemToolPicker = false
    private var pageSize = CGSize(width: 595, height: 842)
    private var template: PageTemplateSpec = .blank
    private var tool: CanvasToolSpec = .ink(.pen, color: PencilCanvasView.defaultInk, width: 3)
    private var propErrors: [(code: String, message: String)] = []

    // Applied state, so unchanged props cost nothing.
    private var appliedTool: CanvasToolSpec?
    private var appliedToolPickerVisibility = false

    // Page state (used by the persistence and events extensions).
    var page: PageRef?
    var pageState: PageState = .idle
    var loadGeneration = 0
    var hasUnsavedChanges = false
    var isReplacingDrawing = false
    var lastDrawingChanged: DrawingChangedRecord?
    var isDrawingChangedScheduled = false

    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        backgroundColor = .systemGray5
        canvasView.backgroundColor = .clear
        canvasView.isOpaque = false
        // Ink colours stay exactly as chosen; the paper is always white in v1.0.
        canvasView.overrideUserInterfaceStyle = .light
        canvasView.drawingPolicy = drawingPolicy
        canvasView.delegate = self
        canvasView.drawingGestureRecognizer.isEnabled = false
        addSubview(canvasView)
        _ = surface
        pencilInteraction.delegate = self
        addInteraction(pencilInteraction)
        NotificationCenter.default.addObserver(
            self, selector: #selector(appWillResignActive),
            name: UIApplication.willResignActiveNotification, object: nil)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        canvasView.frame = bounds
        surface.viewportDidChange(to: bounds.size)
    }

    override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        if newWindow == nil {
            Task { await autosave.flush() }
        }
    }

    @objc private func appWillResignActive() {
        Task { await autosave.flush() }
    }

    // MARK: - Props

    func setPageSize(_ record: PageSizeRecord) {
        guard record.widthPt > 0, record.heightPt > 0, record.widthPt <= 10_000, record.heightPt <= 10_000 else {
            propErrors.append((code: "invalidTemplate", message: "invalid page size"))
            return
        }
        pageSize = CGSize(width: record.widthPt, height: record.heightPt)
    }

    func setTemplate(_ record: TemplateRecord) {
        guard let spec = PageTemplateSpec.parse(kind: record.kind, spacingPt: record.spacingPt) else {
            propErrors.append((code: "invalidTemplate", message: "unsupported template \(record.kind)"))
            return
        }
        template = spec
    }

    func setTool(_ record: ToolRecord) {
        switch CanvasToolSpec.parse(record.raw) {
        case let .success(spec): tool = spec
        case let .failure(error): propErrors.append((code: "invalidTool", message: "\(error)"))
        }
    }

    func setDrawingPolicy(_ value: String) {
        drawingPolicy = value == "anyInput" ? .anyInput : .pencilOnly
    }

    func applyProps() {
        if canvasView.drawingPolicy != drawingPolicy {
            canvasView.drawingPolicy = drawingPolicy
        }
        if appliedTool != tool {
            canvasView.tool = ToolMapping.pkTool(for: tool)
            appliedTool = tool
        }
        applyToolPickerVisibility()

        let next = URL(string: drawingFileUri).flatMap { url in
            url.isFileURL && !pageId.isEmpty ? PageRef(pageId: pageId, fileURL: url) : nil
        }
        let pageChanged = next != page
        if pageChanged {
            // Save the outgoing page with its own geometry before the new props replace it.
            flushOutgoingPage()
            page = next
        }
        surface.configure(pageSize: pageSize, template: template)
        if pageChanged, let next {
            load(next)
        }
        for error in propErrors {
            emitError(code: error.code, message: error.message)
        }
        propErrors.removeAll()
    }

    /// Debug-only fallback from the build plan: Apple's own tool picker.
    private func applyToolPickerVisibility() {
        guard appliedToolPickerVisibility != showsSystemToolPicker else { return }
        appliedToolPickerVisibility = showsSystemToolPicker
        toolPicker.setVisible(showsSystemToolPicker, forFirstResponder: canvasView)
        if showsSystemToolPicker {
            toolPicker.addObserver(canvasView)
            canvasView.becomeFirstResponder()
        } else {
            // The system picker may have changed the tool; put the prop's tool back.
            toolPicker.removeObserver(canvasView)
            canvasView.tool = ToolMapping.pkTool(for: tool)
            appliedTool = tool
        }
    }
}
