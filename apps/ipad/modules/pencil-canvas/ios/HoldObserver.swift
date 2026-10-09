import UIKit.UIGestureRecognizerSubclass

/// Watches the drawing touch for the hold that asks for a shape; `ShapeHold` decides, this feeds
/// it the touch and runs the clock. Passive, like the other observers: it never recognizes, delays
/// or cancels a touch.
@MainActor
final class HoldObserver: UIGestureRecognizer, UIGestureRecognizerDelegate {
    /// The touch has rested long enough: the points it has drawn so far, in the view's coordinates.
    var onRest: (_ points: [CGPoint]) -> Void = { _ in }
    /// The touch moved on after resting, lifted or was cancelled.
    var onRestEnded: () -> Void = {}

    private var hold = ShapeHold()
    private weak var tracked: UITouch?
    private var points: [CGPoint] = []
    private var wait: Task<Void, Never>?
    private var isResting = false
    /// A second finger joined: the touches are a scroll or a zoom until they have all lifted.
    private var isIgnoring = false
    /// Whether the last touch to lift was held, and when it lifted.
    private var lastLift: (held: Bool, time: TimeInterval)?

    init() {
        super.init(target: nil, action: nil)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
        delegate = self
    }

    /// Whether the touch that just lifted, no longer than `window` ago, was held. Answers once per
    /// lift, so a later change to the drawing can't be taken for the same stroke.
    func takeHeldLift(within window: TimeInterval) -> Bool {
        defer { lastLift = nil }
        guard let lastLift else { return false }
        return lastLift.held && ProcessInfo.processInfo.systemUptime - lastLift.time < window
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        if let pencil = touches.first(where: { $0.type == .pencil }) {
            // The Pencil always draws, whatever a resting palm is doing.
            track(pencil)
        } else if tracked == nil, !isIgnoring, let finger = touches.first {
            track(finger)
        } else if tracked?.type != .pencil {
            stopTracking()
            isIgnoring = true
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        guard let touch = tracked, touches.contains(touch) else { return }
        let location = touch.location(in: view)
        points.append(location)
        if hold.move(to: location, time: touch.timestamp) {
            endRest()
            startWait()
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        if let touch = tracked, touches.contains(touch) {
            lastLift = (hold.lift(at: touch.location(in: view), time: touch.timestamp), touch.timestamp)
            stopTracking()
        }
        finishIfAllLifted(event)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        if let touch = tracked, touches.contains(touch) { stopTracking() }
        finishIfAllLifted(event)
    }

    override func reset() {
        super.reset()
        stopTracking()
        isIgnoring = false
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }

    private func track(_ touch: UITouch) {
        stopTracking()
        tracked = touch
        lastLift = nil
        let location = touch.location(in: view)
        points = [location]
        hold.begin(at: location, time: touch.timestamp)
        startWait()
    }

    private func stopTracking() {
        tracked = nil
        hold.cancel()
        wait?.cancel()
        endRest()
    }

    /// Asks `ShapeHold` after its duration whether the touch is still on the same spot.
    private func startWait() {
        wait?.cancel()
        wait = Task { [weak self] in
            try? await Task.sleep(for: .seconds(ShapeHold.duration))
            guard let self, !Task.isCancelled, hold.settle(time: ProcessInfo.processInfo.systemUptime) else { return }
            isResting = true
            onRest(points)
        }
    }

    private func endRest() {
        guard isResting else { return }
        isResting = false
        onRestEnded()
    }

    private func finishIfAllLifted(_ event: UIEvent) {
        let down = event.allTouches?.contains { $0.phase != .ended && $0.phase != .cancelled } ?? false
        guard !down else { return }
        isIgnoring = false
        state = .failed
    }
}
