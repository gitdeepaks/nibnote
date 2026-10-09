import CoreGraphics
import Foundation

/// Decides whether a drawing touch ended "held": resting in one spot long enough to ask for a
/// shape. It only keeps time and distance; `HoldObserver` feeds it the touch and runs the clock.
struct ShapeHold {
    /// How long the touch must stay in one spot, in seconds.
    static let duration: TimeInterval = 0.45
    /// How far a resting touch may wander and still be in the same spot, in screen points.
    static let slop: CGFloat = 6
    /// A hand moves a little as it lifts. A lift this close to where the touch rested, this soon
    /// after leaving that spot, still counts as held. (Without it, one snap in six was lost in the
    /// spike: the preview showed, and the lift moved the Pencil more than `slop`.)
    static let liftReach: CGFloat = 30
    static let liftWindow: TimeInterval = 1

    /// Where the touch has stayed, within `slop`, and since when.
    private var spot: (point: CGPoint, since: TimeInterval)?
    /// Where the touch rested for `duration`, and when it moved on from there (nil while it rests).
    private var rest: (point: CGPoint, leftAt: TimeInterval?)?

    mutating func begin(at point: CGPoint, time: TimeInterval) {
        spot = (point, time)
        rest = nil
    }

    /// Follows the touch. Returns whether it left its spot, which starts the wait again from here.
    mutating func move(to point: CGPoint, time: TimeInterval) -> Bool {
        guard let current = spot, hypot(point.x - current.point.x, point.y - current.point.y) > Self.slop
        else { return false }
        spot = (point, time)
        if let resting = rest, resting.leftAt == nil { rest = (resting.point, time) }
        return true
    }

    /// Asked when the wait is over: has the touch stayed on its spot for `duration`? If so it is
    /// resting from now on. (A few milliseconds are allowed for the clock that asks.)
    mutating func settle(time: TimeInterval) -> Bool {
        guard let current = spot, time - current.since >= Self.duration - 0.01 else { return false }
        rest = (current.point, nil)
        return true
    }

    /// Ends the touch and says whether it counts as held.
    mutating func lift(at point: CGPoint, time: TimeInterval) -> Bool {
        defer { cancel() }
        guard let current = spot else { return false }
        if time - current.since >= Self.duration { return true }
        guard let rest else { return false }
        guard let leftAt = rest.leftAt else { return true }
        return hypot(point.x - rest.point.x, point.y - rest.point.y) <= Self.liftReach
            && time - leftAt <= Self.liftWindow
    }

    mutating func cancel() {
        spot = nil
        rest = nil
    }
}
