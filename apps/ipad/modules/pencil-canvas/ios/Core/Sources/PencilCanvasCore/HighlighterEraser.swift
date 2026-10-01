import PencilKit
import UIKit

/// The "erase highlighter only" eraser. PencilKit's eraser can't tell inks apart, so this works on
/// the drawing itself: only marker strokes (the highlighter) are touched, pen and pencil never.
/// - stroke mode removes every highlighter stroke the eraser touches;
/// - pixel mode cuts the eraser's path out of a stroke's `mask` (the stroke's visible area, kept in
///   the drawing file), so the cut edge is exact, as with PencilKit's own pixel eraser.
/// Pure value types: no UIKit state, testable on the simulator.
enum HighlighterEraser {
    enum Mode: Sendable {
        case stroke
        case pixel
    }

    /// The eraser's path since the last update (a frame's worth of movement), in drawing
    /// coordinates. One point is a tap. Joining a frame's movements lets each touched stroke be cut
    /// once per frame instead of once per touch event.
    struct Sweep: Equatable, Sendable {
        let points: [CGPoint]
        let radius: CGFloat

        init(points: [CGPoint], radius: CGFloat) {
            self.points = points
            self.radius = radius
        }

        init(from start: CGPoint, to end: CGPoint, radius: CGFloat) {
            self.init(points: [start, end], radius: radius)
        }

        /// Everything the sweep can reach.
        var bounds: CGRect {
            guard let first = points.first else { return .null }
            let box = points.dropFirst().reduce(CGRect(origin: first, size: .zero)) { box, point in
                box.union(CGRect(origin: point, size: .zero))
            }
            return box.insetBy(dx: -radius, dy: -radius)
        }

        /// The area the eraser covered: a round-capped band along the path.
        var area: CGPath {
            let line = CGMutablePath()
            guard let first = points.first else { return line }
            line.move(to: first)
            for point in points.dropFirst() {
                line.addLine(to: point)
            }
            if points.count == 1 {
                line.addLine(to: CGPoint(x: first.x + 0.01, y: first.y))
            }
            return line.copy(strokingWithWidth: radius * 2, lineCap: .round, lineJoin: .round, miterLimit: 1)
        }

        /// Distance from `point` to the eraser's path.
        func distance(to point: CGPoint) -> CGFloat {
            guard let first = points.first else { return .infinity }
            guard points.count > 1 else { return hypot(point.x - first.x, point.y - first.y) }
            return zip(points, points.dropFirst()).reduce(CGFloat.infinity) { nearest, segment in
                min(nearest, Self.distance(from: point, toSegment: segment.0, segment.1))
            }
        }

        private static func distance(from point: CGPoint, toSegment start: CGPoint, _ end: CGPoint) -> CGFloat {
            let deltaX = end.x - start.x
            let deltaY = end.y - start.y
            let lengthSquared = deltaX * deltaX + deltaY * deltaY
            guard lengthSquared > 0 else { return hypot(point.x - start.x, point.y - start.y) }
            let along = ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared
            let fraction = max(0, min(1, along))
            return hypot(point.x - (start.x + fraction * deltaX), point.y - (start.y + fraction * deltaY))
        }
    }

    /// Spacing of the points sampled along a stroke for hit testing, in points.
    static let sampleSpacing: CGFloat = 1.5
    /// Overlap smaller than this, in points, is an edge graze, not erasing.
    static let minimumOverlap: CGFloat = 0.5

    /// A page indexed for erasing. Indexes the highlighter strokes once (their bounds, computed from
    /// the path: PencilKit's `renderBounds` costs ~0.05–0.1 ms per stroke the first time), so each
    /// movement only looks at strokes near the eraser. Built ahead of the gesture when possible, so
    /// the first touch doesn't pay for it.
    struct Session {
        /// The page's strokes in order; an erased stroke becomes nil.
        private var strokes: [PKStroke?]
        /// Highlighter strokes: index into `strokes` and bounds in drawing coordinates.
        private var markers: [(index: Int, bounds: CGRect)]
        /// Whether any movement changed the page.
        private(set) var hasChanges = false

        init(drawing: PKDrawing) {
            let strokes = drawing.strokes
            self.strokes = strokes
            markers = strokes.indices.compactMap { index in
                let stroke = strokes[index]
                guard stroke.ink.inkType == .marker else { return nil }
                return (index, HighlighterEraser.bounds(of: stroke))
            }
        }

