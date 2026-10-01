import PencilKit
import UIKit

/// Runs "erase highlighter only" on the canvas. PencilKit's drawing gesture is off while it is
/// active, so this reads the eraser's touches itself, erases with Core's `HighlighterEraser`, and
/// applies the result at most once per screen refresh (the Pencil reports touches faster than the
/// screen draws, and rebuilding the drawing costs a few milliseconds).
@MainActor
final class HighlighterEraserInput: NSObject, UIGestureRecognizerDelegate {
    struct Configuration: Equatable {
        let mode: HighlighterEraser.Mode
        /// The pixel eraser's width in page points; the stroke eraser has none.
        let width: CGFloat
    }

    /// How close to the tip the stroke eraser reaches, in screen points. PencilKit's stroke eraser
    /// has no width setting either.
    static let strokeReach: CGFloat = 6

    var onBegin: () -> Void = {}
    /// Counts changes to the canvas's drawing, so a prepared session is known to be current.
    var drawingVersion: () -> Int = { 0 }
    /// The drawing before the gesture, and whether the gesture changed it.
    var onEnd: (_ before: PKDrawing, _ changed: Bool) -> Void = { _, _ in }

    private let canvasView: PageCanvasView
    private let gesture = UILongPressGestureRecognizer()
    private let cursor = CAShapeLayer()
    private let defaultPanTouchTypes: [NSNumber]
    private let defaultPanMinimumTouches: Int
    private(set) var configuration: Configuration?
    private var session: HighlighterEraser.Session?
    private var before: PKDrawing?
    private var lastPoint: CGPoint?
    private var pending: [CGPoint] = []
    private var displayLink: CADisplayLink?
    /// The page indexed ahead of the next gesture, for the drawing version it was built from.
    private var prepared: (version: Int, session: HighlighterEraser.Session)?
    private var preparing: Task<Void, Never>?
    /// How long the page must stay unchanged before it is indexed again.
    private static let prepareDelay: Duration = .milliseconds(300)

