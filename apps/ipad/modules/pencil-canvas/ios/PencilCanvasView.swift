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
    let onPageSwipe = EventDispatcher()
    let onToolUsage = EventDispatcher()
    let onHistoryGesture = EventDispatcher()
    /// Development builds only: the Pencil Pro haptic was played (so it can be checked on any Pencil).
    let onToolFeedback = EventDispatcher()

    let canvasView = PageCanvasView()
    let store = DrawingStore()
    let thumbnails = ThumbnailWriter()
    private(set) lazy var surface = PageSurface(canvasView: canvasView)
    private(set) lazy var autosave = AutosaveScheduler { [weak self] in
        await self?.saveCurrentPage()
    }
    /// Gesture delegates are weak, so the view keeps the swipe gate alive.
    private(set) lazy var pageSwipeGate = PageSwipeGate { [weak self] touches in
        self?.allowsPageSwipe(touches: touches) ?? false
    }
    /// Gesture delegates are weak, so the view keeps the finger-tap gate alive too.
    private(set) lazy var fingerTapGate = FingerTapGate { [weak self] in
        self?.currentViewport ?? FingerTap.Viewport(zoom: 0, offset: .zero)
    }
    /// "Erase highlighter only": Nibnote's own eraser, used instead of PencilKit's while that tool is set.
    private(set) lazy var highlighterEraser = HighlighterEraserInput(canvasView: canvasView)
    var appliedHighlighterEraserState: (
        configuration: HighlighterEraserInput.Configuration?, policy: PKCanvasViewDrawingPolicy
    )?
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
    var currentTool: CanvasToolSpec { tool }
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
    /// Counts every change to the canvas's drawing (the highlighter eraser checks its index against it).
    var drawingVersion = 0
    /// A stroke, erase or lasso is touching the page (between the begin and end of `onToolUsage`).
    var isToolInUse = false
    /// Where a tool last lifted from this page, in the canvas's scrolling content, so it still
    /// points at the same spot after a scroll or zoom.
    var lastTouchInContent: CGPoint?
    /// A light tap for tool changes made with the Pencil; only Apple Pencil Pro plays it.
    private(set) lazy var toolFeedbackGenerator = UIImpactFeedbackGenerator(style: .light, view: self)
    /// Watches Pencil touches in the whole window (see `ToolFeedbackRule`).
    let pencilTouchObserver = PencilTouchObserver()
    /// The last Pencil tap outside the page, or double-tap or squeeze, that may change the tool.
    var lastPencilEvent: PencilEvent?

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
        canvasView.drawingGestureRecognizer.addTarget(self, action: #selector(trackDrawingTouch(_:)))
        addSubview(canvasView)
        _ = surface
        pencilInteraction.delegate = self
        addInteraction(pencilInteraction)
        installPageSwipes()
        installHighlighterEraser()
        installFingerTaps()
        installToolFeedback()
        // VoiceOver claims every touch for navigation (tap selects, double-tap activates), so without
        // this nothing could be written with it on. Direct interaction passes touches on the page
        // straight to PencilKit, as Apple intends for drawing surfaces.
        isAccessibilityElement = true
        accessibilityTraits = .allowsDirectInteraction
        accessibilityLabel = "Writing area"
        accessibilityHint = "Write or draw directly on the page."
        NotificationCenter.default.addObserver(
            self, selector: #selector(appWillResignActive),
            name: UIApplication.willResignActiveNotification, object: nil)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        canvasView.frame = bounds
        surface.viewportDidChange(to: bounds.size)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        pencilTouchObserver.view?.removeGestureRecognizer(pencilTouchObserver)
        window?.addGestureRecognizer(pencilTouchObserver)
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
            let previous = appliedTool
            canvasView.tool = ToolMapping.pkTool(for: tool)
            appliedTool = tool
            playToolFeedback(after: previous)
        }
        applyHighlighterEraser()
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
            surface.showNewPage()
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