        /// Applies one movement; returns whether the page changed.
        mutating func erase(along sweep: Sweep, mode: Mode) -> Bool {
            let reach = sweep.bounds
            var changed = false
            for marker in markers where marker.bounds.intersects(reach) {
                guard let stroke = strokes[marker.index], HighlighterEraser.touches(stroke, sweep) else { continue }
                switch mode {
                case .stroke:
                    strokes[marker.index] = nil
                    changed = true
                case .pixel:
                    let result = HighlighterEraser.cut(stroke, by: sweep)
                    guard result != .unchanged else { continue }
                    if case let .cut(remaining) = result {
                        strokes[marker.index] = remaining
                    } else {
                        strokes[marker.index] = nil
                    }
                    changed = true
                }
            }
            hasChanges = hasChanges || changed
            return changed
        }

        var drawing: PKDrawing {
            PKDrawing(strokes: strokes.compactMap { $0 })
        }
    }

    /// The drawing after one eraser movement, or nil when nothing changed.
    static func erasing(_ drawing: PKDrawing, along sweep: Sweep, mode: Mode) -> PKDrawing? {
        var session = Session(drawing: drawing)
        return session.erase(along: sweep, mode: mode) ? session.drawing : nil
    }

    /// Whether the sweep reaches visible ink of the stroke.
    static func touches(_ stroke: PKStroke, _ sweep: Sweep) -> Bool {
        visibleSamples(of: stroke).contains { sample in
            sweep.distance(to: sample.location) <= sweep.radius + sample.halfWidth
        }
    }

    enum CutResult: Equatable {
        /// The sweep covers no part of the stroke that is still visible (already erased there).
        case unchanged
        case cut(PKStroke)
        /// No ink is left.
        case gone

        static func == (lhs: CutResult, rhs: CutResult) -> Bool {
            switch (lhs, rhs) {
            case (.unchanged, .unchanged), (.gone, .gone): true
            case let (.cut(left), .cut(right)): left.mask == right.mask
            default: false
            }
        }
    }

    /// Cuts the sweep out of the stroke's visible area.
    static func cut(_ stroke: PKStroke, by sweep: Sweep) -> CutResult {
        var toStroke = stroke.transform.inverted()
        guard let erased = sweep.area.copy(using: &toStroke) else { return .unchanged }
        let visible = stroke.mask?.cgPath ?? CGPath(rect: strokeSpaceBounds(of: stroke), transform: nil)
        // A saved mask comes back slightly reshaped, so a sweep over an already erased spot can still
        // graze its edge; only a real overlap counts.
        let overlap = visible.intersection(erased).boundingBoxOfPath
        guard !overlap.isNull, overlap.width > minimumOverlap, overlap.height > minimumOverlap else {
            return .unchanged
        }
        let left = visible.subtracting(erased)
        // An empty mask would make PencilKit show the whole stroke again, so nothing left means gone.
        guard !left.isEmpty, !left.boundingBoxOfPath.isNull else { return .gone }
        let remaining = PKStroke(
            ink: stroke.ink, path: stroke.path, transform: stroke.transform, mask: UIBezierPath(cgPath: left))
        // Drop a stroke whose ink is all cut away, so the file holds no invisible strokes.
        return visibleSamples(of: remaining).isEmpty ? .gone : .cut(remaining)
    }

    struct Sample {
        /// In drawing coordinates.
        let location: CGPoint
        let halfWidth: CGFloat
    }

    /// Points along the stroke that are still visible (inside its mask), in drawing coordinates.
    static func visibleSamples(of stroke: PKStroke) -> [Sample] {
        let mask = stroke.mask?.cgPath
        return stroke.path.interpolatedPoints(by: .distance(sampleSpacing)).compactMap { point in
            if let mask, !mask.contains(point.location) { return nil }
            return Sample(
                location: point.location.applying(stroke.transform),
                halfWidth: max(point.size.width, point.size.height) / 2)
        }
    }

    /// The stroke's extent in drawing coordinates, from its control points and their sizes.
    static func bounds(of stroke: PKStroke) -> CGRect {
        strokeSpaceBounds(of: stroke).applying(stroke.transform)
    }

    /// The stroke's extent in its own coordinates, with room for its widest point.
    private static func strokeSpaceBounds(of stroke: PKStroke) -> CGRect {
        var minX = CGFloat.infinity
        var minY = CGFloat.infinity
        var maxX = -CGFloat.infinity
        var maxY = -CGFloat.infinity
        var widest: CGFloat = 0
        for point in stroke.path {
            minX = min(minX, point.location.x)
            minY = min(minY, point.location.y)
            maxX = max(maxX, point.location.x)
            maxY = max(maxY, point.location.y)
            widest = max(widest, point.size.width, point.size.height)
        }
        guard minX <= maxX, minY <= maxY else { return .null }
        // Curves between control points can bulge a little past them.
        return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY).insetBy(dx: -widest, dy: -widest)
    }
}