    init(canvasView: PageCanvasView) {
        self.canvasView = canvasView
        defaultPanTouchTypes = canvasView.panGestureRecognizer.allowedTouchTypes
        defaultPanMinimumTouches = canvasView.panGestureRecognizer.minimumNumberOfTouches
        super.init()
        // Begins on touch-down, so a tap erases too, and follows the touch however far it moves.
        gesture.minimumPressDuration = 0
        gesture.allowableMovement = .greatestFiniteMagnitude
        gesture.numberOfTouchesRequired = 1
        gesture.addTarget(self, action: #selector(handle(_:)))
        gesture.delegate = self
        gesture.isEnabled = false
        canvasView.addGestureRecognizer(gesture)
        cursor.fillColor = UIColor(white: 1, alpha: 0.35).cgColor
        cursor.strokeColor = UIColor(white: 0.45, alpha: 0.9).cgColor
        cursor.lineWidth = 1
        cursor.isHidden = true
        cursor.zPosition = 1000
        canvasView.layer.addSublayer(cursor)
    }

    var isActive: Bool { configuration != nil }

    /// Turns the eraser on (a configuration) or off (nil). With Apple Pencil only, the scroll view
    /// keeps fingers and the eraser takes the Pencil; when fingers draw, one finger erases and two
    /// scroll, as with PencilKit's own tools.
    func configure(_ next: Configuration?, policy: PKCanvasViewDrawingPolicy) {
        if next == nil {
            cancel()
            preparing?.cancel()
            prepared = nil
        }
        configuration = next
        if next != nil { schedulePrepare() }
        gesture.isEnabled = next != nil
        let pencil = NSNumber(value: UITouch.TouchType.pencil.rawValue)
        let finger = NSNumber(value: UITouch.TouchType.direct.rawValue)
        gesture.allowedTouchTypes = policy == .anyInput ? [pencil, finger] : [pencil]
        let pan = canvasView.panGestureRecognizer
        if next == nil {
            pan.allowedTouchTypes = defaultPanTouchTypes
            pan.minimumNumberOfTouches = defaultPanMinimumTouches
        } else {
            pan.allowedTouchTypes = [finger]
            pan.minimumNumberOfTouches = policy == .anyInput ? 2 : defaultPanMinimumTouches
        }
    }

    /// The canvas's drawing changed outside a gesture (undo, redo, a new page): index it again once
    /// it settles. Changes made by a gesture are already in its session.
    func drawingDidChange() {
        guard isActive, session == nil else { return }
        schedulePrepare()
    }

    /// Indexes the page while nothing is happening, so the next touch starts at once (indexing a
    /// 2,000-stroke page takes ~25 ms, which showed as a dropped frame on the first touch).
    private func schedulePrepare() {
        preparing?.cancel()
        preparing = Task { [weak self] in
            try? await Task.sleep(for: Self.prepareDelay)
            guard !Task.isCancelled else { return }
            self?.prepare()
        }
    }

    private func prepare() {
        guard isActive, session == nil else { return }
        let version = drawingVersion()
        if prepared?.version == version { return }
        prepared = (version, HighlighterEraser.Session(drawing: canvasView.drawing))
    }

    /// Ends a gesture in progress without erasing further (the page is being replaced).
    func cancel() {
        guard session != nil else { return }
        gesture.isEnabled = false
        gesture.isEnabled = configuration != nil
        finish(applyPending: false)
    }

    @objc private func handle(_ recognizer: UILongPressGestureRecognizer) {
        switch recognizer.state {
        case .began:
            begin(at: recognizer.location(in: canvasView))
        case .changed:
            pending.append(drawingPoint(recognizer.location(in: canvasView)))
            showCursor(at: recognizer.location(in: canvasView))
        case .ended, .cancelled, .failed:
            finish(applyPending: true)
        default:
            break
        }
    }

    private func begin(at location: CGPoint) {
        guard let configuration else { return }
        let drawing = canvasView.drawing
        before = drawing
        preparing?.cancel()
        if let prepared, prepared.version == drawingVersion() {
            session = prepared.session
        } else {
            session = HighlighterEraser.Session(drawing: drawing)
        }
        prepared = nil
        lastPoint = nil
        pending = [drawingPoint(location)]
        let link = CADisplayLink(target: self, selector: #selector(tick))
        link.add(to: .main, forMode: .common)
        displayLink = link
        showCursor(at: location)
        onBegin()
    }

    @objc private func tick() {
        apply()
    }

    /// Erases along the touches since the last refresh and shows the result.
    private func apply() {
        guard var current = session, !pending.isEmpty else { return }
        let points = (lastPoint.map { [$0] } ?? []) + pending
        lastPoint = pending.last
        pending.removeAll()
        let mode = configuration?.mode ?? .stroke
        let changed = current.erase(along: HighlighterEraser.Sweep(points: points, radius: radius), mode: mode)
        session = current
        if changed {
            canvasView.drawing = current.drawing
        }
    }

    private func finish(applyPending: Bool) {
        if applyPending { apply() }
        displayLink?.invalidate()
        displayLink = nil
        cursor.isHidden = true
        if let before, let session {
            onEnd(before, session.hasChanges)
        }
        before = nil
        session = nil
        lastPoint = nil
        pending.removeAll()
        // Index the page again from the canvas itself rather than reusing this gesture's strokes, so
        // the next gesture can never start from a page that differs from what is on screen.
        schedulePrepare()
    }

    /// The eraser's reach in page points: the pixel width zooms with the page like ink does, the
    /// stroke eraser's reach stays the same on screen.
    private var radius: CGFloat {
        guard let configuration else { return 0 }
        switch configuration.mode {
        case .stroke: return Self.strokeReach / max(canvasView.zoomScale, 0.01)
        case .pixel: return configuration.width / 2
        }
    }

    /// A point in the canvas's (zoomed, scrolled) content, in page points.
    private func drawingPoint(_ location: CGPoint) -> CGPoint {
        let zoom = max(canvasView.zoomScale, 0.01)
        return CGPoint(x: location.x / zoom, y: location.y / zoom)
    }

    private func showCursor(at location: CGPoint) {
        let onScreen = radius * canvasView.zoomScale
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let circle = CGRect(x: location.x, y: location.y, width: 0, height: 0).insetBy(dx: -onScreen, dy: -onScreen)
        cursor.path = CGPath(ellipseIn: circle, transform: nil)
        cursor.isHidden = false
        CATransaction.commit()
    }
}
